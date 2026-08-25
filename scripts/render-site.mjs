// STEP2.5: 広告枠・開示表記付きサイトを生成する（話題対応版）
// 出力: docs/<topic>/index.html
import fs from "node:fs";
import path from "node:path";
import { loadTopic } from "./topic-context.mjs";

const { topic, sponsor, outputDir, docsDir, dateStr } = loadTopic();
const ADSENSE_CLIENT_ID = process.env.ADSENSE_CLIENT_ID || "";
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || "";

function gaSnippet() {
  if (!GA_MEASUREMENT_ID) return "";
  return `
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA_MEASUREMENT_ID}');
</script>`;
}

function adSlot(slotIndex) {
  if (!ADSENSE_CLIENT_ID) {
    return `<div class="ad-slot ad-placeholder">広告枠（AdSense未設定）</div>`;
  }
  return `
  <div class="ad-slot">
    <ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE_CLIENT_ID}" data-ad-slot="${slotIndex}" data-ad-format="auto" data-full-width-responsive="true"></ins>
    <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
  </div>`;
}

function renderArticle(item, index) {
  const showAd = index === 2;
  return `
  <article class="card" style="--cat:${item.catColor}">
    <span class="tag">${item.category}</span>
    <h2>${item.headline}</h2>
    <p class="dek">${item.dek}</p>
    ${(item.body || []).map((p) => `<p>${p}</p>`).join("\n")}
    <div class="why"><b>なぜ重要か</b><p>${item.why}</p></div>
    <div class="source-line">出典：${item.sourceLine}</div>
  </article>
  ${showAd ? adSlot(1) : ""}`;
}

function buildHtml(data) {
  const disclosureLines = [
    "本サイトはアフィリエイトプログラムによる収益を得ている場合があります。",
    "本サイトはGoogle AdSense等の広告配信サービスを利用しています。",
  ];
  if (sponsor) disclosureLines.unshift(`【PR】本日の記事は${sponsor.name}提供でお届けしています。`);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>今日の${topic.displayName} - ${dateStr}</title>
${gaSnippet()}
${ADSENSE_CLIENT_ID ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}" crossorigin="anonymous"></script>` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root{--ink:#151A2E;--paper:#EAF0F2;--slate:#3C4257;--slate-soft:#6B7280;}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--paper);color:var(--slate);font-family:'Zen Kaku Gothic New',sans-serif;line-height:1.85;}
  header{background:var(--ink);color:var(--paper);padding:40px 24px;}
  header h1{font-family:'Shippori Mincho',serif;font-size:28px;margin:0 0 6px;}
  .wrap{max-width:680px;margin:0 auto;padding:24px;}
  .disclosure{background:#fff8e6;border:1px solid #F4B942;border-radius:6px;padding:14px 18px;font-size:13px;color:#6B5A1E;margin-bottom:28px;}
  .disclosure p{margin:4px 0;}
  .card{background:#fff;border-radius:8px;padding:26px;margin-bottom:20px;border-top:4px solid var(--cat,#1F8A83);}
  .tag{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--cat,#1F8A83);text-transform:uppercase;}
  h2{font-family:'Shippori Mincho',serif;font-size:22px;margin:10px 0;color:var(--ink);}
  .dek{color:var(--slate-soft);font-size:14px;}
  .why{background:var(--ink);color:#fff;border-radius:6px;padding:16px 18px;margin-top:16px;font-size:14px;}
  .why b{display:block;color:#F4B942;font-size:11px;margin-bottom:6px;}
  .source-line{font-size:12px;color:var(--slate-soft);margin-top:16px;font-family:'JetBrains Mono',monospace;}
  a{color:#1F8A83;}
  .ad-slot{margin:24px 0;text-align:center;}
  .ad-placeholder{background:#DCE6E8;color:#6B7280;font-size:12px;padding:40px 10px;border-radius:6px;font-family:'JetBrains Mono',monospace;}
</style>
</head>
<body>
<header><h1>今日の${topic.displayName}</h1><p>${dateStr}</p></header>
<div class="wrap">
  <div class="disclosure">${disclosureLines.map((l) => `<p>${l}</p>`).join("")}</div>
  ${data.map((item, i) => renderArticle(item, i)).join("\n")}
</div>
</body>
</html>`;
}

function main() {
  const data = JSON.parse(fs.readFileSync(path.join(outputDir, "data.json"), "utf-8"));
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, "index.html"), buildHtml(data), "utf-8");
  console.log(`生成しました: docs/${topic.slug}/index.html`);
}

main();
