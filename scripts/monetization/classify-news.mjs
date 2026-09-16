// Stage B/D補助: classify-news（Section 30, Section 11）。軽量Tierで実行。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callStructured } from "./llm-client.mjs";
import { getModelForTier } from "./model-tiers.mjs";
import { buildClassifyNewsTool, buildClassifyNewsPrompt } from "./prompts/classify-news.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAXONOMY_PATH = path.join(__dirname, "..", "..", "config", "content-taxonomy.json");

let cachedTaxonomy = null;
export function loadTaxonomy() {
  if (!cachedTaxonomy) {
    cachedTaxonomy = JSON.parse(fs.readFileSync(TAXONOMY_PATH, "utf-8"));
  }
  return cachedTaxonomy;
}

/**
 * カテゴリのalias解決。config/content-taxonomy.jsonのcategoryAliasesに
 * 従って、正規カテゴリでないslugを正規カテゴリへ変換する。
 */
export function resolveCategoryAlias(slug, taxonomy = loadTaxonomy()) {
  return taxonomy.categoryAliases[slug] || slug;
}

/**
 * @param {object} item
 * @returns {Promise<{primaryCategory:string, secondaryCategories:string[], contentType:string, isHighRiskCategory:boolean, highRiskCategoryLabel:string, evergreenPotential:string}>}
 */
export async function classifyNews(item) {
  const taxonomy = loadTaxonomy();
  const model = getModelForTier("lightest");
  const tool = buildClassifyNewsTool(taxonomy);
  const userPrompt = buildClassifyNewsPrompt(item, taxonomy);

  const result = await callStructured({
    model,
    system: "あなたはAIニュースメディアの分類アシスタントです。与えられたカテゴリ体系に厳密に従ってください。",
    userPrompt,
    tool,
    label: "classify-news",
    maxTokens: 500,
  });

  return {
    primaryCategory: resolveCategoryAlias(result.primaryCategory, taxonomy),
    secondaryCategories: (result.secondaryCategories || []).map((c) => resolveCategoryAlias(c, taxonomy)),
    contentType: result.contentType,
    isHighRiskCategory: Boolean(result.isHighRiskCategory),
    highRiskCategoryLabel: result.highRiskCategoryLabel === "none" ? "" : result.highRiskCategoryLabel,
    evergreenPotential: result.evergreenPotential,
  };
}
