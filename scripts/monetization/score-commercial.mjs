// Stage C: Commercial News Scoring（Section 7）
// 軽量Tier（lightest）で実行し、構造化スコアのみを出力する。長文生成は行わない。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callStructured } from "./llm-client.mjs";
import { getModelForTier } from "./model-tiers.mjs";
import { buildCommercialScoringTool, buildCommercialScoringPrompt } from "./prompts/score-commercial-value.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "..", "config", "content-scoring.json");

let cachedConfig = null;
export function loadScoringConfig() {
  if (!cachedConfig) {
    cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  }
  return cachedConfig;
}

/**
 * breakdownの各値をconfigの上限でclampし、合計が100を超えないことを保証する
 * （fail-closedではなくdeterministicなガード。LLMが上限を超えて返しても
 * ここで機械的に是正する）。
 */
export function clampBreakdown(breakdown, weights) {
  const clamped = {};
  for (const key of Object.keys(weights)) {
    const raw = Number(breakdown?.[key] ?? 0);
    const max = weights[key];
    clamped[key] = Math.min(Math.max(Number.isFinite(raw) ? raw : 0, 0), max);
  }
  return clamped;
}

export function sumBreakdown(clampedBreakdown) {
  return Object.values(clampedBreakdown).reduce((a, b) => a + b, 0);
}

/**
 * ニュース候補1件についてCommercial News Score(0〜100)を算出する。
 * @param {object} item - generate.mjsのNEWS_ITEM_SCHEMAに準拠したニュース候補
 * @returns {Promise<{total:number, breakdown:object, reasoningSummary:string[]}>}
 */
export async function scoreCommercialValue(item) {
  const config = loadScoringConfig();
  const weights = config.commercialScoreWeights;
  const model = getModelForTier("lightest");

  const tool = buildCommercialScoringTool(weights);
  const userPrompt = buildCommercialScoringPrompt(item, weights);

  const result = await callStructured({
    model,
    system: "あなたはAIニュースメディアの編集アシスタントです。与えられた基準に従って公正にスコアリングしてください。",
    userPrompt,
    tool,
    label: "commercial-scoring",
    maxTokens: 1000,
  });

  const breakdown = clampBreakdown(result.breakdown, weights);
  const total = sumBreakdown(breakdown);

  return {
    total,
    breakdown,
    reasoningSummary: Array.isArray(result.reasoningSummary) ? result.reasoningSummary.slice(0, 3) : [],
  };
}
