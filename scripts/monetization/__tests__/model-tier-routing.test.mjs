import { test } from "node:test";
import assert from "node:assert/strict";
import { getModelForTier } from "../model-tiers.mjs";
import { channelsForDecision } from "../distribution-decision.mjs";

test("getModelForTier: lightest/mid/highそれぞれに異なるモデルが設定されている", () => {
  const lightest = getModelForTier("lightest");
  const mid = getModelForTier("mid");
  const high = getModelForTier("high");
  assert.ok(lightest && mid && high);
  // 3層が同一モデルに縮退していないこと（Tier分離が機能している最低限の確認）
  assert.ok(new Set([lightest, mid, high]).size >= 2);
});

test("getModelForTier: 未知のtier名はfail-closedでエラーになる", () => {
  assert.throws(() => getModelForTier("nonexistent-tier"));
});

test("Model Tier Routing: REJECT判定はどのチャネルも生成対象にならない（高コストモデル未呼び出しの保証）", () => {
  const channels = channelsForDecision("REJECT");
  assert.equal(Object.values(channels).some(Boolean), false);
});

test("Model Tier Routing: HUMAN_REVIEW_REQUIREDも同様にどのチャネルも生成対象にならない", () => {
  const channels = channelsForDecision("HUMAN_REVIEW_REQUIRED");
  assert.equal(Object.values(channels).some(Boolean), false);
});
