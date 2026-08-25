// STEP2: AI生成背景＋テキストを合成し、5枚の画像カードを作る（話題対応版）
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { loadTopic } from "./topic-context.mjs";

const { topic, outputDir, dateStr } = loadTopic();

const W = 1080;
const H = 1350;

// X（旧Twitter）向けの横長サイズ。縦長のまま貼るとタイムライン上でトリミングされ
// 見出しが切れることがあるため、横長専用レイアウトを別途書き出す。
const XW = 1200;
const XH = 675;

function cardHtml(item, index, total, bgPath) {
  const hasBg = fs.existsSync(bgPath);
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{
    width:${W}px;height:${H}px;
    background:#151A2E ${hasBg ? `url('${bgPath}') center/cover no-repeat` : ""};
    font-family:'Zen Kaku Gothic New', sans-serif;
    color:#3C4257;
    display:flex; flex-direction:column;
    padding:88px 80px 72px;
    position:relative;
    overflow:hidden;
  }
  /* 画面全体に薄く均一なトーンをかけるだけに留め、余白・静けさを壊さないようにする */
  body::after{
    content:"";
    position:absolute; inset:0;
    background:linear-gradient(to bottom, rgba(10,12,20,0.05) 0%, rgba(10,12,20,0.35) 72%, rgba(10,12,20,0.6) 100%);
    z-index:0;
  }
  .top, .tag, h1, .dek, .statrow, .footer{ position:relative; z-index:1; }
  .top{display:flex; align-items:center; justify-content:space-between;}
  .brand{font-family:'JetBrains Mono', monospace; font-size:17px; letter-spacing:0.16em; color:rgba(255,255,255,0.55); text-transform:uppercase;}
  .counter{font-family:'JetBrains Mono', monospace; font-size:17px; color:rgba(255,255,255,0.55); letter-spacing:0.08em;}
  .tag{
    display:flex; align-items:center; gap:10px;
    margin-top:auto;
    font-family:'JetBrains Mono', monospace; font-size:17px; letter-spacing:0.14em;
    color:rgba(255,255,255,0.75); text-transform:uppercase;
  }
  .tag .dot{ width:7px; height:7px; border-radius:50%; background:${item.catColor}; flex:0 0 auto; }
  h1{
    font-family:'Shippori Mincho', serif; font-weight:500;
    font-size:56px; line-height:1.55; color:#fff;
    margin-top:26px;
    letter-spacing:0.01em;
    max-width:88%;
  }
  .dek{font-size:24px; color:rgba(255,255,255,0.6); margin-top:22px; max-width:80%; line-height:1.7;}
  .statrow{
    display:flex; gap:56px;
    margin-top:64px;
    padding-top:32px;
    border-top:1px solid rgba(255,255,255,0.18);
  }
  .stat .n{font-family:'JetBrains Mono', monospace; font-size:32px; font-weight:600; color:#fff; display:block;}
  .stat .l{font-size:16px; color:rgba(255,255,255,0.5); margin-top:6px; display:block; letter-spacing:0.02em;}
  .footer{
    display:flex; justify-content:space-between; align-items:center;
    margin-top:28px; font-family:'JetBrains Mono', monospace; font-size:14px; color:rgba(255,255,255,0.4);
  }
</style></head>
<body>
  <div class="top">
    <span class="brand">${topic.displayName} Daily</span>
    <span class="counter">${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</span>
  </div>
  <span class="tag"><span class="dot"></span>${item.category}</span>
  <h1>${item.headline}</h1>
  <p class="dek">${item.dek}</p>
  <div class="statrow">
    ${(item.stats || [])
      .slice(0, 2)
      .map((s) => `<div class="stat"><span class="n">${s.n}</span><span class="l">${s.l}</span></div>`)
      .join("")}
  </div>
  <div class="footer">
    <span>${dateStr}</span>
    <span>出典：${(item.sourceLine || "").split("（")[0]}</span>
  </div>
</body></html>`;
}

function cardHtmlX(item, index, total, bgPath) {
  const hasBg = fs.existsSync(bgPath);
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{
    width:${XW}px;height:${XH}px;
    background:#EAF0F2 ${hasBg ? `url('${bgPath}') center/cover no-repeat` : ""};
    font-family:'Zen Kaku Gothic New', sans-serif;
    display:flex; align-items:flex-end;
    padding:40px 48px;
    position:relative;
    overflow:hidden;
  }
  body::after{
    content:"";
    position:absolute; inset:0;
    background:linear-gradient(to top, rgba(21,26,46,0.92) 0%, rgba(21,26,46,0.5) 45%, rgba(21,26,46,0.1) 100%);
    z-index:0;
  }
  .inner{ position:relative; z-index:1; width:100%; }
  .tag{
    display:inline-block;
    font-family:'JetBrains Mono', monospace; font-size:15px; letter-spacing:0.08em;
    color:${item.catColor}; background:#fff;
    padding:5px 14px; border-radius:5px; text-transform:uppercase;
    margin-bottom:14px;
  }
  h1{
    font-family:'Shippori Mincho', serif; font-weight:800;
    font-size:38px; line-height:1.35; color:#fff;
    text-shadow:0 2px 10px rgba(0,0,0,0.4);
  }
  .foot{
    margin-top:14px; display:flex; justify-content:space-between;
    font-family:'JetBrains Mono', monospace; font-size:13px; color:#D7DEE4;
  }
</style></head>
<body>
  <div class="inner">
    <span class="tag">${item.category}</span>
    <h1>${item.headline}</h1>
    <div class="foot"><span>${topic.displayName} Daily</span><span>${index + 1}/${total} ・ ${dateStr}</span></div>
  </div>
</body></html>`;
}

async function main() {
  const top5 = JSON.parse(fs.readFileSync(path.join(outputDir, "top5.json"), "utf-8"));
  const cardsDir = path.join(outputDir, "cards");
  const cardsXDir = path.join(outputDir, "cards-x");
  fs.mkdirSync(cardsDir, { recursive: true });
  fs.mkdirSync(cardsXDir, { recursive: true });

  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();

  // ① Instagram/Threads向け（縦長 1080x1350）
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
  for (let i = 0; i < top5.length; i++) {
    const bgPath = path.join(outputDir, "backgrounds", `${i + 1}.png`);
    const html = cardHtml(top5[i], i, top5.length, bgPath);
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.screenshot({ path: path.join(cardsDir, `${i + 1}.png`) });
  }
  console.log(`[${topic.slug}] 5枚の縦長カード（Instagram/Threads向け）を生成しました。`);

  // ② X向け（横長 1200x675）。同じ背景を使い回し、レイアウトだけ横長用に変える
  await page.setViewport({ width: XW, height: XH, deviceScaleFactor: 2 });
  for (let i = 0; i < top5.length; i++) {
    const bgPath = path.join(outputDir, "backgrounds", `${i + 1}.png`);
    const html = cardHtmlX(top5[i], i, top5.length, bgPath);
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.screenshot({ path: path.join(cardsXDir, `${i + 1}.png`) });
  }
  console.log(`[${topic.slug}] 5枚の横長カード（X向け）を生成しました。`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
