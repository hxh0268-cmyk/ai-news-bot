// STEP1: Claude APIに「本日のニュース7本」を作らせ、重要度上位5本を選ぶ。
// どの話題を扱うかは環境変数 TOPIC（例: "ai-news"）で切り替わる。
// 出力: output/<topic>/<date>/data.json / top5.json

import fs from "node:fs";
import path from "node:path";
import { loadTopic } from "./topic-context.mjs";
import { withRetry } from "./retry.mjs";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY が設定されていません。GitHub Secretsに登録してください。");
  process.exit(1);
}

const MODEL = "claude-sonnet-5";
const { topic, dateStr, outputDir } = loadTopic();

// 簡易A/Bテスト：日替わりで見出しの作り方を変え、将来的に反応の違いを比較できるようにする。
// 本格的な効果測定（GA4等）が揃うまでの暫定的な仕組み。
const dayOfYear = Math.floor((new Date(dateStr) - new Date(new Date(dateStr).getFullYear(), 0, 0)) / 86400000);
const variant = dayOfYear % 2 === 0 ? "A" : "B";
const variantInstruction =
  variant === "A"
    ? "見出し(headline)は「〜という発表」「〜が判明」のような断定・事実提示型の文体にする。"
    : "見出し(headline)は「〜はどうなる？」「まさか〜」のような、読者の好奇心を刺激する問いかけ・驚き型の文体にする。";

const SYSTEM_PROMPT = `
${topic.systemPrompt}

【本日の見出しスタイル指定（A/Bテスト中・variant ${variant}）】
${variantInstruction}

以下の項目を持つニュース7件を集めてください：

- importance: 1〜7の整数（1が最重要。7件で重複なく順位をつける）
- category: カテゴリ名（英語、例: Speed / OpenAI）
- catColor: ${(topic.categoryColors || ["#F4B942", "#7C6FE0", "#1F8A83", "#E1636F"]).join(" か ")} のいずれか
- headline: 見出し（日本語、20〜28字程度、画像内に収まる長さ）
- dek: 見出し下の一行説明（日本語、30字程度）
- body: 本文の段落（2〜4個の配列）
- stats: 数値と説明ラベルの組（配列）
- why: なぜ重要かの説明（日本語、2〜3文）
- chips: 関連キーワード（配列）
- sourceLine: 出典（媒体名、日付）
- videoId: 関連する公式YouTube動画のIDが確実に分かる場合のみ。分からなければ null
- captionX: X投稿用の文章（日本語、120字以内、ハッシュタグ2個程度含む）
- captionThreads: Threads投稿用の文章（日本語、200字以内、少し会話的なトーン）
- captionInstagram: Instagram投稿用の文章（日本語、300字程度、詳しめの説明＋ハッシュタグ5個程度）

正確性を最優先してください。数値や固有名詞は必ずWeb検索で確認したものだけを使い、不確かな情報は書かないでください。

【固有名詞の表記ルール】
企業名・サービス名・製品名・アプリ名などの固有名詞は、カタカナ訳をせず、必ず公式の英語表記（アルファベット）のまま使ってください。
例：「アンソロピック」ではなく「Anthropic」、「オープンAI」ではなく「OpenAI」、「グーグル」ではなく「Google」、「クロード」ではなく「Claude」。
一般名詞（例：人工知能、生成、投稿）は通常通り日本語で構いません。あくまで固有名詞のみが対象です。

情報収集が終わったら、必ず submit_news_items ツールを使って結果を提出してください。
`.trim();

const USER_PROMPT = `${dateStr} 時点の最新情報を調べて、上記フォーマットでニュース7件を集めてください。集め終わったら submit_news_items ツールで提出してください。`;

// 「自由な文章としてJSONを書かせる」方式は、AIがまれに引用符の閉じ忘れ等で
// 壊れたJSONを出力することがあった。そこでAPIの「ツール呼び出し」機能を使い、
// 型（スキーマ）に沿った壊れないデータとして提出させる方式に変更している。
const NEWS_ITEM_SCHEMA = {
  type: "object",
  properties: {
    importance: { type: "integer", minimum: 1, maximum: 7 },
    category: { type: "string" },
    catColor: { type: "string" },
    headline: { type: "string" },
    dek: { type: "string" },
    body: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
    stats: {
      type: "array",
      items: { type: "object", properties: { n: { type: "string" }, l: { type: "string" } }, required: ["n", "l"] },
    },
    why: { type: "string" },
    chips: { type: "array", items: { type: "string" } },
    sourceLine: { type: "string" },
    videoId: { type: ["string", "null"] },
    captionX: { type: "string" },
    captionThreads: { type: "string" },
    captionInstagram: { type: "string" },
  },
  required: [
    "importance",
    "category",
    "catColor",
    "headline",
    "dek",
    "body",
    "why",
    "sourceLine",
    "captionX",
    "captionThreads",
    "captionInstagram",
  ],
};

const SUBMIT_TOOL = {
  name: "submit_news_items",
  description: "収集・作成したニュース7件を提出する。",
  input_schema: {
    type: "object",
    properties: {
      items: { type: "array", items: NEWS_ITEM_SCHEMA, minItems: 7, maxItems: 7 },
    },
    required: ["items"],
  },
};

async function callClaude() {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 24000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: USER_PROMPT }],
      // max_uses: 検索回数の上限を設け、検索だけでトークン予算を使い切ってしまうのを防ぐ
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 10 },
        SUBMIT_TOOL,
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API エラー: ${res.status} ${errText}`);
  }

  const data = await res.json();

  const submitBlock = data.content.find((b) => b.type === "tool_use" && b.name === "submit_news_items");

  if (!submitBlock) {
    console.error("stop_reason:", data.stop_reason);
    console.error("content block types:", data.content.map((b) => b.type).join(", "));
    const textFallback = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    throw new Error("submit_news_itemsツールの呼び出しが見つかりませんでした。テキスト出力:\n" + textFallback);
  }

  // ツール呼び出しの引数は、APIが型に沿って生成するため、素のJSON.parseは不要
  return submitBlock.input.items;
}

async function main() {
  console.log(`[${topic.slug}] Claude APIに本日(${dateStr})分の「${topic.displayName}」収集を依頼しています…`);
  // 529（Anthropic側の一時的な混雑）等の一時的なエラーは自動でリトライする
  const items = await withRetry(() => callClaude(), { retries: 3, baseDelayMs: 15000, label: "ニュース収集" });

  if (!Array.isArray(items) || items.length !== 7) {
    throw new Error(`期待した形式のデータではありません（要素数: ${items?.length}）`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "data.json"), JSON.stringify(items, null, 2), "utf-8");
  fs.writeFileSync(path.join(outputDir, "variant.json"), JSON.stringify({ date: dateStr, variant }, null, 2), "utf-8");

  const top5 = [...items].sort((a, b) => a.importance - b.importance).slice(0, 5);
  fs.writeFileSync(path.join(outputDir, "top5.json"), JSON.stringify(top5, null, 2), "utf-8");

  console.log(`完了: output/${topic.slug}/${dateStr}/data.json（7本）, top5.json（上位5本）を生成しました。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
