// STEP2.5: 広告枠・開示表記付きサイトを生成する（話題対応版）
// 出力: docs/<topic>/index.html, docs/<topic>/privacy.html
import fs from "node:fs";
import path from "node:path";
import { loadTopic } from "./topic-context.mjs";

const { topic, sponsor, outputDir, docsDir, dateStr } = loadTopic();
const ADSENSE_CLIENT_ID = process.env.ADSENSE_CLIENT_ID || "";
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || "";

// サイトの公開URL。カスタムドメインを設定した場合はここを変更してください。
const SITE_URL = process.env.SITE_URL || "https://hxh0268-cmyk.github.io/ai-news-bot";
const PAGE_URL = `${SITE_URL}/${topic.slug}/`;
const PRIVACY_URL = `${SITE_URL}/${topic.slug}/privacy.html`;

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

// AdSense未設定の間は、訪問者に「未設定」という内部向け文言を見せないよう、
// 見た目には何も表示しない（HTMLコメントとしてだけ位置を残す＝開発者が探せば分かる）。
function adSlot(slotIndex) {
  if (!ADSENSE_CLIENT_ID) {
    return `<!-- ad-slot ${slotIndex}: AdSense未設定のため非表示 -->`;
  }
  return `
  <div class="ad-slot">
    <ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE_CLIENT_ID}" data-ad-slot="${slotIndex}" data-ad-format="auto" data-full-width-responsive="true"></ins>
    <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
  </div>`;
}

// meta description / OGP用の要約文。1本目の記事のdekを軸に組み立てる。
function buildPageDescription(data) {
  const first = data[0];
  const headlines = data.slice(0, 3).map((d) => d.headline).join("、");
  return first ? `${dateStr}の${topic.displayName}まとめ。${headlines}など、注目トピックを厳選して紹介。` : `${dateStr}の${topic.displayName}まとめ。`;
}

// 一覧ページ全体を、簡易的なNewsArticleのItemListとして構造化データ化する。
// 検索エンジンにニュース記事の集まりであることを伝え、リッチリザルトの対象になりやすくする。
function buildStructuredData(data) {
  const itemListElement = data.map((item, i) => ({
    "@type": "ListItem",
    position: i + 1,
    item: {
      "@type": "NewsArticle",
      headline: item.headline,
      description: item.dek,
      datePublished: dateStr,
    },
  }));
  const json = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `今日の${topic.displayName} - ${dateStr}`,
    itemListElement,
  };
  return `<script type="application/ld+json">${JSON.stringify(json)}</script>`;
}

function renderArticle(item, index) {
  const showAd = index === 2;
  return `
  <article class="card" style="--cat:${item.catColor}">
    <span class="tag">${item.category}</span>
    <h2>${item.headline}</h2>
    <p class="dek">${item.dek}</p>
    ${(item.body || []).map((p) => `<p>${p}</p>`).join("\n")}
    <div class="why"><h3>なぜ重要か</h3><p>${item.why}</p></div>
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

  const pageTitle = `今日の${topic.displayName} - ${dateStr}`;
  const description = buildPageDescription(data);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${pageTitle}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${PAGE_URL}">

<meta property="og:type" content="website">
<meta property="og:title" content="${pageTitle}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${PAGE_URL}">
<meta property="og:site_name" content="${topic.displayName}">
<meta property="og:locale" content="ja_JP">

<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${pageTitle}">
<meta name="twitter:description" content="${description}">

${buildStructuredData(data)}

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
  .why h3{display:block;color:#F4B942;font-size:11px;margin:0 0 6px;font-weight:700;font-family:'Zen Kaku Gothic New',sans-serif;}
  .source-line{font-size:12px;color:var(--slate-soft);margin-top:16px;font-family:'JetBrains Mono',monospace;}
  a{color:#1F8A83;}
  .ad-slot{margin:24px 0;text-align:center;}
  footer{max-width:680px;margin:40px auto 0;padding:24px;font-size:12px;color:var(--slate-soft);border-top:1px solid #DCE6E8;}
  footer a{color:var(--slate-soft);text-decoration:underline;}
</style>
</head>
<body>
<header><h1>今日の${topic.displayName}</h1><p>${dateStr}</p></header>
<main class="wrap">
  <div class="disclosure">${disclosureLines.map((l) => `<p>${l}</p>`).join("")}</div>
  ${data.map((item, i) => renderArticle(item, i)).join("\n")}
</main>
<footer>
  <p>© ${new Date(dateStr).getFullYear()} 今日の${topic.displayName}</p>
  <p><a href="privacy.html">プライバシーポリシー・広告について</a></p>
</footer>
</body>
</html>`;
}

// AdSenseの利用規約で必須とされる、プライバシーポリシー・広告に関する説明ページ。
// サイト側の事情に合わせて文言は適宜調整してください。
function buildPrivacyHtml() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>プライバシーポリシー・広告について - 今日の${topic.displayName}</title>
<meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  body{margin:0;background:#EAF0F2;color:#3C4257;font-family:'Zen Kaku Gothic New',sans-serif;line-height:1.85;}
  .wrap{max-width:680px;margin:0 auto;padding:40px 24px;}
  h1{font-size:22px;color:#151A2E;}
  h2{font-size:16px;color:#151A2E;margin-top:32px;}
  a{color:#1F8A83;}
</style>
</head>
<body>
<main class="wrap">
  <h1>プライバシーポリシー・広告について</h1>

  <h2>広告の配信について</h2>
  <p>本サイトは、第三者配信の広告サービス（Google AdSense等）を利用しています。このような広告配信事業者は、ユーザーの興味に応じた広告を表示するためにCookie（クッキー）を使用することがあります。</p>

  <h2>アフィリエイトプログラムについて</h2>
  <p>本サイトは、Amazonアソシエイトプログラムをはじめとする各種アフィリエイトプログラムに参加しており、これにより収益を得ている場合があります。</p>

  <h2>アクセス解析ツールについて</h2>
  <p>本サイトでは、サイトの利用状況を把握するためにGoogleアナリティクス等のアクセス解析ツールを使用することがあります。これらのツールはCookieを利用してデータを収集しますが、個人を特定する情報は含まれません。</p>

  <h2>お問い合わせ</h2>
  <p>本サイトの内容に関するお問い合わせは、リポジトリのIssueよりお願いいたします。</p>

  <p><a href="index.html">トップページに戻る</a></p>
</main>
</body>
</html>`;
}

function main() {
  const data = JSON.parse(fs.readFileSync(path.join(outputDir, "data.json"), "utf-8"));
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, "index.html"), buildHtml(data), "utf-8");
  fs.writeFileSync(path.join(docsDir, "privacy.html"), buildPrivacyHtml(), "utf-8");
  console.log(`生成しました: docs/${topic.slug}/index.html, docs/${topic.slug}/privacy.html`);
}

main();
