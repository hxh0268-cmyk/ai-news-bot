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

【アートディレクション：ヒューマニストSF（人間中心の静かな未来）】
「静寂」と「圧倒的なスケールの巨大構造物」が共存する情景を描いてください。
派手な演出やガジェットの説明的な描写ではなく、詩的で映画的な一場面を目指します。

■ 世界観・被写体
- 巨大なメガストラクチャー（例：リング状の宇宙コロニー、都市規模の宇宙建造物）を舞台にする
- その中で、ひとり静かに佇む人物を1人だけ描く（大きな窓のそばに座っている、遠くを眺めているなど、
  日常のささやかな一瞬を切り取る構図）
- 背景には、遠くを行き交う宇宙船や、温かみのある街の灯りをうっすらと配置してもよい

■ 雰囲気・トーン
- 静寂（quiet, serene atmosphere）
- 夕暮れ時のような、温かみのある光（dusk, warm light）
- 圧倒的でありながら美しい、崇高なスケール感（sublime scale）

■ 美的感覚
- 日本的な美意識、もののあわれ（mono no aware）を感じさせる、詩的で哲学的な余韻
- 説明過多にならず、静かな情緒を残す

■ 画作り
- 映画のようなライティング（cinematic lighting）、柔らかく自然な光の質感（soft natural glow）
- 生々しすぎない、35mmフィルム写真のような質感（35mm film photograph style）、高精細

■ 技術的な制約
- 文字・ロゴ・ウォーターマーク・UIパーツは一切入れない
- 縦長構図（人物・窓は画面中央〜上寄りに配置し、下部3割程度は見出しテキストを重ねられるよう
  比較的落ち着いたトーンにする）
- 人物を描く場合は、顔の判別できない小さなシルエット・後ろ姿程度に留める
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
        retries: 5,
        baseDelayMs: 15000, // Nano Banana Pro側の一時的な混雑（503）を乗り越えるため、待機時間を長めに取る
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
