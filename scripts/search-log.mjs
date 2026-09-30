// STEP1（ニュース収集）でClaudeが行ったWeb検索の記録を、output/<topic>/<date>/search-log.json に保存する。
// 目的: data.jsonの出典URLが実際の検索結果に含まれていたかを後から確認できるようにする
// （2026-09-29の調査で、出典にない記述がSTEP1の下書き段階で入っていると判明したことへの第2段階の対応「C3」）。
//
// - 検索1回ごとに、検索した言葉と、検索結果のURL・タイトル・page_ageだけを残す
//   （本文の抜粋 encrypted_content は保存しない。ファイルが大きくなりすぎないようにするため）
// - data.jsonの各記事の出典URLが検索結果に含まれていたかを記録する
// - この記録は保存するだけで、後続の処理（書き直し・note記事・カード・サイト）には渡さない
// - 記録の作成・保存に失敗しても生成は止めず、警告だけ出す（saveSearchLog）
//
// APIの応答の形（web_search_20250305）:
//   { type: "server_tool_use", id, name: "web_search", input: { query } }
//   { type: "web_search_tool_result", tool_use_id, content: [ { type: "web_search_result", url, title, page_age, encrypted_content } ] }
//   検索でエラーが起きた場合は content が配列ではなく { type: "web_search_tool_result_error", error_code } になる。

import fs from "node:fs";
import path from "node:path";

export const SEARCH_LOG_FILENAME = "search-log.json";

// 応答のcontentから、検索1回ごとの { query, status, error_code, results } を取り出す。
// status: "ok"（結果あり・0件も含む）/ "error"（検索エラー）/ "no_result"（結果のブロックが応答に無い）
export function extractSearches(content) {
  const blocks = Array.isArray(content) ? content : [];
  const searches = [];
  const byId = new Map();

  for (const b of blocks) {
    if (b?.type !== "server_tool_use" || b.name !== "web_search") continue;
    const s = {
      query: typeof b.input?.query === "string" ? b.input.query : null,
      status: "no_result",
      error_code: null,
      results: [],
    };
    searches.push(s);
    if (b.id) byId.set(b.id, s);
  }

  for (const b of blocks) {
    if (b?.type !== "web_search_tool_result") continue;
    let s = byId.get(b.tool_use_id);
    if (!s) {
      // 対応する検索のブロックが見つからない結果も、捨てずに残す
      s = { query: null, status: "no_result", error_code: null, results: [] };
      searches.push(s);
    }
    if (Array.isArray(b.content)) {
      s.status = "ok";
      for (const r of b.content) {
        if (r?.type !== "web_search_result") continue;
        s.results.push({ url: r.url ?? null, title: r.title ?? null, page_age: r.page_age ?? null });
      }
    } else {
      s.status = "error";
      s.error_code = b.content?.error_code ?? "unknown";
    }
  }
  return searches;
}

// 照合用にURLを揃える。スキーム・ホスト名の大文字小文字・先頭の「www.」・末尾の「/」・
// 「#」以降・utm_*パラメータの違いは同じURLとみなす。URLとして読めなければnull。
export function normalizeUrl(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const u = new URL(url.trim());
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key)) u.searchParams.delete(key);
    }
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = u.pathname.replace(/\/+$/, "");
    return `${host}${pathname}${u.search}`;
  } catch {
    return null;
  }
}

// data.jsonの各記事の出典URLが、検索結果に含まれていたかを調べる。
// match: "exact"（完全一致）/ "normalized"（normalizeUrlで揃えると一致）/ null（含まれていなかった）
export function checkSources(items, searches) {
  const exact = new Map();
  const normalized = new Map();
  for (const s of searches) {
    for (const r of s.results) {
      if (typeof r.url !== "string") continue;
      if (!exact.has(r.url)) exact.set(r.url, new Set());
      exact.get(r.url).add(s.query);
      const n = normalizeUrl(r.url);
      if (!n) continue;
      if (!normalized.has(n)) normalized.set(n, new Set());
      normalized.get(n).add(s.query);
    }
  }

  return (Array.isArray(items) ? items : []).map((item) => ({
    importance: item?.importance ?? null,
    headline: item?.headline ?? null,
    sources: (Array.isArray(item?.sources) ? item.sources : []).map((src) => {
      const url = src?.url ?? null;
      let match = null;
      let queries = null;
      if (typeof url === "string" && exact.has(url)) {
        match = "exact";
        queries = exact.get(url);
      } else {
        const n = normalizeUrl(url);
        if (n && normalized.has(n)) {
          match = "normalized";
          queries = normalized.get(n);
        }
      }
      return {
        name: src?.name ?? null,
        url,
        in_search_results: match !== null,
        match,
        found_by_queries: queries ? [...queries] : [],
      };
    }),
  }));
}

export function buildSearchLog({ dateStr, topicSlug, content, items }) {
  const searches = extractSearches(content);
  const articles = checkSources(items, searches);
  const allSources = articles.flatMap((a) => a.sources);
  const found = allSources.filter((s) => s.in_search_results).length;
  return {
    date: dateStr,
    topic: topicSlug,
    summary: {
      searches: searches.length,
      search_errors: searches.filter((s) => s.status === "error").length,
      results: searches.reduce((n, s) => n + s.results.length, 0),
      sources: allSources.length,
      sources_in_search_results: found,
      sources_not_in_search_results: allSources.length - found,
    },
    searches,
    articles,
  };
}

// 記録を作って保存する。どこで失敗しても例外は投げず、警告を出してfalseを返す（生成は止めない）。
export function saveSearchLog({ outputDir, dateStr, topicSlug, content, items }) {
  try {
    const log = buildSearchLog({ dateStr, topicSlug, content, items });
    fs.writeFileSync(path.join(outputDir, SEARCH_LOG_FILENAME), JSON.stringify(log, null, 2) + "\n", "utf-8");
    const { summary } = log;
    console.log(
      `検索の記録を ${SEARCH_LOG_FILENAME} に保存しました（検索${summary.searches}回・結果${summary.results}件、` +
        `出典${summary.sources}件のうち検索結果に含まれていた${summary.sources_in_search_results}件・含まれていなかった${summary.sources_not_in_search_results}件）。`
    );
    return true;
  } catch (err) {
    console.warn(`⚠️ 検索の記録（${SEARCH_LOG_FILENAME}）を保存できませんでした。生成はこのまま続けます: ${err.message}`);
    return false;
  }
}
