// STEP2.5: 広告枠・開示表記付きサイトを生成する（話題対応版）
// 出力:
//   docs/<topic>/index.html            … 最新版（毎日上書き）
//   docs/<topic>/archive/<date>.html   … 日付ごとの永久保存版（SEO資産・シェア用の固定URL）
//   docs/<topic>/archive/index.html    … 過去記事一覧（バックナンバー）
//   docs/<topic>/archive/manifest.json … アーカイブの管理台帳
//   docs/<topic>/images/<date>/*.png   … サムネイル画像（日付別フォルダで過去分と衝突しない）
//   docs/<topic>/privacy.html          … プライバシーポリシー
//   docs/<topic>/feed.xml              … RSSフィード
//   docs/<topic>/sitemap.xml           … サイトマップ
//   docs/robots.txt                    … クローラー向け設定（docs直下＝サイトルート想定）
import fs from "node:fs";
import path from "node:path";
import { loadTopic } from "./topic-context.mjs";

const { topic, sponsor, outputDir, docsDir, dateStr } = loadTopic();
const ADSENSE_CLIENT_ID = process.env.ADSENSE_CLIENT_ID || "";
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || "";

// サイトの公開URL。カスタムドメインを設定した場合はここを変更してください。
const SITE_URL = process.env.SITE_URL || "https://hxh0268-cmyk.github.io/ai-news-bot";
const TOPIC_URL = `${SITE_URL}/${topic.slug}`;
const PAGE_URL = `${TOPIC_URL}/`;
const ARCHIVE_INDEX_URL = `${TOPIC_URL}/archive/`;
const archiveUrlFor = (date) => `${TOPIC_URL}/archive/${date}.html`;

const archiveDir = path.join(docsDir, "archive");
const manifestPath = path.join(archiveDir, "manifest.json");
const imagesDateDir = path.join(docsDir, "images", dateStr);

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

// meta description / OGP用の要約文。上位3本の見出しを軸に組み立てる。
function buildPageDescription(data) {
  const headlines = data.slice(0, 3).map((d) => d.headline).join("、");
  return data[0] ? `${dateStr}の${topic.displayName}まとめ。${headlines}など、注目トピックを厳選して紹介。` : `${dateStr}の${topic.displayName}まとめ。`;
}

function escAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}

// top5.jsonはimportanceの値で昇順ソートされているため、cards/{importance}.png が
// その記事のサムネイルとして一意に対応する。日付別フォルダにコピーすることで、
// 過去のアーカイブページの画像を後日の実行で上書きしてしまう事故を防ぐ。
function copyThumbnails(data) {
  const srcDir = path.join(outputDir, "cards");
  if (!fs.existsSync(srcDir)) return new Set();

  fs.mkdirSync(imagesDateDir, { recursive: true });
  const copied = new Set();
  for (const item of data) {
    if (!item.importance || item.importance > 5) continue;
    const srcPath = path.join(srcDir, `${item.importance}.png`);
    if (!fs.existsSync(srcPath)) continue;
    fs.copyFileSync(srcPath, path.join(imagesDateDir, `${item.importance}.png`));
    copied.add(item.importance);
  }
  return copied;
}

// 画像がない記事（importance 6〜7など）でも見た目の一貫性が崩れないよう、
// カテゴリカラーを使ったグラデーションのプレースホルダーを表示する。
function thumbnailHtml(item, thumbnails, imgBasePath) {
  if (thumbnails.has(item.importance)) {
    return `<img class="thumb" src="${imgBasePath}images/${dateStr}/${item.importance}.png" alt="${escAttr(item.headline)}" loading="lazy" width="1080" height="1350">`;
  }
  return `<div class="thumb thumb-placeholder" style="background:linear-gradient(160deg,${item.catColor} 0%,var(--ink) 100%)" role="img" aria-label="${escAttr(item.headline)}"><span>${escAttr(item.category)}</span></div>`;
}

// X / LINE / はてなブックマークへのシェアリンク。SNS経由の流入導線を増やす。
function shareButtonsHtml(item, permalink) {
  const url = encodeURIComponent(permalink);
  const text = encodeURIComponent(item.headline);
  return `
    <div class="share-row">
      <a class="share-btn" href="https://twitter.com/intent/tweet?url=${url}&text=${text}" target="_blank" rel="noopener noreferrer">Xでシェア</a>
      <a class="share-btn" href="https://social-plugins.line.me/lineit/share?url=${url}" target="_blank" rel="noopener noreferrer">LINEで送る</a>
      <a class="share-btn" href="https://b.hatena.ne.jp/entry/${url}" target="_blank" rel="noopener noreferrer">はてブ</a>
    </div>`;
}

