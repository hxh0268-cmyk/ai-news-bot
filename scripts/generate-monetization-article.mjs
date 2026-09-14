// STEP1.9（試験導入）: 「AIマネタイズ副業」カテゴリの長文レビュー記事を1本生成する。
//
// 既存の7本の速報ニュース（generate.mjs、本文300〜700字・カード画像/動画ナレーション
// 前提の共通スキーマ）とは別経路で、サイト掲載専用の長文記事（1,000〜1,500字・
// 6セクション構成）を独立生成する。data.json・top5.jsonには一切書き込まず、
// カード画像生成（render-cards.mjs）・動画生成（build-video.sh）には影響しない。
//
// 出力: output/<topic>/<date>/monetization-article.json
//
// 【小規模テスト段階について】
// 本番の日次ワークフロー（generate.yml）にはまだ接続していない。まずは実APIで
// 数回試験生成し、内容の質・文字数・トーンを人間が確認してから、サイトへの表示
// （render-site.mjs側の対応）・本番導入を判断する。
import fs from "node:fs";
import path from "node:path";
import { loadTopic } from "./topic-context.mjs";
import { withRetry } from "./retry.mjs";
import { HUMANIZE_STYLE_GUIDE } from "./humanize-style.mjs";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEYが設定されていません。GitHub Secretsに登録してください。");
  process.exit(1);
}

const MODEL = "claude-sonnet-5";
const { topic, dateStr, outputDir } = loadTopic();

// 頻度の目安（1日7本のニュースのうち1〜2本、という当初の目安を、独立生成である
// 本スクリプトでは「週7日のうち1〜2日」に読み替えた運用ルール。火・金に生成する。
// FORCE_MONETIZATION_ARTICLE=true を指定すると曜日に関わらず生成する（試験生成用）。
const CADENCE_DAYS_OF_WEEK = [2, 5]; // 0=日, 1=月, 2=火, ..., 5=金, 6=土
const FORCE = process.env.FORCE_MONETIZATION_ARTICLE === "true";

function shouldGenerateToday() {
  if (FORCE) return true;
  const dow = new Date(dateStr).getDay();
  return CADENCE_DAYS_OF_WEEK.includes(dow);
}

const SYSTEM_PROMPT = `
${topic.monetizationArticleRole || "あなたはAI活用による副業・業務効率化を、実務目線でレビューする編集者です。"}

【今日のテーマ選定】
「AIを使って個人が収益化・副業に活かせるツールやサービス、あるいは業務効率化の手法」を1つ選び、
レビュー記事を書いてください。既に広く知られた話題の焼き直しではなく、具体的な1つのツール／
サービス／手法に絞り込んでください。選定にあたっては必ずWeb検索で公式サイトの最新情報を確認し、
料金プラン等の事実関係は公式情報のみを根拠にしてください。

【記事の構成・厳守】
以下の6セクション構成で、合計1,000〜1,500字程度（目安。本文の充実を優先し、
セクションを埋めるためだけの水増しはしないこと）で書いてください。

1. 何のツール/手法か（1〜2文の簡潔な紹介）
2. 実際に使ってみた具体的な作業内容（仮想的な業務シナリオでも構わないが、
   事実に基づかない具体的な成果数値（収益額・PV数等）は創作しないこと）
3. Before/After（導入前後での時間・工数の変化の目安。厳密な実測値ではなく
   「目安」であることが伝わる書き方にする）
4. こんな人におすすめ
5. 料金プラン（公式サイトに掲載されている情報のみを使用し、金額を創作しないこと。
   料金体系が不明瞭・非公開の場合は、その旨を正直に書く）
6. 注意点・デメリット

【安全ルール・厳守（違反した記事は不合格）】
- 「必ず稼げる」「月収◯万円確実」など、収益を保証・断定する表現は一切禁止する
- 実際には確認していない収益実績（自分や他人の体験談を装った具体的な金額等）を創作しない
- アフィリエイトリンクを含める場合（将来的に追加される可能性がある）は、
  「PR」または「本記事はアフィリエイトプログラムによる収益を得ている場合があります」
  という表記を必ず併記すること（本サイトのprivacy.htmlの開示表記と表現を統一する）。
  ただし今回の生成では実際のアフィリエイトリンクはまだ挿入しないため、
  該当箇所が無ければこの表記は不要。
- 断定的すぎる主張には「〜な場合が多い」「〜という声もある」など、幅を持たせた
  表現を使う

${HUMANIZE_STYLE_GUIDE}

情報収集が終わったら、必ず submit_monetization_article ツールを使って結果を提出してください。
`.trim();

const USER_PROMPT = `${dateStr}時点の最新情報を調べて、上記フォーマットで「AIマネタイズ副業」記事を1本作成してください。作成し終えたら submit_monetization_article ツールで提出してください。`;

