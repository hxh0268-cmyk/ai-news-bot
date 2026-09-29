// ニュースの鮮度チェック（STEP1で使う）。
// 各記事の出典から日付を読み取り、対象日（日本時間の CONTENT_DATE）から何日前かを判定する。
//   - 除外: 読み取れた日付がすべて8日以上前（8日未満の出典が1つもない）。件数が足りなくても除外する
//   - 警告: 最も古い日付が4日以上前、または日付が1つも読み取れない。採用するが、PR本文に警告を出す
//   - 問題なし: それ以外（読み取れた日付がすべて3日以内）
// 「最も古い日付」だけで除外すると、当日のイベントでも事前の予告記事が出典にあるだけで
// 除外されてしまうため、除外は「新しい出典が1つもない」場合に限っている。
// 日付の読み取り元は次の3つ：
//   1. 出典URL内の日付（/2026/09/22/、20260915-、2026-09-14 など）
//   2. sourceLine に書かれた日付（「2026年9月10日」など。「9月下旬」のような曖昧な表記は読まない）
//   3. URLに日付がない出典は、ページを取得して公開日のメタデータ（article:published_time 等）を読む
// 2026-09-27〜29の日次確認で、2週間前のニュースが繰り返し選ばれていたことへの対策。
// 日付計算・判定は純粋関数に分けてあり、API呼び出しなしで動作確認できる。

import { fetch as undiciFetch } from "undici";

export const FRESH_MAX_DAYS = 3;
export const WARN_MAX_DAYS = 7; // 最も新しい日付がこれを超える（8日以上前）と除外
export const MIN_ITEMS = 5;
export const MAX_ITEMS = 7;

const DAY_MS = 86400000;

function toUtcMs(y, m, d) {
  const ms = Date.UTC(y, m - 1, d);
  const dt = new Date(ms);
  // 2月30日のような存在しない日付を弾く
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return ms;
}

function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// "2026-09-29" から n 日ずらした日付文字列を返す（プロンプトに具体的な日付を書くために使う）
export function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ymd(toUtcMs(y, m, d) + days * DAY_MS);
}

// 日本時間の今日の日付（YYYY-MM-DD）
export function todayInTokyo(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(now);
}

export function daysBefore(targetDateStr, dateStr) {
  const [ty, tm, td] = targetDateStr.split("-").map(Number);
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.round((toUtcMs(ty, tm, td) - toUtcMs(y, m, d)) / DAY_MS);
}

// 対象日より2日以上先の日付は、記事番号などの誤検出とみなして捨てる
// （米国時間の日付が日本時間より1日遅れる程度のずれは許容する）
function plausible(dateStr, targetDateStr) {
  if (!dateStr) return false;
  const diff = daysBefore(targetDateStr, dateStr);
  return diff >= -1 && diff <= 366;
}

// URLのパスから日付を読み取る。見つからなければ null。
export function extractDateFromUrl(url, targetDateStr) {
  let pathname;
  try {
    const u = new URL(url);
    pathname = u.pathname + u.search;
  } catch {
    return null;
  }
  const found = [];
  // 区切りあり: /2026/9/22/  /2026/09/14-02  2026-09-24
  for (const m of pathname.matchAll(/(?<!\d)(20\d{2})[\/\-_.](\d{1,2})[\/\-_.](\d{1,2})(?!\d)/g)) {
    const ms = toUtcMs(+m[1], +m[2], +m[3]);
    if (ms !== null) found.push(ymd(ms));
  }
  // 区切りなし: 20260915-4972161  /20260916/  20260928153437（14桁のタイムスタンプ）
  for (const m of pathname.matchAll(/(?<!\d)(20\d{2})(\d{2})(\d{2})(?=\d{6}(?!\d)|(?!\d))/g)) {
    const ms = toUtcMs(+m[1], +m[2], +m[3]);
    if (ms !== null) found.push(ymd(ms));
  }
  const valid = found.filter((d) => plausible(d, targetDateStr)).sort();
  return valid[0] || null;
}

// sourceLine（例: 「Reuters、Bloomberg（2026年9月24日〜25日）」）から日付を読み取る。
// 年が省略された「9月25日」は対象日の年とみなし、対象日より先になる場合は前年とみなす。
// 「9月下旬」「2026年9月」のような日単位でない表記は読まない。
export function extractDatesFromSourceLine(sourceLine, targetDateStr) {
  const targetYear = Number(targetDateStr.slice(0, 4));
  const found = [];
  for (const m of String(sourceLine || "").matchAll(/(?:(20\d{2})年\s*)?(\d{1,2})月\s*(\d{1,2})日/g)) {
    let y = m[1] ? +m[1] : targetYear;
    let ms = toUtcMs(y, +m[2], +m[3]);
    if (ms === null) continue;
    if (!m[1] && daysBefore(targetDateStr, ymd(ms)) < -1) ms = toUtcMs(y - 1, +m[2], +m[3]);
    if (ms !== null) found.push(ymd(ms));
  }
  return found.filter((d) => plausible(d, targetDateStr)).sort();
}

// HTMLの公開日メタデータを読み、日本時間の日付（YYYY-MM-DD）で返す。見つからなければ null。
export function extractPublishedDateFromHtml(html) {
  const patterns = [
    /<meta[^>]+(?:property|name)=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']article:published_time["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /<meta[^>]+(?:property|name|itemprop)=["'](?:pubdate|publishdate|datePublished|date)["'][^>]*content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;
    const t = Date.parse(m[1]);
    if (Number.isNaN(t)) continue;
    return todayInTokyo(new Date(t));
  }
  return null;
}