function renderArticle(item, index, thumbnails, imgBasePath, permalinkBase) {
  const anchorId = `article-${index + 1}`;
  const permalink = `${permalinkBase}#${anchorId}`;
  return `
  <article class="card" id="${anchorId}" style="--cat:${item.catColor}">
    ${thumbnailHtml(item, thumbnails, imgBasePath)}
    <span class="tag">${item.category}</span>
    <h2>${item.headline}</h2>
    <p class="dek">${item.dek}</p>
    ${(item.body || []).map((p) => `<p>${p}</p>`).join("\n")}
    <div class="why"><h3>なぜ重要か</h3><p>${item.why}</p></div>
    <div class="source-line">出典：${item.sourceLine}</div>
    ${shareButtonsHtml(item, permalink)}
  </article>`;
}

// ページ冒頭の目次。長いページの見通しを良くし、直帰率の改善を狙う。
function buildToc(data) {
  const items = data.map((item, i) => `<li><a href="#article-${i + 1}">${item.headline}</a></li>`).join("");
  return `<nav class="toc" aria-label="目次"><h2>目次</h2><ol>${items}</ol></nav>`;
}

// 記事一覧＋広告枠を組み立てる。7記事に対して広告を3箇所（2本目・4本目・6本目の後）に分散配置。
function buildArticlesWithAds(data, thumbnails, imgBasePath, permalinkBase) {
  const adAfterIndex = new Set([1, 3, 5]);
  let adCounter = 0;
  return data
    .map((item, i) => {
      const article = renderArticle(item, i, thumbnails, imgBasePath, permalinkBase);
      if (adAfterIndex.has(i)) {
        adCounter += 1;
        return `${article}\n  ${adSlot(adCounter)}`;
      }
      return article;
    })
    .join("\n");
}

// 記事一覧をNewsArticleのItemListとして構造化データ化し、画像・URL・著者情報も付与する。
// あわせてBreadcrumbList（サイト > アーカイブ > 当日ページ）も出力し、検索結果での見え方を改善する。
function buildStructuredData(data, thumbnails, imgBasePath, permalinkBase, canonicalUrl) {
  const itemListElement = data.map((item, i) => {
    const hasThumb = thumbnails.has(item.importance);
    return {
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "NewsArticle",
        headline: item.headline,
        description: item.dek,
        datePublished: dateStr,
        url: `${permalinkBase}#article-${i + 1}`,
        ...(hasThumb ? { image: `${TOPIC_URL}/images/${dateStr}/${item.importance}.png` } : {}),
        author: { "@type": "Organization", name: topic.displayName },
      },
    };
  });
  const itemListJson = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `今日の${topic.displayName} - ${dateStr}`,
    itemListElement,
  };
  const breadcrumbJson = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: topic.displayName, item: PAGE_URL },
      { "@type": "ListItem", position: 2, name: "過去記事一覧", item: ARCHIVE_INDEX_URL },
      { "@type": "ListItem", position: 3, name: dateStr, item: canonicalUrl },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(itemListJson)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbJson)}</script>`;
}

// 最新版（docs/<topic>/index.html）とアーカイブ版（docs/<topic>/archive/<date>.html）を
// 同じテンプレートから生成する。画像パス・リンク先が階層の違いで変わるため、
// mode（"latest" / "archive"）に応じて相対パスを出し分ける。
function buildHtml(data, thumbnails, mode) {
  const isArchive = mode === "archive";
  const imgBasePath = isArchive ? "../" : "";
  const privacyLink = isArchive ? "../privacy.html" : "privacy.html";
  const archiveIndexLink = isArchive ? "./" : "archive/";
  const latestLink = isArchive ? "../" : "";
  const canonicalUrl = isArchive ? archiveUrlFor(dateStr) : PAGE_URL;
  const permalinkBase = archiveUrlFor(dateStr);

  const disclosureLines = [
    "本サイトはアフィリエイトプログラムによる収益を得ている場合があります。",
    "本サイトはGoogle AdSense等の広告配信サービスを利用しています。",
  ];
  if (sponsor) disclosureLines.unshift(`【PR】本日の記事は${sponsor.name}提供でお届けしています。`);

  const pageTitle = `今日の${topic.displayName} - ${dateStr}`;
  const description = buildPageDescription(data);
  const firstThumbImportance = [...thumbnails][0];

  const archiveNotice = isArchive
    ? `<p class="archive-notice">これは${dateStr}時点のアーカイブページです。<a href="${latestLink}">最新のニュースはこちら</a></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${pageTitle}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonicalUrl}">
<link rel="alternate" type="application/rss+xml" title="${topic.displayName}" href="${isArchive ? "../feed.xml" : "feed.xml"}">

