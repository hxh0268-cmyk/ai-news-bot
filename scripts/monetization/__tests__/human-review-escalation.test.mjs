import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatHumanReviewTitle,
  formatHumanReviewBody,
  collectFlaggedItems,
  HUMAN_REVIEW_TITLE_PREFIX,
} from "../human-review-escalation.mjs";
import { applyHumanReviewEscalation } from "../apply-human-review-escalation.mjs";

test("formatHumanReviewTitle: プレフィックスを機械的に付与する", () => {
  const title = formatHumanReviewTitle("【要確認・GO判定】ai-news (2026-09-14)");
  assert.ok(title.startsWith(HUMAN_REVIEW_TITLE_PREFIX));
  assert.ok(title.includes("【要確認・GO判定】ai-news (2026-09-14)"));
});

test("formatHumanReviewTitle: 既にプレフィックスがあれば二重付与しない", () => {
  const once = formatHumanReviewTitle("元タイトル");
  const twice = formatHumanReviewTitle(once);
  assert.equal(once, twice);
});

test("collectFlaggedItems: humanReviewRequired=trueのものだけ抽出する", () => {
  const items = [
    { headline: "A", humanReviewRequired: true, humanReviewReason: "x" },
    { headline: "B", humanReviewRequired: false, humanReviewReason: "" },
  ];
  const flagged = collectFlaggedItems(items);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].headline, "A");
});

test("formatHumanReviewBody: 理由・スコアを含む人間可読な本文を生成する（PRへの警告表示が機能することの確認）", () => {
  const body = formatHumanReviewBody([
    { headline: "投資助言的な記事", humanReviewReason: "HIGH_RISK_CATEGORY_LOW_RELIABILITY(investment, reliability=60)", commercialScore: 82, reliabilityScore: 60 },
  ]);
  assert.ok(body.includes("HUMAN REVIEW REQUIRED"));
  assert.ok(body.includes("投資助言的な記事"));
  assert.ok(body.includes("HIGH_RISK_CATEGORY_LOW_RELIABILITY"));
  assert.ok(body.includes("82"));
  assert.ok(body.includes("60"));
});

test("formatHumanReviewBody: 対象が0件なら空文字", () => {
  assert.equal(formatHumanReviewBody([]), "");
});

test("applyHumanReviewEscalation: dryRun=trueでは実際にghを呼ばず、結果だけ返す", () => {
  const result = applyHumanReviewEscalation({
    repo: "owner/repo",
    prNumber: 999,
    originalTitle: "【要確認・GO判定】ai-news (2026-09-14)",
    flaggedItems: [{ headline: "テスト記事", humanReviewReason: "LOW_RELIABILITY", commercialScore: 90, reliabilityScore: 50 }],
    dryRun: true,
  });
  assert.equal(result.dryRun, true);
  assert.ok(result.newTitle.startsWith(HUMAN_REVIEW_TITLE_PREFIX));
  assert.ok(result.body.includes("テスト記事"));
});
