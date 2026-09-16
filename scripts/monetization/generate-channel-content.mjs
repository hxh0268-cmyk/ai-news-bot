// Stage F: Model Tier別 Web / X channel-specific generation（Section 13, 13.1）
//
// 重要: この関数はchannelsForDecision()の結果でゲートされることを前提としており、
// 呼び出し側（run-shadow-mode.mjs等）がREJECT/HUMAN_REVIEW_REQUIREDの候補に対して
// この関数を呼び出さないことで、高コストモデルの呼び出しを回避する
// （2段階構造: 軽量Tierでのスコアリング→確定した候補のみ重いTierで生成）。
import { callStructured } from "./llm-client.mjs";
import { getModelForTier } from "./model-tiers.mjs";
import { WEB_BREAKING_TOOL, buildWebBreakingPrompt } from "./prompts/generate-web-breaking.mjs";
import { WEB_EXPLAINER_TOOL, buildWebExplainerPrompt } from "./prompts/generate-web-explainer.mjs";
import { X_POST_TOOL, buildXPostPrompt } from "./prompts/generate-x-post.mjs";

const GENERATION_SYSTEM_PROMPT =
  "あなたはAIニュースメディアのライターです。事実に基づいた記述のみ行い、価格・仕様・引用・統計を創作しないでください。" +
  "判断できない場合はUNKNOWNと明記してください。";

export async function generateWebBreaking(item) {
  const model = getModelForTier("mid");
  const result = await callStructured({
    model,
    system: GENERATION_SYSTEM_PROMPT,
    userPrompt: buildWebBreakingPrompt(item),
    tool: WEB_BREAKING_TOOL,
    label: "generate-web-breaking",
    maxTokens: 1500,
  });
  return { channel: "web-breaking", model, ...result };
}

export async function generateWebExplainer(item) {
  const model = getModelForTier("high");
  const result = await callStructured({
    model,
    system: GENERATION_SYSTEM_PROMPT,
    userPrompt: buildWebExplainerPrompt(item),
    tool: WEB_EXPLAINER_TOOL,
    label: "generate-web-explainer",
    maxTokens: 6000,
  });
  return { channel: "web-explainer", model, ...result };
}

export async function generateXPost(item) {
  const model = getModelForTier("mid");
  const result = await callStructured({
    model,
    system: GENERATION_SYSTEM_PROMPT,
    userPrompt: buildXPostPrompt(item),
    tool: X_POST_TOOL,
    label: "generate-x-post",
    maxTokens: 500,
  });
  return { channel: "x-post", model, ...result };
}

/**
 * channelsForDecision()の結果に基づき、許可されたチャネルのみ生成する。
 * @param {object} item
 * @param {{webBreaking:boolean, webExplainer:boolean, xPost:boolean}} channels
 */
export async function generateChannelContent(item, channels) {
  const results = {};
  if (channels.webBreaking) results.webBreaking = await generateWebBreaking(item);
  if (channels.webExplainer) results.webExplainer = await generateWebExplainer(item);
  if (channels.xPost) results.xPost = await generateXPost(item);
  return results;
}
