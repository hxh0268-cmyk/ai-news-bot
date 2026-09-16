import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTaxonomy, resolveCategoryAlias } from "../classify-news.mjs";

test("loadTaxonomy: Section 5の正規カテゴリ(alias解決後)がすべて含まれる", () => {
  const taxonomy = loadTaxonomy();
  const slugs = taxonomy.categories.map((c) => c.slug);
  for (const expected of ["ai-news", "ai-tools", "ai-work", "ai-automation", "ai-monetization", "ai-comparison", "ai-business", "ai-future"]) {
    assert.ok(slugs.includes(expected), `${expected} should be a defined category`);
  }
});

test("resolveCategoryAlias: 未使用のalias(ai-agents, ai-howto)は正規カテゴリへ解決される", () => {
  assert.equal(resolveCategoryAlias("ai-agents"), "ai-automation");
  assert.equal(resolveCategoryAlias("ai-howto"), "ai-work");
});

test("resolveCategoryAlias: 既に正規カテゴリならそのまま返す", () => {
  assert.equal(resolveCategoryAlias("ai-news"), "ai-news");
});

test("Section 4: カテゴリ配分目標の合計が概ね100%になっている", () => {
  const taxonomy = loadTaxonomy();
  const total = taxonomy.categories.reduce((sum, c) => sum + c.targetRatio, 0);
  assert.ok(Math.abs(total - 1.0) < 0.001, `target ratios should sum to ~1.0, got ${total}`);
});

test("highRiskCategoriesにSection 10の全カテゴリが含まれる", () => {
  const taxonomy = loadTaxonomy();
  for (const expected of ["medical", "legal", "investment", "cybersecurity-incident", "personal-safety", "regulation"]) {
    assert.ok(taxonomy.highRiskCategories.includes(expected));
  }
});
