// Stage E (後半): 統合配信判定（Section 10.1）
// 「実装者の解釈に委ねないこと」という指示のため、判定はconfig/distribution-decision-matrix.json
// のテーブルをそのまま参照する形にし、コード側にロジックとしての閾値分岐を持たせない。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadReliabilityConfig } from "./score-reliability.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATRIX_PATH = path.join(__dirname, "..", "..", "config", "distribution-decision-matrix.json");

let cachedMatrix = null;
export function loadDecisionMatrix() {
  if (!cachedMatrix) {
    cachedMatrix = JSON.parse(fs.readFileSync(MATRIX_PATH, "utf-8"));
  }
  return cachedMatrix;
}

export function resolveCommercialBand(commercialScore, matrix = loadDecisionMatrix()) {
  const band = matrix.commercialBands.find((b) => commercialScore >= b.min && commercialScore <= b.max);
  if (!band) throw new Error(`commercialScoreがband範囲外です: ${commercialScore}`);
  return band.label;
}

/**
 * Section 10.1 補足ルール: high-riskカテゴリは常にHIGH_RISK_MIN列を使う。
 * それ以外は、AUTO_PUBLISH_MIN以上ならAUTO_PUBLISH_MIN列、HIGH_RISK_MIN以上なら
 * HIGH_RISK_MIN列、それ未満はBELOW_AUTO_PUBLISH_MIN列。
 */
export function resolveReliabilityColumn(reliabilityScore, isHighRiskCategory, reliabilityConfig = loadReliabilityConfig()) {
  const { AUTO_PUBLISH_MIN_RELIABILITY, HIGH_RISK_MIN_RELIABILITY } = reliabilityConfig.thresholds;

  if (isHighRiskCategory) {
    // high-riskカテゴリは、HIGH_RISK_MIN_RELIABILITYを満たすかどうかだけを見る。
    // 満たさない場合は「AUTO_PUBLISH_MIN列」ではなく、常により厳しい判定に倒す。
    return reliabilityScore >= HIGH_RISK_MIN_RELIABILITY ? "HIGH_RISK_MIN" : "BELOW_AUTO_PUBLISH_MIN";
  }
  if (reliabilityScore >= HIGH_RISK_MIN_RELIABILITY) return "HIGH_RISK_MIN";
  if (reliabilityScore >= AUTO_PUBLISH_MIN_RELIABILITY) return "AUTO_PUBLISH_MIN";
  return "BELOW_AUTO_PUBLISH_MIN";
}

/**
 * Section 10.1の統合判定テーブルに基づき、単一の最終判定を返す。
 * @param {object} params
 * @param {number} params.commercialScore
 * @param {number} params.reliabilityScore
 * @param {boolean} params.isHighRiskCategory
 * @param {string} [params.highRiskCategoryLabel]
 * @returns {{decision:string, humanReviewRequired:boolean, humanReviewReason:string, commercialBand:string, reliabilityColumn:string}}
 */
export function decideDistribution({ commercialScore, reliabilityScore, isHighRiskCategory, highRiskCategoryLabel }) {
  const matrix = loadDecisionMatrix();
  const reliabilityConfig = loadReliabilityConfig();

  const commercialBand = resolveCommercialBand(commercialScore, matrix);
  const reliabilityColumn = resolveReliabilityColumn(reliabilityScore, isHighRiskCategory, reliabilityConfig);
  const decision = matrix.matrix[commercialBand][reliabilityColumn];

  const humanReviewRequired = decision === "HUMAN_REVIEW_REQUIRED";
  let humanReviewReason = "";
  if (humanReviewRequired) {
    humanReviewReason = isHighRiskCategory
      ? `HIGH_RISK_CATEGORY_LOW_RELIABILITY(${highRiskCategoryLabel || "unknown"}, reliability=${reliabilityScore})`
      : `LOW_RELIABILITY_HIGH_COMMERCIAL(commercial=${commercialScore}, reliability=${reliabilityScore})`;
  }

  return { decision, humanReviewRequired, humanReviewReason, commercialBand, reliabilityColumn };
}

/** Stage F: どのチャネル(Web速報/Web解説/X)を生成してよいかを配信判定から導く。 */
export function channelsForDecision(decision) {
  switch (decision) {
    case "FULL_DISTRIBUTION":
    case "WEB_AND_X":
      return { webBreaking: true, webExplainer: true, xPost: true };
    case "WEB_ONLY_CANDIDATE":
      return { webBreaking: true, webExplainer: true, xPost: false };
    case "HUMAN_REVIEW_REQUIRED":
    case "REJECT":
    default:
      // Section 13.1: REJECT/WEB_ONLY_CANDIDATE未満には生成コストを一切かけない。
      // HUMAN_REVIEW_REQUIREDは「自動非公開」が確定するまでは生成しない
      // （Cost Awareness優先。人間の判断待ちの候補に高コストモデルを先行投入しない）。
      return { webBreaking: false, webExplainer: false, xPost: false };
  }
}
