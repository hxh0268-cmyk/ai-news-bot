// Stage I: Shadow Mode（Section 27 Stage 1）
//
// 既存の日次生成フロー（generate.mjs等）が書き出した output/<topic>/<date>/data.json
// を読み込み、重複排除→分類→Commercial Scoring→Reliability Scoring→統合配信判定
// を行い、結果をログ/レポートとしてのみ残す。既存のtop5.json・PR作成・公開判断には
// 一切書き込み・介入しない（Section 27: 「実際の公開判断には一切使用しない」）。
//
// Cost Awareness（Philosophy #11）に基づき、Shadow Mode実行時はデフォルトで
// 軽量Tier（分類・スコアリング）のみ実行し、Web解説/X投稿等の重いチャネル生成は
// 行わない（SHADOW_MODE_GENERATE_CONTENT=trueを指定した場合のみ、配信判定で
// 許可されたチャネルに限り生成する）。
import fs from "node:fs";
import path from "node:path";
import { loadTopic } from "../topic-context.mjs";
import { deduplicateItems } from "./dedup.mjs";
import { classifyNews } from "./classify-news.mjs";
import { scoreCommercialValue } from "./score-commercial.mjs";
import { scoreReliability } from "./score-reliability.mjs";
import { decideDistribution, channelsForDecision } from "./distribution-decision.mjs";
import { generateChannelContent } from "./generate-channel-content.mjs";
import { createContentMetadata } from "./schema.mjs";
import { collectFlaggedItems, formatHumanReviewBody } from "./human-review-escalation.mjs";
import { createLogger, LOG_EVENT_TYPES } from "./logger.mjs";
import { FAILURE_CATEGORY } from "./failure-taxonomy.mjs";

const GENERATE_CONTENT = process.env.SHADOW_MODE_GENERATE_CONTENT === "true";

async function scoreOneItem(item, logger) {
  logger.log(LOG_EVENT_TYPES.NEWS_DISCOVERED, { headline: item.headline, category: item.category });

  let classification;
  let commercial;
  let reliability;
  try {
    classification = await classifyNews(item);
    commercial = await scoreCommercialValue(item);
    logger.log(LOG_EVENT_TYPES.COMMERCIAL_SCORE_GENERATED, { headline: item.headline, total: commercial.total });

    reliability = await scoreReliability(item);
    logger.log(LOG_EVENT_TYPES.RELIABILITY_SCORE_GENERATED, {
      headline: item.headline,
      score: reliability.score,
      sourceType: reliability.sourceType,
    });
  } catch (err) {
    logger.log(LOG_EVENT_TYPES.ANALYTICS_EVENT, {
      failureCategory: FAILURE_CATEGORY.PROVIDER_FAILED,
      headline: item.headline,
      message: err.message,
    });
    throw err;
  }

  const distribution = decideDistribution({
    commercialScore: commercial.total,
    reliabilityScore: reliability.score,
    isHighRiskCategory: classification.isHighRiskCategory,
    highRiskCategoryLabel: classification.highRiskCategoryLabel,
  });
  logger.log(LOG_EVENT_TYPES.DISTRIBUTION_DECISION, {
    headline: item.headline,
    decision: distribution.decision,
    commercialBand: distribution.commercialBand,
    reliabilityColumn: distribution.reliabilityColumn,
  });

  if (distribution.humanReviewRequired) {
    logger.log(LOG_EVENT_TYPES.HUMAN_REVIEW_FLAGGED, { headline: item.headline, reason: distribution.humanReviewReason });
  }

  const metadata = createContentMetadata({
    contentType: classification.contentType,
    primaryCategory: classification.primaryCategory,
    secondaryCategories: classification.secondaryCategories,
    sourceType: reliability.sourceType,
    commercialScore: commercial.total,
    reliabilityScore: reliability.score,
    distributionDecision: distribution.decision,
    evergreenPotential: classification.evergreenPotential,
    humanReviewRequired: distribution.humanReviewRequired,
    humanReviewReason: distribution.humanReviewReason,
  });

  const channels = channelsForDecision(distribution.decision);
  let generatedContent = null;
  if (GENERATE_CONTENT && (channels.webBreaking || channels.webExplainer || channels.xPost)) {
    generatedContent = await generateChannelContent(item, channels);
    logger.log(LOG_EVENT_TYPES.CONTENT_GENERATION, {
      headline: item.headline,
      channels: Object.keys(generatedContent),
    });
  }

  return {
    headline: item.headline,
    category: item.category,
    metadata,
    commercialBreakdown: commercial.breakdown,
    reasoningSummary: commercial.reasoningSummary,
    reliabilityFactors: reliability.factors,
    channels,
    generatedContent,
  };
}