<meta property="og:type" content="website">
<meta property="og:title" content="${pageTitle}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:site_name" content="${topic.displayName}">
<meta property="og:locale" content="ja_JP">
${firstThumbImportance ? `<meta property="og:image" content="${TOPIC_URL}/images/${dateStr}/${firstThumbImportance}.png">` : ""}

<meta name="twitter:card" content="summary${firstThumbImportance ? "_large_image" : ""}">
<meta name="twitter:title" content="${pageTitle}">
<meta name="twitter:description" content="${description}">

${buildStructuredData(data, thumbnails, imgBasePath, permalinkBase, canonicalUrl)}

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
  header h1 a{color:inherit;text-decoration:none;}
  .wrap{max-width:680px;margin:0 auto;padding:24px;}
  .archive-notice{background:#fff;border:1px solid #DCE6E8;border-radius:6px;padding:12px 16px;font-size:13px;margin-bottom:20px;}
  .disclosure{background:#fff8e6;border:1px solid #F4B942;border-radius:6px;padding:14px 18px;font-size:13px;color:#6B5A1E;margin-bottom:28px;}
  .disclosure p{margin:4px 0;}
  .toc{background:#fff;border-radius:8px;padding:20px 24px;margin-bottom:28px;}
  .toc h2{font-family:'Shippori Mincho',serif;font-size:16px;margin:0 0 10px;color:var(--ink);}
  .toc ol{margin:0;padding-left:20px;}
  .toc li{margin:6px 0;font-size:14px;}
  .toc a{color:var(--slate);}
  .card{background:#fff;border-radius:8px;padding:26px;margin-bottom:20px;border-top:4px solid var(--cat,#1F8A83);overflow:hidden;scroll-margin-top:16px;}
  .thumb{display:block;width:calc(100% + 52px);margin:-26px -26px 20px;max-width:none;aspect-ratio:1080/1350;object-fit:cover;}
  .thumb-placeholder{display:flex;align-items:flex-end;padding:20px;color:rgba(255,255,255,0.85);font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;}
  .tag{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--cat,#1F8A83);text-transform:uppercase;}
  h2{font-family:'Shippori Mincho',serif;font-size:22px;margin:10px 0;color:var(--ink);}
  .dek{color:var(--slate-soft);font-size:14px;}
  .why{background:var(--ink);color:#fff;border-radius:6px;padding:16px 18px;margin-top:16px;font-size:14px;}
  .why h3{display:block;color:#F4B942;font-size:11px;margin:0 0 6px;font-weight:700;font-family:'Zen Kaku Gothic New',sans-serif;}
  .source-line{font-size:12px;color:var(--slate-soft);margin-top:16px;font-family:'JetBrains Mono',monospace;}
  .share-row{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;}
  .share-btn{font-size:12px;padding:6px 12px;border-radius:20px;border:1px solid #DCE6E8;color:var(--slate);text-decoration:none;}
  .share-btn:hover{background:#DCE6E8;}
  a{color:#1F8A83;}
  .ad-slot{margin:24px 0;text-align:center;}
  footer{max-width:680px;margin:40px auto 0;padding:24px;font-size:12px;color:var(--slate-soft);border-top:1px solid #DCE6E8;}
  footer a{color:var(--slate-soft);text-decoration:underline;margin-right:12px;}
</style>
</head>
<body>
<header><h1><a href="${latestLink}">今日の${topic.displayName}</a></h1><p>${dateStr}</p></header>
<main class="wrap">
  ${archiveNotice}
  <div class="disclosure">${disclosureLines.map((l) => `<p>${l}</p>`).join("")}</div>
  ${buildToc(data)}
  ${buildArticlesWithAds(data, thumbnails, imgBasePath, permalinkBase)}
</main>
<footer>
  <p>© ${new Date(dateStr).getFullYear()} 今日の${topic.displayName}</p>
  <p>
    <a href="${archiveIndexLink}">過去記事一覧</a>
    <a href="${isArchive ? "../feed.xml" : "feed.xml"}">RSSフィード</a>
    <a href="${privacyLink}">プライバシーポリシー・広告について</a>
  </p>
</footer>
</body>
</html>`;
}

// AdSenseの利用規約で必須とされる、プライバシーポリシー・広告に関する説明ページ。
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

// アーカイブ台帳（manifest.json）を読み込み、当日分を追加/更新して書き戻す。
// 過去の日付一覧はここから復元できるため、archive/index.html・sitemap.xml・feed.xmlの
// 元データとして使う。
function updateManifest(data) {
  let manifest = [];
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch {
      manifest = [];
    }
  }
  manifest = manifest.filter((e) => e.date !== dateStr);
  manifest.push({
    date: dateStr,
    topHeadline: data[0]?.headline || "",
    count: data.length,
  });
  manifest.sort((a, b) => (a.date < b.date ? 1 : -1)); // 新しい日付が先頭
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  return manifest;
}

// 過去記事一覧（バックナンバー）ページ。
function buildArchiveIndexHtml(manifest) {
  const rows = manifest
    .map((e) => `<li><a href="${e.date}.html">${e.date}</a><span class="headline">${e.topHeadline}</span></li>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>過去記事一覧 - 今日の${topic.displayName}</title>
<meta name="description" content="今日の${topic.displayName}のバックナンバー一覧。">
<link rel="canonical" href="${ARCHIVE_INDEX_URL}">
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root{--ink:#151A2E;--paper:#EAF0F2;--slate:#3C4257;--slate-soft:#6B7280;}
  body{margin:0;background:var(--paper);color:var(--slate);font-family:'Zen Kaku Gothic New',sans-serif;line-height:1.85;}
  header{background:var(--ink);color:var(--paper);padding:40px 24px;}
  header h1{font-family:'Shippori Mincho',serif;font-size:24px;margin:0;}
  header h1 a{color:inherit;text-decoration:none;}
  .wrap{max-width:680px;margin:0 auto;padding:24px;}
  ul{list-style:none;margin:0;padding:0;}
  li{background:#fff;border-radius:8px;padding:16px 20px;margin-bottom:10px;display:flex;flex-direction:column;gap:4px;}
  li a{font-family:'JetBrains Mono',monospace;font-size:13px;color:#1F8A83;text-decoration:none;}
  .headline{font-size:14px;color:var(--ink);}
</style>
</head>
<body>
<header><h1><a href="../">今日の${topic.displayName}</a></h1></header>
<main class="wrap">
  <h2>過去記事一覧</h2>
  <ul>${rows}</ul>
</main>
</body>
</html>`;
}

function buildFeedXml(manifest) {
  const items = manifest
    .slice(0, 30)
    .map((e) => {
      const url = archiveUrlFor(e.date);
      const pubDate = new Date(e.date).toUTCString();
      return `
  <item>
    <title>今日の${topic.displayName} - ${e.date}</title>
    <link>${url}</link>
    <guid>${url}</guid>
    <pubDate>${pubDate}</pubDate>
    <description>${escAttr(e.topHeadline)}ほか、${e.count}件のニュースをまとめました。</description>
  </item>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>今日の${topic.displayName}</title>
  <link>${PAGE_URL}</link>
  <description>${topic.displayName}の日刊まとめ</description>
  <language>ja</language>
  ${items}
</channel>
</rss>`;
}

function buildSitemapXml(manifest) {
  const urls = [PAGE_URL, ARCHIVE_INDEX_URL, ...manifest.map((e) => archiveUrlFor(e.date))];
  const entries = urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
}

function buildRobotsTxt() {
  return `User-agent: *
Allow: /

Sitemap: ${TOPIC_URL}/sitemap.xml
`;
}

function main() {
  const data = JSON.parse(fs.readFileSync(path.join(outputDir, "data.json"), "utf-8"));
  fs.mkdirSync(docsDir, { recursive: true });

  const thumbnails = copyThumbnails(data);

  // 最新版
  fs.writeFileSync(path.join(docsDir, "index.html"), buildHtml(data, thumbnails, "latest"), "utf-8");
  fs.writeFileSync(path.join(docsDir, "privacy.html"), buildPrivacyHtml(), "utf-8");

  // 日付ごとの永久保存版
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(path.join(archiveDir, `${dateStr}.html`), buildHtml(data, thumbnails, "archive"), "utf-8");

  // アーカイブ台帳の更新と、そこから生成する各種一覧ページ
  const manifest = updateManifest(data);
  fs.writeFileSync(path.join(archiveDir, "index.html"), buildArchiveIndexHtml(manifest), "utf-8");
  fs.writeFileSync(path.join(docsDir, "feed.xml"), buildFeedXml(manifest), "utf-8");
  fs.writeFileSync(path.join(docsDir, "sitemap.xml"), buildSitemapXml(manifest), "utf-8");

  // robots.txtはサイト全体のルート（docs直下）に1つだけ置く
  fs.writeFileSync(path.join(docsDir, "..", "robots.txt"), buildRobotsTxt(), "utf-8");

  console.log(
    `生成しました: docs/${topic.slug}/index.html, archive/${dateStr}.html, archive/index.html, feed.xml, sitemap.xml, robots.txt（サムネイル${thumbnails.size}枚同梱）`
  );
}

main();
