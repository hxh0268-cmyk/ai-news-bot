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
import { loadRecentMonetizationTools, buildMonetizationToolExclusionSection } from "./recent-monetization-tools.mjs";
import { buildMockResponse } from "./mock-response.mjs";

const API_KEY = process.env.ANTHROPIC_API_KEY;
// MOCK_MODE=true の間は実際のAnthropic API呼び出しを一切行わないため、
// APIキー未設定でも起動できる。
const MOCK_MODE = process.env.MOCK_MODE === "true";
if (!API_KEY && !MOCK_MODE) {
  console.error("ANTHROPIC_API_KEYが設定されていません。GitHub Secretsに登録してください。");
  process.exit(1);
}

const MODEL = "claude-sonnet-5";
const { topic, dateStr, outputDir, root } = loadTopic();

// 重複回避：直近の「AIマネタイズ副業」記事で取り上げたツールを除外リストとして
// プロンプトに渡す（generate.mjsのloadRecentHeadlines/buildExclusionSectionと
// 同じ考え方）。
const recentTools = loadRecentMonetizationTools({ root, topicSlug: topic.slug, dateStr });
const toolExclusionSection = buildMonetizationToolExclusionSection(recentTools);
console.log(
  `[${topic.slug}] 重複回避: 直近${recentTools.length}回で取り上げたツールを除外リストに追加しました。`
);

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
${toolExclusionSection}

【記事の構成・厳守】
以下の6セクション構成で、合計1,000〜1,500字程度で書いてください。1,500字は
上限の目安であり、大きく超えないこと（超えそうな場合は料金プランの説明を
簡潔にするなどして調整する）。本文の充実を優先し、セクションを埋めるためだけの
水増しはしないこと。

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

【出力形式・厳守】
- 各項目は指定された型（配列は配列、オブジェクトはオブジェクト）でそのまま提出すること。
  配列の項目を1つの文字列にまとめて提出してはいけない
- Web検索結果を参照・引用する際も、<cite>のような特殊なマークアップタグや
  出典番号の注釈記号を本文中に一切含めないこと。参照した事実は、タグを使わず
  普通の日本語の文章として書き直してから記載する

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
  if (MOCK_MODE) {
    return buildMockResponse(ARTICLE_SCHEMA);
  }

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

  // ツール呼び出しの構造検証。実測で、web検索の引用マークアップ生成と
  // ツール入力の生成が競合し、配列であるべき項目が文字列（しかも
  // <parameter name="...">のような壊れたタグ混じり）になって返ってくる
  // ケースが確認された。ここで検知した場合は例外を投げてwithRetryに
  // 再試行させる（そのまま使うと構造が壊れた記事が公開されてしまうため）。
  validateArticleShape(submitBlock.input);
  return submitBlock.input;
}

function validateArticleShape(article) {
  const problems = [];
  if (typeof article.toolName !== "string" || !article.toolName) problems.push("toolNameが文字列ではありません");
  if (!Array.isArray(article.hypotheticalWorkflow)) problems.push("hypotheticalWorkflowが配列ではありません");
  if (typeof article.beforeAfter !== "object" || article.beforeAfter === null || Array.isArray(article.beforeAfter)) {
    problems.push("beforeAfterがオブジェクトではありません");
  }
  if (!Array.isArray(article.recommendedFor)) problems.push("recommendedForが配列ではありません");
  if (!Array.isArray(article.pricingPlans)) problems.push("pricingPlansが配列ではありません");
  if (!Array.isArray(article.caveats)) problems.push("caveatsが配列ではありません");
  if (JSON.stringify(article).includes("<parameter")) problems.push("壊れたツール呼び出し構文(<parameter ...>)が混入しています");
  if (problems.length > 0) {
    // 原因調査のため、壊れた生データをログに残す（withRetryが再試行するため
    // 処理自体は止まらないが、繰り返し発生する場合の分析に使う）。
    console.error("壊れた出力の生データ:", JSON.stringify(article, null, 2).slice(0, 3000));
    throw new Error(`submit_monetization_articleの出力構造が不正です: ${problems.join(" / ")}`);
  }
}

// Web検索結果を直接引用した際にClaudeが挿入することがある<cite index="...">タグを
// 取り除き、中のテキストだけを残す（本文にマークアップがそのまま漏れるのを防ぐ）。
function stripCitationTags(value) {
  if (typeof value === "string") {
    return value.replace(/<cite[^>]*>/g, "").replace(/<\/cite>/g, "");
  }
  if (Array.isArray(value)) return value.map(stripCitationTags);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripCitationTags(v)]));
  }
  return value;
}

// 断定的な収益保証表現が紛れ込んでいないかの簡易チェック（ここで検知しても処理は
// 止めない。既存のlogHeadlinePatternBias等と同じく、ログで気づけるようにするだけ）。
const BANNED_PHRASES = ["必ず稼げる", "確実に稼げる", "月収.*万円確実", "誰でも稼げる", "絶対に儲かる"];
// 「確実に稼げるとは限らない」のような、断定を打ち消す文脈での一致を
// 誤検知しないためのガード（直後NEGATION_WINDOW文字以内に否定表現が
// あれば違反とみなさない）。
const NEGATION_WINDOW = 15;
const NEGATION_MARKERS = ["とは限ら", "わけではな", "ではない", "限らない", "保証するものではな", "とは言い切れな"];
function logSafetyCheck(article) {
  const text = JSON.stringify(article);
  const hits = [];
  for (const phrase of BANNED_PHRASES) {
    const re = new RegExp(phrase, "g");
    let match;
    while ((match = re.exec(text)) !== null) {
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + NEGATION_WINDOW);
      if (!NEGATION_MARKERS.some((marker) => after.includes(marker))) {
        hits.push(match[0]);
      }
    }
  }
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
  // retries: 3（計4回試行）。実測で、ツール呼び出しの構造が壊れる不具合が
  // 2回連続で発生したケースがあったため、既存の2回から引き上げている。
  const rawArticle = await withRetry(() => callClaude(), { retries: 3, baseDelayMs: 15000, label: "マネタイズ記事生成" });
  const article = stripCitationTags(rawArticle);

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
