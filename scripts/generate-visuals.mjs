// STEP2a: Nano Banana Proで背景ビジュアルを生成する（話題対応版）
import fs from "node:fs";
import path from "node:path";
import { loadTopic } from "./topic-context.mjs";
import { withRetry } from "./retry.mjs";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("GEMINI_API_KEY が設定されていません。");
  process.exit(1);
}

const MODEL = "gemini-3-pro-image";
const { topic, outputDir } = loadTopic();

function buildPrompt(item) {
  return `
以下のトピックの雰囲気を表す、SNS投稿用の背景ビジュアルを1枚生成してください。

見出し: ${item.headline}
カテゴリ: ${item.category}
概要: ${item.dek}

条件:
- 写真調またはエディトリアルイラスト調（文字・ロゴ・ウォーターマークは一切入れない）
- 画面の下半分は比較的シンプルな構図にする（後で見出しテキストを重ねるため）
- 落ち着いた配色
- 縦長構図
`.trim();
}

async function generateOne(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { imageConfig: { aspectRatio: "3:4" } },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API エラー: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inline_data || p.inlineData);
  const inline = imagePart?.inline_data || imagePart?.inlineData;
  if (!inline?.data) throw new Error("画像データが返されませんでした: " + JSON.stringify(data).slice(0, 500));
  return Buffer.from(inline.data, "base64");
}

async function main() {
  const top5 = JSON.parse(fs.readFileSync(path.join(outputDir, "top5.json"), "utf-8"));
  const bgDir = path.join(outputDir, "backgrounds");
  fs.mkdirSync(bgDir, { recursive: true });

  let failCount = 0;
  for (let i = 0; i < top5.length; i++) {
    console.log(`[${topic.slug}] 背景ビジュアル生成中 (${i + 1}/${top5.length})...`);
    try {
      const buf = await withRetry(() => generateOne(buildPrompt(top5[i])), {
        retries: 3,
        label: `背景ビジュアル生成(${i + 1})`,
      });
      fs.writeFileSync(path.join(bgDir, `${i + 1}.png`), buf);
    } catch (err) {
      // 1枚失敗しても全体を止めない。この場合render-cards.mjs側が
      // 背景なし（単色背景）のカードとして代替生成する。
      console.error(`⚠️ 背景ビジュアル(${i + 1})の生成に失敗しました。単色背景で代替します: ${err.message}`);
      failCount++;
    }
  }

  if (failCount > 0) {
    fs.writeFileSync(
      path.join(outputDir, "visuals-warning.md"),
      `# 背景ビジュアル生成の警告\n\n5枚中${failCount}枚の背景生成に失敗し、単色背景で代替されました。\nGemini APIの一時的な不調の可能性があります。内容自体には影響ありません。`,
      "utf-8"
    );
  }

  console.log(`背景ビジュアル生成完了（成功: ${top5.length - failCount}/${top5.length}）`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
