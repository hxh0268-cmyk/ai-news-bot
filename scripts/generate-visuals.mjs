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

// 2026年8月時点、Nano Banana Pro（最高品質）が持続的に混雑する場合に備え、
// Nano Banana 2（同シリーズの高速・高効率版）へ自動フォールバックする。
const PRIMARY_MODEL = "gemini-3-pro-image";
const FALLBACK_MODEL = "gemini-3.1-flash-image";
const { topic, outputDir } = loadTopic();

// 複数の「型」を用意し、記事ごとにローテーションすることで単調さを避ける。
// 新しい型を増やしたい場合は、この配列に追加するだけでよい。
const ART_DIRECTIONS = [
  {
    name: "ヒューマニストSF（静寂×巨大構造物・夕景）",
    body: `
「静寂」と「圧倒的なスケールの巨大構造物」が共存する情景を描いてください。
派手な演出やガジェットの説明的な描写ではなく、詩的で映画的な一場面を目指します。

- 巨大なメガストラクチャー（例：リング状の宇宙コロニー、都市規模の宇宙建造物）を舞台にする
- その中で、ひとり静かに佇む人物を1人だけ描く（大きな窓のそばに座っている、遠くを眺めているなど、
  日常のささやかな一瞬を切り取る構図）
- 背景には、遠くを行き交う宇宙船や、温かみのある街の灯りをうっすらと配置してもよい
- トーン：夕暮れ時のような、温かみのある光（dusk, warm light）。崇高なスケール感（sublime scale）
- 日本的な美意識、もののあわれ（mono no aware）を感じさせる、詩的で哲学的な余韻`,
  },
  {
    name: "静謐な近未来メトロポリス（白基調・昼景）",
    body: `
穏やかで映画的な近未来都市を描いてください。攻撃的・威圧的な未来像ではなく、
人間らしさとテクノロジーが調和した、優しい近未来像を目指します。

- 白やベージュを基調とした、洗練されたミニマルな近未来建築が並ぶ都市
- 柔らかい自然光と、うっすらとした霧・靄（かすみ）がかかった、穏やかな空気感
- 過度な装飾を避け、エレガントで平和的な雰囲気
- 建築物は曲線的・有機的で、冷たすぎない印象にする
- トーン：柔らかい昼の光（soft ambient daylight）、35mmフィルムで撮ったような質感`,
  },
  {
    name: "未来の居住空間（インサイド・アーキテクチャ）",
    body: `
外の世界の雑音を完全にシャットアウトしたような、瞑想的で洗練された未来の室内を描いてください。

- 滑らかな白いコンクリート壁、継ぎ目のない一体型の照明（seamless, integrated lighting）
- 高い位置の窓から差し込む柔らかな日光
- 砂や自然石を思わせる素材を、ほんの少しだけ添える
- ガジェット感・機械感を一切出さず、静謐で禅的な雰囲気にする
- フォトリアルで高精細な質感`,
  },
  {
    name: "超巨大未来建築（モノリス・メガストラクチャー）",
    body: `
ディストピアではなく、神聖さすら感じるような、巨大で穏やかな未来建築のモニュメントを描いてください。

- 一枚岩のような（monolithic）巨大な白い未来的パビリオン。塔のようにそびえるミニマルなコンクリート構造物
- 滑らかに湾曲した表面
- 穏やかで広大な空、朝霧のような柔らかな光
- 静寂で精神的（spiritual）な空気感。荘厳な建築写真のような構図
- 高精細`,
  },
];

// 上記の型と組み合わせて使う、語彙を豊かにするための共通キーワード辞典。
// 新しい単語を追加したい場合はここに足していけばよい。
const KEYWORD_PALETTE = `
- 質感：matte white（マットな白）、sculptural（彫刻的な）、seamless concrete（継ぎ目のないコンクリート）、pleated fabric（プリーツ状の布）
- 光：diffused gallery lighting（美術館のような拡散光）、soft ambient fog（柔らかな霧）、ethereal daylight（空気のような淡い陽光）
- 空気感：serene（静謐な）、meditative（瞑想的な）、poetic sci-fi（詩的なSF）、timeless（時代を超越した）
`.trim();

function buildPrompt(item, direction) {
  return `
以下のニュースの内容にふさわしい、SNS投稿用の背景ビジュアルを1枚生成してください。

見出し: ${item.headline}
カテゴリ: ${item.category}
概要: ${item.dek}

【最初のステップ：具体的な情景を考える】
上記のニュース内容を象徴する、具体的で独自性のある1つの情景・被写体を考えてください。
ニュースの内容と無関係な、使い回しの一般的な構図にはしないでください
（例：「新しい対話AIモデル」の記事なら、対話・言葉・声を象徴するモチーフを、
「ロボット関連」の記事なら、身体性・動きを象徴するモチーフを考える、など）。

【アートディレクション：${direction.name}】
考えた情景を、以下の様式で描いてください。
${direction.body}

■ 参考キーワード（雰囲気の調整に活用してください。すべて使う必要はありません）
${KEYWORD_PALETTE}

■ 技術的な制約
- 文字・ロゴ・ウォーターマーク・UIパーツは一切入れない
- 縦長構図。画面下部3割程度は見出しテキストを重ねられるよう、比較的落ち着いたトーンにする
- 人物を描く場合は、顔の判別できない小さなシルエット・後ろ姿程度に留める
`.trim();
}

async function generateOne(prompt, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
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
    const direction = ART_DIRECTIONS[i % ART_DIRECTIONS.length];
    console.log(`[${topic.slug}] 背景ビジュアル生成中 (${i + 1}/${top5.length})... [型: ${direction.name}]`);
    try {
      let buf;
      try {
        // まずNano Banana Pro（高品質）を試す
        buf = await withRetry(() => generateOne(buildPrompt(top5[i], direction), PRIMARY_MODEL), {
          retries: 3,
          baseDelayMs: 10000,
          label: `背景ビジュアル生成(${i + 1})[Pro]`,
        });
      } catch (primaryErr) {
        console.warn(
          `⚠️ Nano Banana Pro(${i + 1})が持続的に混雑しているため、Nano Banana 2に切り替えます: ${primaryErr.message}`
        );
        buf = await withRetry(() => generateOne(buildPrompt(top5[i], direction), FALLBACK_MODEL), {
          retries: 3,
          baseDelayMs: 8000,
          label: `背景ビジュアル生成(${i + 1})[Flash]`,
        });
      }
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
