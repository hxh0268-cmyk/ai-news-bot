// STEP1: Claude APIに「本日のニュース7本」を作らせ、重要度上位5本を選ぶ。
// どの話題を扱うかは環境変数 TOPIC（例: "ai-news"）で切り替わる。
// 出力: output/<topic>/<date>/data.json / top5.json

import fs from "node:fs";
import path from "node:path";
import { loadTopic } from "./topic-context.mjs";
import { withRetry } from "./retry.mjs";
import { HUMANIZE_STYLE_GUIDE } from "./humanize-style.mjs";

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
- lifeRelevanceTag: このニュースが「お金・仕事」「毎日使うアプリ・サービス」「子育て・教育」「健康・医療」「暮らし・エンタメ」のいずれかに読者の生活を具体的に変える内容なら該当するタグを、当てはまらなければ「なし」を入れる（7件中3件以上は「なし」以外にすること）

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
    lifeRelevanceTag: {
      type: "string",
      enum: ["お金・仕事", "毎日使うアプリ・サービス", "子育て・教育", "健康・医療", "暮らし・エンタメ", "なし"],
    },
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
    "lifeRelevanceTag",
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
  if (!submitBlock.input || !Array.isArray(submitBlock.input.items)) {
    console.error("submitBlock.input の中身が想定と異なります:");
    console.error(JSON.stringify(submitBlock.input, null, 2).slice(0, 3000));
    throw new Error("submitBlock.input.items が配列ではありません。上記ログを確認してください。");
  }
  return submitBlock.input.items;
}

// STEP1後半：下書き（items）を、人間らしい自然な文章に書き直す2段階目の処理。
// Web検索は不要なため、submit_news_itemsツールを強制的に呼ばせて構造を保ったまま
// 文体だけを変えさせる。
// 下書きから「変えてはいけない数字」を抽出する。書き直し工程で数値がさりげなく
// ズレてしまう事故（AIの言い換えにありがちな失敗）を防ぐためのガードレール。
function extractProtectedNumbers(items) {
  const nums = new Set();
  const re = /[0-9０-９][0-9０-９.,%億万兆円ドル倍人時分秒年月日]*/g;
  for (const item of items) {
    for (const s of item.stats || []) {
      (s.n.match(re) || []).forEach((m) => nums.add(m));
    }
    ((item.body || []).join(" ") + " " + (item.why || "")).match(re)?.forEach((m) => nums.add(m));
  }
  return Array.from(nums);
}

async function humanizeItems(draftItems) {
  const protectedNumbers = extractProtectedNumbers(draftItems);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system: HUMANIZE_STYLE_GUIDE,
      messages: [
        {
          role: "user",
          content:
            "以下は7本のニュース記事の下書きです。編集方針に沿って、body・why・captionX・captionThreads・captionInstagram の文章だけを自然な文体に書き直してください（headline・dek・importance・category・catColor・stats・chips・sourceLine・videoId は変更しないこと）。\n\n" +
            "【captionX / captionThreads / captionInstagram について・厳守】\n" +
            "この3つは文字数制限があるからといって「元の文のまま」提出することを禁止します。" +
            "たとえ下書きの文章が既に自然に見えたとしても、必ず言葉選び・語尾・リズムのどこかを変えてください。" +
            "文字数制限を守ることを優先していいので、「制限内に収まる範囲で、最低でも一箇所は元の文と違う書き方にする」ことを徹底してください。" +
            "書き直した結果、captionX・captionThreads・captionInstagram のいずれかが下書きと一字一句同じだった場合は、その項目は不合格とみなします。もう一度、別の言い回しで書き直してから提出してください。\n\n" +
            "【絶対厳守：事実保護】\n" +
            "以下の数値・単位は、書き直した文章の中でも一字一句そのまま残してください。言い換えたり、四捨五入したり、単位を変えたりしないでください：\n" +
            protectedNumbers.join("、") +
            "\n\n" +
            "【文字数の厳守】\n" +
            "captionX は120字以内、captionThreads は200字以内、captionInstagram は320字以内を必ず守ってください。" +
            "「自然な言い回しを足す」ことを優先して文字数制限を超えないよう、必要なら簡潔にまとめてください。\n\n" +
            "【避けるべきAI特有の言い回し（例）】\n" +
            "「〜と言えるでしょう」「〜ではないでしょうか」「まさに」「〜という点も見逃せません」" +
            "「〜することが重要です」といった、AIが多用しがちな定型句は避けてください。\n\n" +
            "書き直したら、7件すべてを submit_news_items ツールで提出してください。\n\n" +
            JSON.stringify(draftItems, null, 2),
        },
      ],
      tools: [SUBMIT_TOOL],
      tool_choice: { type: "tool", name: "submit_news_items" },
    }),
  });

  if (!res.ok) throw new Error(`Claude API エラー（文章の書き直し）: ${res.status} ${await res.text()}`);

  const data = await res.json();
  const submitBlock = data.content.find((b) => b.type === "tool_use" && b.name === "submit_news_items");
  if (!submitBlock?.input?.items) {
    throw new Error("文章の書き直し結果が取得できませんでした: " + JSON.stringify(data).slice(0, 1000));
  }
  return submitBlock.input.items;
}

