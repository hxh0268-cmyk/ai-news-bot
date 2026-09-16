// Section 31 "Generation" テスト。
// 注意（Known Gap）: 実際のLLM出力の品質（本当に120字以内に収まるか、
// 本当に根拠のない主張を含まないか）は、モック可能なprovider境界が
// 存在しないため、ここでは検証できない（ライブAPI呼び出しはコスト・
// 非決定性の観点で単体テストに含めていない）。ここではプロンプト/ツール
// 定義が「制約を要求する構造になっているか」を検証する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { X_POST_TOOL, buildXPostPrompt } from "../prompts/generate-x-post.mjs";
import { WEB_BREAKING_TOOL, buildWebBreakingPrompt } from "../prompts/generate-web-breaking.mjs";
import { WEB_EXPLAINER_TOOL, buildWebExplainerPrompt } from "../prompts/generate-web-explainer.mjs";

const sampleItem = {
  headline: "テストニュース見出し",
  dek: "テスト用の説明",
  body: ["本文1", "本文2"],
  why: "テスト用の理由",
  sourceLine: "Test Source、2026年9月14日",
};

test("X post: character constraint がツール定義・プロンプトの両方に明記されている", () => {
  assert.ok(WEB_BREAKING_TOOL); // sanity
  assert.match(X_POST_TOOL.input_schema.properties.body.description, /120字/);
  assert.match(buildXPostPrompt(sampleItem), /120字/);
});

test("X post: unsupported claims rejected（煽り・断定・投資助言等を避ける指示が含まれる）", () => {
  const prompt = buildXPostPrompt(sampleItem);
  for (const forbidden of ["過剰な煽り", "根拠のない断定", "投資推奨"]) {
    assert.ok(prompt.includes(forbidden), `prompt should mention avoiding "${forbidden}"`);
  }
});

test("web breaking: source citation retained（出典が必ずプロンプトに埋め込まれる）", () => {
  const prompt = buildWebBreakingPrompt(sampleItem);
  assert.ok(prompt.includes(sampleItem.sourceLine));
  assert.match(prompt, /300〜700字/);
});

test("web explainer: metadata presence（sectionsUsedが必須フィールドとして要求される）", () => {
  assert.ok(WEB_EXPLAINER_TOOL.input_schema.required.includes("sectionsUsed"));
  assert.ok(WEB_EXPLAINER_TOOL.input_schema.required.includes("body"));
});

test("全チャネル: 事実の創作を禁じる指示が含まれる（no invented pricing/capabilities/quotes/statistics）", () => {
  const breaking = buildWebBreakingPrompt(sampleItem);
  const explainer = buildWebExplainerPrompt(sampleItem);
  assert.ok(breaking.includes("創作しないでください") || breaking.includes("創作しない"));
  assert.ok(explainer.includes("創作"));
});
