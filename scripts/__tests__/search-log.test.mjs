import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SEARCH_LOG_FILENAME,
  extractSearches,
  normalizeUrl,
  checkSources,
  buildSearchLog,
  saveSearchLog,
} from "../search-log.mjs";

// APIの応答（web_search_20250305）の形を模したcontent
function mockContent() {
  return [
    { type: "text", text: "本日のAIニュースを検索します。" },
    { type: "server_tool_use", id: "srvtoolu_01", name: "web_search", input: { query: "AI news September 29 2026" } },
    {
      type: "web_search_tool_result",
      tool_use_id: "srvtoolu_01",
      content: [
        { type: "web_search_result", url: "https://www.example.com/news/ai-chip/", title: "AI chip news", encrypted_content: "EqgfCioIARgB...", page_age: "September 29, 2026" },
        { type: "web_search_result", url: "https://news.example.org/a?id=1", title: "Policy update", encrypted_content: "Eo8BCioIAhgB..." },
      ],
    },
    { type: "server_tool_use", id: "srvtoolu_02", name: "web_search", input: { query: "OpenAI announcement" } },
    { type: "web_search_tool_result", tool_use_id: "srvtoolu_02", content: { type: "web_search_tool_result_error", error_code: "too_many_requests" } },
    { type: "server_tool_use", id: "srvtoolu_03", name: "web_search", input: { query: "AI chip export" } },
    {
      type: "web_search_tool_result",
      tool_use_id: "srvtoolu_03",
      content: [{ type: "web_search_result", url: "https://www.example.com/news/ai-chip/", title: "AI chip news", encrypted_content: "x", page_age: "1 day ago" }],
    },
    { type: "server_tool_use", id: "srvtoolu_04", name: "web_search", input: { query: "no hits query" } },
    { type: "web_search_tool_result", tool_use_id: "srvtoolu_04", content: [] },
    {
      type: "text",
      text: "まとめます。",
      citations: [{ type: "web_search_result_location", url: "https://cited-only.example.net/", title: "t", cited_text: "..." }],
    },
    { type: "tool_use", id: "toolu_01", name: "submit_news_items", input: { items: [] } },
  ];
}

const mockItems = [
  {
    importance: 1,
    headline: "見出し1",
    sources: [
      { name: "Example", url: "https://www.example.com/news/ai-chip/" }, // 完全一致
      { name: "Example Org", url: "http://news.example.org/a?id=1&utm_source=x#top" }, // 揃えると一致
    ],
  },
  { importance: 2, headline: "見出し2", sources: [{ name: "Cited", url: "https://cited-only.example.net/" }] }, // 引用にだけあり、検索結果にない
  { importance: 3, headline: "見出し3", sources: [{ name: "壊れたURL", url: "not a url" }] },
  { importance: 4, headline: "出典なし" },
];

test("extractSearches: 検索した言葉と、結果のURL・タイトル・page_ageだけを取り出す（本文の抜粋は含めない）", () => {
  const searches = extractSearches(mockContent());
  assert.equal(searches.length, 4);
  assert.deepEqual(searches[0], {
    query: "AI news September 29 2026",
    status: "ok",
    error_code: null,
    results: [
      { url: "https://www.example.com/news/ai-chip/", title: "AI chip news", page_age: "September 29, 2026" },
      { url: "https://news.example.org/a?id=1", title: "Policy update", page_age: null },
    ],
  });
  assert.equal(JSON.stringify(searches).includes("encrypted_content"), false);
  assert.equal(JSON.stringify(searches).includes("EqgfCioIARgB"), false);
});

test("extractSearches: 検索エラー・0件・結果のブロックが無い場合・対応する検索が無い結果", () => {
  const searches = extractSearches(mockContent());
  assert.deepEqual(searches[1], { query: "OpenAI announcement", status: "error", error_code: "too_many_requests", results: [] });
  assert.deepEqual(searches[3], { query: "no hits query", status: "ok", error_code: null, results: [] });

  const odd = extractSearches([
    { type: "server_tool_use", id: "a", name: "web_search", input: { query: "q" } },
    { type: "web_search_tool_result", tool_use_id: "zzz", content: [{ type: "web_search_result", url: "https://x.example/", title: "x" }] },
  ]);
  assert.equal(odd.length, 2);
  assert.equal(odd[0].status, "no_result");
  assert.equal(odd[1].query, null);
  assert.equal(odd[1].results[0].url, "https://x.example/");
});