// 書き直し前後で、キャプション類が一字一句同じままになっていないかをチェックする。
// ここで検知しても処理は止めない（品質より継続性を優先する既存方針を踏襲）が、
// ログに残すことで「ヒューマナイズが効いていない日」に気づけるようにする。
function logUnchangedCaptions(draftItems, finalItems) {
  const fields = [
    ["captionX", "X用"],
    ["captionThreads", "Threads用"],
    ["captionInstagram", "Instagram用"],
    ["why", "なぜ重要か"],
  ];
  let unchangedCount = 0;
  draftItems.forEach((draft, i) => {
    const final = finalItems[i] || {};
    for (const [key, label] of fields) {
      if (draft[key] && final[key] && draft[key] === final[key]) {
        unchangedCount += 1;
        console.warn(`⚠️ 書き直し未適用の疑い: ${i + 1}件目「${draft.headline}」の${label}が下書きと完全一致しています。`);
      }
    }
  });
  if (unchangedCount === 0) {
    console.log("✅ 書き直しチェック: 全項目で下書きから変化が確認できました。");
  } else {
    console.warn(`⚠️ 書き直しチェック: ${unchangedCount}件の項目が下書きと完全一致していました（要確認）。`);
  }
}

// 「書き直し前」と「書き直し後」を左右に並べて見比べられるMarkdownを生成する。
// GitHub上でこのファイルを開くと、表形式で横並び表示される。
function buildHumanizeComparison(draftItems, finalItems) {
  const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");

  const rows = draftItems
    .map((draft, i) => {
      const final = finalItems[i] || {};
      return `
### ${i + 1}. ${esc(draft.headline)}

| | 書き直し前 | 書き直し後 |
|---|---|---|
| **本文** | ${esc((draft.body || []).join(" "))} | ${esc((final.body || []).join(" "))} |
| **なぜ重要か** | ${esc(draft.why)} | ${esc(final.why)} |
| **X用** | ${esc(draft.captionX)} | ${esc(final.captionX)} |
| **Threads用** | ${esc(draft.captionThreads)} | ${esc(final.captionThreads)} |
| **Instagram用** | ${esc(draft.captionInstagram)} | ${esc(final.captionInstagram)} |
`;
    })
    .join("\n");

  return `# 文章の書き直し比較（${dateStr}）

「書き直し前」と「書き直し後」を見比べて、より人間らしい文章になっているか確認してください。
数字や固有名詞が変わってしまっていないかも、あわせてチェックしてください。

## 生活直結ルールの達成状況

${(() => {
  const tagged = finalItems.filter((it) => it.lifeRelevanceTag && it.lifeRelevanceTag !== "なし");
  const status = tagged.length >= 3 ? "✅ 達成" : "⚠️ 未達成（3件未満）";
  const list = finalItems
    .map((it) => `- ${it.headline}：${it.lifeRelevanceTag || "（未設定）"}`)
    .join("\n");
  return `${status}（${tagged.length}/7件が該当）\n\n${list}`;
})()}
${rows}`;
}

async function main() {
  console.log(`[${topic.slug}] Claude APIに本日(${dateStr})分の「${topic.displayName}」収集を依頼しています…`);
  // 529（Anthropic側の一時的な混雑）等の一時的なエラーは自動でリトライする
  const draftItems = await withRetry(() => callClaude(), { retries: 3, baseDelayMs: 15000, label: "ニュース収集" });

  if (!Array.isArray(draftItems) || draftItems.length !== 7) {
    throw new Error(`期待した形式のデータではありません（要素数: ${draftItems?.length}）`);
  }

  console.log(`[${topic.slug}] 文章を人間らしい自然な文体に書き直しています…`);
  let items;
  try {
    items = await withRetry(() => humanizeItems(draftItems), {
      retries: 2,
      baseDelayMs: 8000,
      label: "文章の書き直し",
    });
    logUnchangedCaptions(draftItems, items);
  } catch (err) {
    // 書き直しに失敗しても、下書きのまま投稿できるようにする（品質より継続性を優先）
    console.error(`⚠️ 文章の書き直しに失敗したため、下書きのまま使用します: ${err.message}`);
    items = draftItems;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  // 「本当に自然になっているか」を人間が見比べられるよう、下書きも別途保存しておく
  fs.writeFileSync(path.join(outputDir, "data-draft.json"), JSON.stringify(draftItems, null, 2), "utf-8");
  fs.writeFileSync(path.join(outputDir, "data.json"), JSON.stringify(items, null, 2), "utf-8");
  fs.writeFileSync(path.join(outputDir, "humanize-comparison.md"), buildHumanizeComparison(draftItems, items), "utf-8");
  fs.writeFileSync(path.join(outputDir, "variant.json"), JSON.stringify({ date: dateStr, variant }, null, 2), "utf-8");

  const top5 = [...items].sort((a, b) => a.importance - b.importance).slice(0, 5);
  fs.writeFileSync(path.join(outputDir, "top5.json"), JSON.stringify(top5, null, 2), "utf-8");

  console.log(`完了: output/${topic.slug}/${dateStr}/data.json（7本）, top5.json（上位5本）を生成しました。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
