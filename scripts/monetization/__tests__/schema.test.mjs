import { test } from "node:test";
import assert from "node:assert/strict";
import { createContentMetadata, validateContentMetadata, HUMAN_REVIEW_STATUS } from "../schema.mjs";

test("createContentMetadata: デフォルト値はhumanReviewRequired=falseで理由なし", () => {
  const m = createContentMetadata();
  assert.equal(m.humanReviewRequired, false);
  assert.equal(m.humanReviewReason, "");
  assert.equal(m.humanReviewStatus, HUMAN_REVIEW_STATUS.PENDING);
});

test("validateContentMetadata: humanReviewRequired=trueで理由が空ならエラー", () => {
  assert.throws(() => {
    createContentMetadata({ humanReviewRequired: true, humanReviewReason: "" });
  }, /humanReviewReason/);
});

test("validateContentMetadata: humanReviewRequired=trueで理由があればOK", () => {
  const m = createContentMetadata({ humanReviewRequired: true, humanReviewReason: "LOW_RELIABILITY" });
  assert.equal(m.humanReviewRequired, true);
});

test("validateContentMetadata: 不正なhumanReviewStatusはエラー", () => {
  assert.throws(() => {
    validateContentMetadata({ humanReviewRequired: false, humanReviewStatus: "INVALID" });
  }, /不正なhumanReviewStatus/);
});