const ARTICLE_SCHEMA = {
  type: "object",
  properties: {
    toolName: { type: "string" },
    officialUrl: { type: "string" },
    oneLinerIntro: { type: "string" },
    hypotheticalWorkflow: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
    beforeAfter: {
      type: "object",
      properties: {
        before: { type: "string" },
        after: { type: "string" },
        note: { type: "string" },
      },
      required: ["before", "after"],
    },
    recommendedFor: { type: "array", items: { type: "string" } },
    pricingPlans: {
      type: "array",
      items: {
        type: "object",
        properties: {
          planName: { type: "string" },
          price: { type: "string" },
          description: { type: "string" },
        },
        required: ["planName", "price"],
      },
    },
    caveats: { type: "array", items: { type: "string" } },
    sourceLine: { type: "string" },
    affiliateDisclosureIncluded: { type: "boolean" },
  },
  required: [
    "toolName",
    "officialUrl",
    "oneLinerIntro",
    "hypotheticalWorkflow",
    "beforeAfter",
    "recommendedFor",
    "pricingPlans",
    "caveats",
    "sourceLine",
  ],
};

const SUBMIT_TOOL = {
  name: "submit_monetization_article",
  description: "作成したAIマネタイズ副業記事を提出する。",
  input_schema: ARTICLE_SCHEMA,
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
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: USER_PROMPT }],
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 8 },
        SUBMIT_TOOL,
      ],
    }),
    // generate.mjsと同じ理由（Web検索込みで数分かかる）で、fetchのデフォルト
    // タイムアウトより十分長く設定する。
    signal: AbortSignal.timeout(480000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude APIエラー: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const submitBlock = data.content.find((b) => b.type === "tool_use" && b.name === "submit_monetization_article");

  if (!submitBlock?.input) {
    console.error("stop_reason:", data.stop_reason);
    console.error("content block types:", data.content.map((b) => b.type).join(", "));
    const textFallback = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    throw new Error("submit_monetization_articleツールの呼び出しが見つかりませんでした。テキスト出力:\n" + textFallback);
  }
  return submitBlock.input;
}

// 断定的な収益保証表現が紛れ込んでいないかの簡易チェック（ここで検知しても処理は
// 止めない。既存のlogHeadlinePatternBias等と同じく、ログで気づけるようにするだけ）。
const BANNED_PHRASES = ["必ず稼げる", "確実に稼げる", "月収.*万円確実", "誰でも稼げる", "絶対に儲かる"];
function logSafetyCheck(article) {
  const text = JSON.stringify(article);
  const hits = BANNED_PHRASES.filter((p) => new RegExp(p).test(text));
  if (hits.length > 0) {
    console.warn(`⚠️ 安全ルール違反の疑いのある表現が含まれています: ${hits.join(", ")}`);
  } else {
    console.log("✅ 安全ルールチェック: 断定的な収益保証表現は検知されませんでした。");
  }
}

// APIが（スキーマ指定にもかかわらず）配列以外の値を返すケースへの防御。
// 単一オブジェクト/文字列で返ってきた場合はラップし、null/undefinedは空配列にする。
function toArray(v) {
  if (Array.isArray(v)) return v;
  return v ? [v] : [];
}

function countCharacters(article) {
  const parts = [
    article.oneLinerIntro,
    ...toArray(article.hypotheticalWorkflow),
    article.beforeAfter?.before,
    article.beforeAfter?.after,
    article.beforeAfter?.note,
    ...toArray(article.recommendedFor),
    ...toArray(article.pricingPlans).map((p) => `${p.planName || ""}${p.price || ""}${p.description || ""}`),
    ...toArray(article.caveats),
  ];
  return parts.filter(Boolean).join("").length;
}

async function main() {
  if (!shouldGenerateToday()) {
    console.log(
      `[${topic.slug}] 本日(${dateStr})はAIマネタイズ副業記事の生成対象日ではありません（対象: 火・金）。スキップします。`
    );
    return;
  }

  console.log(`[${topic.slug}] Claude APIにAIマネタイズ副業記事(${dateStr})の生成を依頼しています…`);
  const article = await withRetry(() => callClaude(), { retries: 2, baseDelayMs: 15000, label: "マネタイズ記事生成" });

  // 文字数集計・安全チェックより先に生の結果を保存しておく。集計処理側で
  // 想定外の形（配列のはずが単一値等）が来て例外になっても、生成結果自体は
  // 失わずに確認できるようにするため。
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "monetization-article-raw.json"),
    JSON.stringify(article, null, 2),
    "utf-8"
  );

  const charCount = countCharacters(article);
  console.log(`文字数目安: ${charCount}字（目標1,000〜1,500字）`);
  if (charCount < 1000 || charCount > 1500) {
    console.warn(`⚠️ 目標文字数(1,000〜1,500字)から外れています: ${charCount}字`);
  }
  logSafetyCheck(article);

  fs.writeFileSync(
    path.join(outputDir, "monetization-article.json"),
    JSON.stringify({ dateStr, category: "ai-monetization", charCount, ...article }, null, 2),
    "utf-8"
  );
  console.log(`完了: output/${topic.slug}/${dateStr}/monetization-article.json を生成しました（ツール: ${article.toolName}）。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