export async function runShadowMode({ outputDir, dateStr, topicSlug }) {
  const dataPath = path.join(outputDir, "data.json");
  if (!fs.existsSync(dataPath)) {
    throw new Error(`data.jsonが見つかりません: ${dataPath}`);
  }
  const items = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

  const logPath = path.join(outputDir, "monetization-engine-shadow.log.jsonl");
  const logger = createLogger(logPath);

  const { accepted, rejected } = deduplicateItems(items);
  for (const dup of rejected) {
    logger.log(LOG_EVENT_TYPES.NEWS_DEDUPLICATED, {
      headline: dup.item.headline,
      reason: dup.reason,
      matchedWith: dup.matchedWith.headline,
      similarity: dup.similarity,
    });
  }

  const scored = [];
  for (const item of accepted) {
    scored.push(await scoreOneItem(item, logger));
  }

  const flagged = collectFlaggedItems(
    scored.map((s) => ({
      headline: s.headline,
      humanReviewRequired: s.metadata.humanReviewRequired,
      humanReviewReason: s.metadata.humanReviewReason,
      commercialScore: s.metadata.commercialScore,
      reliabilityScore: s.metadata.reliabilityScore,
    }))
  );

  const report = {
    topicSlug,
    dateStr,
    generatedAt: new Date().toISOString(),
    mode: "SHADOW",
    totalCandidates: items.length,
    duplicatesFiltered: rejected.length,
    scored: scored.map((s) => ({
      headline: s.headline,
      category: s.category,
      ...s.metadata,
      commercialBreakdown: s.commercialBreakdown,
      reasoningSummary: s.reasoningSummary,
      channelsEligible: s.channels,
      contentGenerated: Boolean(s.generatedContent),
    })),
    humanReviewFlaggedCount: flagged.length,
  };

  const reportJsonPath = path.join(outputDir, "monetization-engine-report.json");
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), "utf-8");

  const reportMdLines = [
    `# 収益化エンジン診断レポート（Shadow Mode）— ${topicSlug} ${dateStr}`,
    "",
    "> このレポートはShadow Modeで生成されており、実際の公開判断には使用されていません。",
    "",
    `- 候補数: ${items.length}件（うち重複排除: ${rejected.length}件）`,
    `- HUMAN_REVIEW_REQUIRED: ${flagged.length}件`,
    "",
    "| 見出し | Commercial | Reliability | 判定 |",
    "|---|---:|---:|---|",
    ...report.scored.map((s) => `| ${s.headline} | ${s.commercialScore} | ${s.reliabilityScore} | ${s.distributionDecision} |`),
  ];
  if (flagged.length > 0) {
    reportMdLines.push("", formatHumanReviewBody(flagged));
  }
  const reportMdPath = path.join(outputDir, "monetization-engine-report.md");
  fs.writeFileSync(reportMdPath, reportMdLines.join("\n"), "utf-8");

  return report;
}

// CLIとして直接実行された場合（TOPIC/CONTENT_DATE環境変数を使う既存の慣習に合わせる）
if (import.meta.url === `file://${process.argv[1]}`) {
  const { topic, dateStr, outputDir } = loadTopic();
  runShadowMode({ outputDir, dateStr, topicSlug: topic.slug })
    .then((report) => {
      console.log(
        `[${topic.slug}] Shadow Mode診断完了: ${report.scored.length}件処理、HUMAN_REVIEW_REQUIRED ${report.humanReviewFlaggedCount}件`
      );
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