// ページの公開日メタデータが「記事の公開日」を表さないサイト（Wikipediaはページの作成日が入る）
const PAGE_DATE_UNRELIABLE_HOSTS = [/(^|\.)wikipedia\.org$/i];

async function fetchPublishedDate(url, timeoutMs) {
  try {
    const host = new URL(url).hostname;
    if (PAGE_DATE_UNRELIABLE_HOSTS.some((re) => re.test(host))) {
      return { date: null, note: "ページの日付が記事の公開日を表さないサイト" };
    }
    const res = await undiciFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ai-news-bot freshness check)" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { date: null, note: `HTTP ${res.status}` };
    const html = (await res.text()).slice(0, 500000);
    const date = extractPublishedDateFromHtml(html);
    return { date, note: date ? null : "公開日のメタデータなし" };
  } catch (err) {
    return { date: null, note: `取得失敗（${err.name || err.message}）` };
  }
}

// 1記事分の日付を集めて判定する。fetchDate を差し替えれば、ネットワークなしでも試せる。
export async function assessItem(item, targetDateStr, { fetchDate = fetchPublishedDate, timeoutMs = 10000 } = {}) {
  const evidence = [];
  const notes = [];
  for (const s of item.sources || []) {
    const fromUrl = extractDateFromUrl(s.url, targetDateStr);
    if (fromUrl) {
      evidence.push({ date: fromUrl, basis: `URL（${s.name}）` });
      continue;
    }
    const { date, note } = await fetchDate(s.url, timeoutMs);
    if (date && plausible(date, targetDateStr)) evidence.push({ date, basis: `ページの公開日（${s.name}）` });
    else notes.push(`${s.name}: ${note || "日付不明"}`);
  }
  for (const d of extractDatesFromSourceLine(item.sourceLine, targetDateStr)) {
    evidence.push({ date: d, basis: "sourceLine" });
  }

  if (evidence.length === 0) {
    return { status: "unknown", ageDays: null, newestAgeDays: null, oldest: null, newest: null, evidence, notes };
  }
  const oldest = evidence.reduce((a, b) => (a.date <= b.date ? a : b));
  const newest = evidence.reduce((a, b) => (a.date >= b.date ? a : b));
  const ageDays = daysBefore(targetDateStr, oldest.date);
  const newestAgeDays = daysBefore(targetDateStr, newest.date);
  const status = newestAgeDays > WARN_MAX_DAYS ? "exclude" : ageDays > FRESH_MAX_DAYS ? "warn" : "ok";
  return { status, ageDays, newestAgeDays, oldest, newest, evidence, notes };
}

export async function assessItems(items, targetDateStr, options) {
  return Promise.all(items.map((item) => assessItem(item, targetDateStr, options)));
}

// 除外と判定した記事（出典の日付がすべて8日以上前）を除き、importanceを1から振り直す。
// render-cards.mjs は top5 の並び順で cards-x-web/1〜5.webp を作り、render-site.mjs は
// importance の値でその画像を探すため、除外で番号が飛ぶとサムネイルが別の記事に付いてしまう。
export function applyFreshness(items, results) {
  const kept = [];
  const excluded = [];
  items.forEach((item, i) => (results[i].status === "exclude" ? excluded : kept).push({ item, result: results[i] }));
  kept.sort((a, b) => a.item.importance - b.item.importance);
  kept.forEach((k, i) => (k.item = { ...k.item, importance: i + 1 }));
  return { kept, excluded };
}

// PR本文と output/<topic>/<date>/freshness-report.md に載せる文章
export function buildFreshnessReport({ dateStr, kept, excluded }) {
  const fmt = ({ item, result }) => {
    const notes = result.notes.length ? `／未確認: ${result.notes.join("、")}` : "";
    if (!result.oldest) return `- ${item.headline}（日付を確認できず${notes}）`;
    const oldest = `最も古い ${result.oldest.date}（${result.ageDays}日前・${result.oldest.basis}）`;
    const newest =
      result.newest.date === result.oldest.date
        ? ""
        : `、最も新しい ${result.newest.date}（${result.newestAgeDays}日前・${result.newest.basis}）`;
    return `- ${item.headline}（${oldest}${newest}${notes}）`;
  };
  const warned = kept.filter((k) => k.result.status === "warn");
  const unknown = kept.filter((k) => k.result.status === "unknown");

  const lines = [`### ニュースの鮮度チェック（対象日 ${dateStr}・日本時間）`, ""];
  lines.push(`採用 ${kept.length}件 / 除外 ${excluded.length}件。出典のURL・sourceLine・ページの公開日から日付を読み取り、すべて${WARN_MAX_DAYS + 1}日以上前なら除外、最も古い日付が${FRESH_MAX_DAYS + 1}日以上前なら警告としています。`);
  lines.push("");
  if (warned.length === 0 && unknown.length === 0 && excluded.length === 0) {
    lines.push(`✅ 全件が${FRESH_MAX_DAYS}日以内でした。`);
  }
  if (warned.length > 0) {
    lines.push(`⚠️ **最も古い出典が${FRESH_MAX_DAYS + 1}日以上前のニュース（やや古い・採用中）**`, ...warned.map(fmt), "");
  }
  if (unknown.length > 0) {
    lines.push("⚠️ **日付を確認できなかったニュース（採用中・要確認）**", ...unknown.map(fmt), "");
  }
  if (excluded.length > 0) {
    lines.push(`🚫 **出典の日付がすべて${WARN_MAX_DAYS + 1}日以上前のため自動で除外したニュース**`, ...excluded.map(fmt), "");
  }
  return lines.join("\n").trim() + "\n";
}
