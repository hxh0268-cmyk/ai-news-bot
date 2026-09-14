import { test } from "node:test";
import assert from "node:assert/strict";
import { clampBreakdown, sumBreakdown, loadScoringConfig } from "../score-commercial.mjs";

const weights = loadScoringConfig().commercialScoreWeights;

test("clampBreakdown: 各項目がconfigの上限を超えない", () => {
  const overshoot = {};
  for (const key of Object.keys(weights)) overshoot[key] = 9999;
  const clamped = clampBreakdown(overshoot, weights);
  for (const key of Object.keys(weights)) {
    assert.ok(clamped[key] <= weights[key], `${key} should be clamped to ${weights[key]}`);
  }
});

test("clampBreakdown: 負の値は0にclampされる（negative score handling）", () => {
  const negative = {};
  for (const key of Object.keys(weights)) negative[key] = -50;
  const clamped = clampBreakdown(negative, weights);
  for (const key of Object.keys(weights)) {
    assert.equal(clamped[key], 0);
  }
});

test("sumBreakdown: 合計が100を超えない（全項目満点でもTOTAL=100）", () => {
  const maxed = {};
  for (const key of Object.keys(weights)) maxed[key] = weights[key];
  const total = sumBreakdown(clampBreakdown(maxed, weights));
  assert.equal(total, 100);
  assert.ok(total <= 100);
});

test("threshold boundary: distributionThresholdsが期待通りの境界値を持つ", () => {
  const thresholds = loadScoringConfig().distributionThresholds;
  assert.equal(thresholds.FULL_DISTRIBUTION, 80);
  assert.equal(thresholds.WEB_AND_X, 70);
  assert.equal(thresholds.WEB_ONLY_CANDIDATE, 60);
});

test("deterministic config behavior: 同じ入力に対して常に同じclamp結果", () => {
  const input = { practicalUtility: 17, socialVirality: 10, freshness: 8, searchDemand: 9, originality: 6, notePotential: 8, affiliatePotential: 11, productizationPotential: 8, b2bValue: 5, futureValue: 4 };
  const a = clampBreakdown(input, weights);
  const b = clampBreakdown(input, weights);
  assert.deepEqual(a, b);
  assert.equal(sumBreakdown(a), sumBreakdown(b));
});
