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
    background:#EAF0F2 ${hasBg ? `url('${bgPath}') center/cover no-repeat` : ""};
    font-family:'Zen Kaku Gothic New', sans-serif;
    color:#3C4257;
    display:flex; flex-direction:column;
    padding:70px 64px 60px;
    position:relative;
    overflow:hidden;
  }
  body::after{
    content:"";
    position:absolute; inset:0;
    background:linear-gradient(to bottom, rgba(21,26,46,0.15) 0%, rgba(21,26,46,0.55) 55%, rgba(21,26,46,0.88) 100%);
    z-index:0;
  }
  .top, .tag, h1, .dek, .statbar, .footer{ position:relative; z-index:1; }
  .top{display:flex; align-items:center; justify-content:space-between;}
  .brand{font-family:'JetBrains Mono', monospace; font-size:20px; letter-spacing:0.12em; color:#fff; text-transform:uppercase;}
  .counter{font-family:'JetBrains Mono', monospace; font-size:20px; color:${item.catColor}; font-weight:600;}
  .tag{
    display:inline-block; margin-top:56px;
    font-family:'JetBrains Mono', monospace; font-size:22px; letter-spacing:0.08em;
    color:${item.catColor}; background:#fff;
    padding:10px 22px; border-radius:6px; text-transform:uppercase;
    width:fit-content;
  }
  h1{
    font-family:'Shippori Mincho', serif; font-weight:800;
    font-size:64px; line-height:1.4; color:#fff;
    margin-top:36px;
    text-shadow:0 2px 12px rgba(0,0,0,0.4);
  }
  .dek{font-size:30px; color:#E5EAEE; margin-top:20px;}
  .statbar{display:flex; gap:20px; margin-top:auto;}
  .stat{
    background:rgba(255,255,255,0.94); border-top:6px solid ${item.catColor};
    border-radius:10px; padding:26px 30px; flex:1;
  }
  .stat .n{font-family:'JetBrains Mono', monospace; font-size:40px; font-weight:600; color:#151A2E; display:block;}
  .stat .l{font-size:20px; color:#6B7280; margin-top:6px; display:block;}
  .footer{
    display:flex; justify-content:space-between; align-items:center;
    margin-top:36px; font-family:'JetBrains Mono', monospace; font-size:18px; color:#E5EAEE;
  }
</style></head>
<body>
  <div class="top">
    <span class="brand">${topic.displayName} Daily</span>
    <span class="counter">${index + 1} / ${total}</span>
  </div>
  <span class="tag">${item.category}</span>
  <h1>${item.headline}</h1>
  <p class="dek">${item.dek}</p>
  <div class="statbar">
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