test("extractSearches: contentが配列でなくても例外にしない", () => {
  assert.deepEqual(extractSearches(undefined), []);
  assert.deepEqual(extractSearches(null), []);
  assert.deepEqual(extractSearches([null, 1, "x"]), []);
});

test("normalizeUrl: スキーム・www・末尾の/・#・utm_*の違いを揃える", () => {
  assert.equal(normalizeUrl("https://www.Example.com/a/b/"), "example.com/a/b");
  assert.equal(normalizeUrl("http://example.com/a/b#x"), "example.com/a/b");
  assert.equal(normalizeUrl("https://example.com/a?id=1&utm_medium=y"), "example.com/a?id=1");
  assert.notEqual(normalizeUrl("https://example.com/a?id=1"), normalizeUrl("https://example.com/a?id=2"));
  assert.notEqual(normalizeUrl("https://example.com/a"), normalizeUrl("https://example.com/a/c"));
  assert.equal(normalizeUrl("not a url"), null);
  assert.equal(normalizeUrl(undefined), null);
});

test("checkSources: 出典URLが検索結果に含まれていたか（完全一致・揃えると一致・含まれていない）", () => {
  const articles = checkSources(mockItems, extractSearches(mockContent()));
  assert.equal(articles.length, 4);

  const [exact, normalized] = articles[0].sources;
  assert.equal(exact.in_search_results, true);
  assert.equal(exact.match, "exact");
  assert.deepEqual(exact.found_by_queries.sort(), ["AI chip export", "AI news September 29 2026"]);
  assert.equal(normalized.in_search_results, true);
  assert.equal(normalized.match, "normalized");
  assert.deepEqual(normalized.found_by_queries, ["AI news September 29 2026"]);

  // 文章中の引用（citations）にだけあるURLは、検索結果に含まれていたとはみなさない
  assert.equal(articles[1].sources[0].in_search_results, false);
  assert.equal(articles[1].sources[0].match, null);
  assert.equal(articles[2].sources[0].in_search_results, false);
  assert.deepEqual(articles[3].sources, []);
});

test("buildSearchLog: 集計が合っている", () => {
  const log = buildSearchLog({ dateStr: "2026-10-01", topicSlug: "ai-news", content: mockContent(), items: mockItems });
  assert.equal(log.date, "2026-10-01");
  assert.equal(log.topic, "ai-news");
  assert.deepEqual(log.summary, {
    searches: 4,
    search_errors: 1,
    results: 3,
    sources: 4,
    sources_in_search_results: 2,
    sources_not_in_search_results: 2,
  });
});

test("saveSearchLog: 保存できた場合はsearch-log.jsonを書き、trueを返す", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "search-log-"));
  const ok = saveSearchLog({ outputDir: dir, dateStr: "2026-10-01", topicSlug: "ai-news", content: mockContent(), items: mockItems });
  assert.equal(ok, true);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, SEARCH_LOG_FILENAME), "utf-8"));
  assert.equal(saved.summary.searches, 4);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("saveSearchLog: 保存・作成に失敗しても例外を投げず、警告を出してfalseを返す", (t) => {
  const warnings = [];
  t.mock.method(console, "warn", (msg) => warnings.push(msg));

  // 書き込み先がディレクトリ（EISDIR）
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "search-log-"));
  fs.mkdirSync(path.join(dir, SEARCH_LOG_FILENAME));
  assert.equal(saveSearchLog({ outputDir: dir, dateStr: "d", topicSlug: "t", content: mockContent(), items: mockItems }), false);

  // 書き込み先のフォルダが無い（ENOENT）
  assert.equal(saveSearchLog({ outputDir: path.join(dir, "missing"), dateStr: "d", topicSlug: "t", content: [], items: [] }), false);

  // 記録を作る途中で例外（想定外の形の応答）
  const broken = [{ get type() { throw new Error("broken block"); } }];
  assert.equal(saveSearchLog({ outputDir: dir, dateStr: "d", topicSlug: "t", content: broken, items: mockItems }), false);

  assert.equal(warnings.length, 3);
  assert.ok(warnings.every((w) => w.includes("生成はこのまま続けます")));
  fs.rmSync(dir, { recursive: true, force: true });
});
