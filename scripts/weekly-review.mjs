// 週次レビュー: 直近7日分の投稿データ＋手入力の収益・エンゲージメント数値をもとに、
// 収支（P/L）と改善提案をまとめたレポートを生成する。
//
// 必要な環境変数: ANTHROPIC_API_KEY, TOPIC

import fs from "node:fs";
import path from "node:path";
import { loadTopic } from "./topic-context.mjs";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const { topic, root } = loadTopic();

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

const today = new Date();
const week = isoWeek(today);

// 直近7日分の output/<topic>/<date>/data.json を集める
function collectLastWeekData() {
  const topicOutputDir = path.join(root, "output", topic.slug);
  if (!fs.existsSync(topicOutputDir)) return [];
  const dates = fs
    .readdirSync(topicOutputDir)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .slice(-7);

  return dates.map((date) => {
    const dataPath = path.join(topicOutputDir, date, "data.json");
    const data = fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath, "utf-8")) : [];
    return { date, items: data.map((d) => ({ headline: d.headline, category: d.category, importance: d.importance })) };
  });
}

function loadMetrics() {
  const metricsPath = path.join(root, "metrics", topic.slug, `${week}.json`);
  if (!fs.existsSync(metricsPath)) {
    const templatePath = path.join(root, "metrics", topic.slug, "TEMPLATE.json");
    const template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
    template.week = week;
    fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
    fs.writeFileSync(metricsPath, JSON.stringify(template, null, 2), "utf-8");
    console.log(
      `metrics/${topic.slug}/${week}.json が無かったため、テンプレートを新規作成しました。` +
        `数値を入力してから再実行すると、より精度の高いレポートになります（今回は0のまま計算します）。`
    );
    return template;
  }
  return JSON.parse(fs.readFileSync(metricsPath, "utf-8"));
}

function loadCostEstimate() {
  const costPath = path.join(root, "config", "cost-estimates.json");
  const cfg = JSON.parse(fs.readFileSync(costPath, "utf-8"));
  const monthlyTotal = Object.values(cfg.monthlyCostJPY).reduce((a, b) => a + b, 0);
  return Math.round(monthlyTotal / 4.33); // 週割り概算
}

async function analyzeWithClaude(weekData) {
  if (!API_KEY) {
    return "（ANTHROPIC_API_KEYが未設定のため、見出し傾向のAI分析はスキップされました）";
  }
  const prompt = `
以下は直近7日間、「${topic.displayName}」というテーマで発信した見出し・カテゴリのデータです。
このデータだけから読み取れる範囲で、以下を簡潔に述べてください（実際のエンゲージメント数値は無いため、
内容面の偏り・多様性・改善余地についてのみ言及してください。過度な断定は避けてください）：

1. カテゴリの偏り（特定カテゴリに寄りすぎていないか）
2. 見出しの表現パターンに単調さがないか
3. 来週の見出し作成・カテゴリ選定において試す価値がありそうな改善案を2〜3個

データ:
${JSON.stringify(weekData, null, 2)}
`.trim();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return `（AI分析中にエラーが発生しました: ${res.status}）`;
  const data = await res.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function buildReport({ week, metrics, weeklyCost, analysis, weekData }) {
  const revenue = Object.values(metrics.revenueJPY).reduce((a, b) => a + b, 0);
  const profit = revenue - weeklyCost;

  return `# 週次レビュー（${topic.displayName} / ${week}）

## 収支サマリー（P/L）

| 項目 | 金額（円） |
|---|---|
| アフィリエイト収益（概算） | ${metrics.revenueJPY.affiliateEstimate} |
| AdSense収益 | ${metrics.revenueJPY.adsense} |
| note売上 | ${metrics.revenueJPY.noteSales} |
| PR案件収益 | ${metrics.revenueJPY.prDeals} |
| **収益合計** | **${revenue}** |
| 週割り運用コスト（概算） | ${weeklyCost} |
| **収支（黒字/赤字）** | **${profit >= 0 ? "+" : ""}${profit}** |

> コストは \`config/cost-estimates.json\` の月額設定を7日/30.4日で概算したものです。実際の請求額が分かったら随時更新してください。
> 収益は \`metrics/${topic.slug}/${week}.json\` に手入力した数値です。0のままの項目は未入力の可能性があります。

## エンゲージメント（手入力分）

- 総インプレッション：${metrics.engagement.totalImpressions}
- サイトへのクリック数：${metrics.engagement.totalClicksToSite}
- フォロワー増加（X/Instagram/Threads）：${metrics.engagement.followersGained_X} / ${metrics.engagement.followersGained_Instagram} / ${metrics.engagement.followersGained_Threads}

## 今週投稿した見出し（${weekData.length}日分）

${weekData.map((d) => `**${d.date}**\n${d.items.map((i) => `- [重要度${i.importance}] ${i.headline}（${i.category}）`).join("\n")}`).join("\n\n")}

## AIによる傾向分析・改善提案

${analysis}

## 次のアクション（チェックリスト）

- [ ] \`metrics/${topic.slug}/${week}.json\` の数値をBuffer/GA4/noteの管理画面を見て更新した
- [ ] 上記の改善提案のうち、来週試すものを決めた
- [ ] 必要であれば \`config/topics/${topic.slug}.json\` の systemPrompt を調整した
`;
}

async function main() {
  const weekData = collectLastWeekData();
  const metrics = loadMetrics();
  const weeklyCost = loadCostEstimate();
  const analysis = await analyzeWithClaude(weekData);

  const report = buildReport({ week, metrics, weeklyCost, analysis, weekData });

  const outDir = path.join(root, "output", topic.slug, "weekly-reviews");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${week}.md`), report, "utf-8");

  console.log(`完了: output/${topic.slug}/weekly-reviews/${week}.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
