// Stage D: Reliability Scoring（Section 9）
// 軽量Tierで事実要素のみを判定させ、スコアの加減算は決定的にconfigの重みで計算する。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callStructured } from "./llm-client.mjs";
import { getModelForTier } from "./model-tiers.mjs";
import { buildReliabilityFactorsTool, buildReliabilityFactorsPrompt } from "./prompts/score-reliability.mjs";
import { loadTaxonomy } from "./classify-news.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "..", "config", "reliability-scoring.json");

let cachedConfig = null;
export function loadReliabilityConfig() {
  if (!cachedConfig) {
    cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  }
  return cachedConfig;
}

const FACTOR_TO_WEIGHT_KEY = {
  hasOfficialPrimarySource: "officialPrimarySource",
  isMajorTrustedPublication: "majorTrustedPublication",
  hasMultipleIndependentSources: "multipleIndependentSources",
  hasConcreteEvidence: "concreteEvidence",
  isAnonymousOnlyClaim: "anonymousOnlyClaim",
  hasNoTraceableSource: "noTraceableSource",
  isHighRiskUnqualifiedClaim: "highRiskUnqualifiedClaim",
  isSensationalOrUnverifiable: "sensationalUnverifiable",
};

/**
 * 事実要素(boolean群)から、config化された重みで0〜100のスコアを決定的に算出する。
 */
export function computeReliabilityScore(factors, config = loadReliabilityConfig()) {
  let score = config.baseScore;
  for (const [factorKey, weightKey] of Object.entries(FACTOR_TO_WEIGHT_KEY)) {
    if (factors[factorKey]) {
      score += config.weights[weightKey];
    }
  }
  return Math.min(Math.max(Math.round(score), 0), 100);
}

/**
 * @param {object} item
 * @returns {Promise<{score:number, sourceType:string, factors:object}>}
 */
export async function scoreReliability(item) {
  const taxonomy = loadTaxonomy();
  const config = loadReliabilityConfig();
  const model = getModelForTier("lightest");
  const tool = buildReliabilityFactorsTool(taxonomy.sourceTypeHierarchy);
  const userPrompt = buildReliabilityFactorsPrompt(item);

  const factors = await callStructured({
    model,
    system: "あなたは報道の情報源信頼性を評価するファクトチェッカーです。断定を避け、根拠が無ければfalseとしてください。",
    userPrompt,
    tool,
    label: "reliability-scoring",
    maxTokens: 500,
  });

  const score = computeReliabilityScore(factors, config);

  return { score, sourceType: factors.sourceType, factors };
}
