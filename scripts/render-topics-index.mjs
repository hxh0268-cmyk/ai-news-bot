// GitHub Pagesのサイトルート（docs/index.html）を生成する。
// config/topics/*.json を全件走査するため、話題を追加してもこのスクリプト自体の
// 編集は不要（config/topics/にJSONを1つ追加するだけで一覧に反映される）。
//
// 実行タイミング: publish.yml で、いずれかのトピックのcontent PRがマージされた
// 直後（そのトピックの docs/<topic>/** がmainに反映された直後）に毎回再生成する。
// generate.yml側（マージ前のPR段階）では実行しない。他トピックの最新状態を含めた
// 横断集計になるため、まだレビュー前の内容を参照してしまう可能性があるため。
import fs from "node:fs";
import path from "node:path";

const SITE_URL = process.env.SITE_URL || "https://hxh0268-cmyk.github.io/ai-news-bot";
const root = process.cwd();
const topicsDir = path.join(root, "config", "topics");
const docsRoot = path.join(root, "docs");

function loadTopics() {
  const files = fs
    .readdirSync(topicsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(topicsDir, f), "utf-8")));
}

// manifest.jsonはrender-site.mjs側で新しい日付が先頭に来るようソート済みのため、
// 先頭要素がそのまま「最終更新」になる。トピック登録直後でまだ一度も記事が
// マージされていない場合はmanifest自体が存在しないため null を返す。
function latestEntryFor(slug) {
  const manifestPath = path.join(docsRoot, slug, "archive", "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    return manifest[0] || null;
  } catch {
    return null;
  }
}

function escAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}

// まだ記事が一度もマージされていないトピックは、存在しないURL（docs/<slug>/）への
// リンクを貼らないよう、リンク無しの「準備中」カードとして表示する。
function topicCardHtml(topic) {
  const latest = latestEntryFor(topic.slug);
  const description = topic.description || "";

  const titleHtml = latest
    ? `<h2><a href="${topic.slug}/">${topic.displayName}</a></h2>`
    : `<h2>${topic.displayName}</h2>`;

  const metaHtml = latest
    ? `<p class="meta">最終更新: ${latest.date}${latest.topHeadline ? ` ・ ${escAttr(latest.topHeadline)}` : ""}</p>`
    : `<p class="meta meta-pending">準備中（まだ記事がありません）</p>`;

  return `
  <article class="card">
    ${titleHtml}
    ${description ? `<p class="desc">${escAttr(description)}</p>` : ""}
    ${metaHtml}
  </article>`;
}

function buildHtml(topics) {
  const cards = topics.map(topicCardHtml).join("\n");
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#151A2E">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23151A2E'/><text x='50%25' y='54%25' font-size='20' text-anchor='middle' dominant-baseline='middle' fill='%231F8A83' font-family='monospace' font-weight='bold'>AI</text></svg>">
<title>AI News Bot - トピック一覧</title>
<meta name="description" content="自動生成される複数トピックのニュースダイジェスト一覧。">
<link rel="canonical" href="${SITE_URL}/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root{--ink:#151A2E;--paper:#EAF0F2;--slate:#3C4257;--slate-soft:#6B7280;}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--paper);color:var(--slate);font-family:'Zen Kaku Gothic New',sans-serif;line-height:1.85;}
  header{background:var(--ink);color:var(--paper);padding:40px 24px;}
  header h1{font-family:'Shippori Mincho',serif;font-size:28px;margin:0 0 6px;}
  header p{margin:0;font-size:13px;color:rgba(234,240,242,0.7);}
  .wrap{max-width:680px;margin:0 auto;padding:24px;}
  .card{background:#fff;border-radius:8px;padding:24px;margin-bottom:16px;border-top:4px solid #1F8A83;}
  .card h2{font-family:'Shippori Mincho',serif;font-size:20px;margin:0 0 8px;color:var(--ink);}
  .card h2 a{color:inherit;text-decoration:none;}
  .card h2 a:hover{text-decoration:underline;}
  .desc{font-size:14px;color:var(--slate-soft);margin:0 0 10px;}
  .meta{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--slate-soft);margin:0;}
  .meta-pending{color:#B08800;}
  footer{max-width:680px;margin:40px auto 0;padding:24px;font-size:12px;color:var(--slate-soft);border-top:1px solid #DCE6E8;}
</style>
</head>
<body>
<header>
  <div style="max-width:680px;margin:0 auto;padding:0 24px;">
    <h1>AI News Bot</h1>
    <p>自動生成ニュースダイジェスト・トピック一覧</p>
  </div>
</header>
<main class="wrap">
${cards}
</main>
<footer>
  <p>このページは config/topics/ の設定から自動生成されています。</p>
</footer>
</body>
</html>`;
}

function main() {
  const topics = loadTopics();
  fs.mkdirSync(docsRoot, { recursive: true });
  fs.writeFileSync(path.join(docsRoot, "index.html"), buildHtml(topics), "utf-8");
  console.log(`生成しました: docs/index.html（トピック${topics.length}件）`);
}

main();
