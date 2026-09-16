import { test } from "node:test";
import assert from "node:assert/strict";
import { decideDistribution, channelsForDecision } from "../distribution-decision.mjs";

// Section 31 "Distribution"テストケース：
// 80 -> FULL_DISTRIBUTION (Reliability>=85の場合)
// 79 -> WEB_AND_X
// 70 -> WEB_AND_X
// 69 -> WEB_ONLY_CANDIDATE
// 60 -> WEB_ONLY_CANDIDATE
// 59 -> REJECT
const CASES = [
  { commercial: 80, reliability: 90, expected: "FULL_DISTRIBUTION" },
  { commercial: 79, reliability: 90, expected: "WEB_AND_X" },
  { commercial: 70, reliability: 90, expected: "WEB_AND_X" },
  { commercial: 69, reliability: 90, expected: "WEB_ONLY_CANDIDATE" },
  { commercial: 60, reliability: 90, expected: "WEB_ONLY_CANDIDATE" },
  { commercial: 59, reliability: 90, expected: "REJECT" },
];

for (const c of CASES) {
  test(`decideDistribution: commercial=${c.commercial}, reliability=${c.reliability} => ${c.expected}`, () => {
    const result = decideDistribution({
      commercialScore: c.commercial,
      reliabilityScore: c.reliability,
      isHighRiskCategory: false,
    });
    assert.equal(result.decision, c.expected);
  });
}

// Section 10.1 統合判定テーブルの全パターン（4 commercial bands × 3 reliability columns）
const MATRIX_EXPECTATIONS = [
  ["80-100", 90, "FULL_DISTRIBUTION"],
  ["80-100", 78, "WEB_AND_X"],
  ["80-100", 50, "HUMAN_REVIEW_REQUIRED"],
  ["70-79", 90, "WEB_AND_X"],
  ["70-79", 78, "WEB_AND_X"],
  ["70-79", 50, "HUMAN_REVIEW_REQUIRED"],
  ["60-69", 90, "WEB_ONLY_CANDIDATE"],
  ["60-69", 78, "WEB_ONLY_CANDIDATE"],
  ["60-69", 50, "REJECT"],
  ["0-59", 90, "REJECT"],
  ["0-59", 78, "REJECT"],
  ["0-59", 50, "REJECT"],
];
const BAND_TO_SCORE = { "80-100": 85, "70-79": 75, "60-69": 65, "0-59": 30 };

for (const [band, reliability, expected] of MATRIX_EXPECTATIONS) {
  test(`統合判定テーブル: commercialBand=${band}, reliability=${reliability} => ${expected}`, () => {
    const result = decideDistribution({
      commercialScore: BAND_TO_SCORE[band],
      reliabilityScore: reliability,
      isHighRiskCategory: false,
    });
    assert.equal(result.decision, expected);
  });
}

test("high-riskカテゴリでは常にHIGH_RISK_MIN_RELIABILITY列が適用される（reliability=80はAUTO_PUBLISH_MIN以上だがHIGH_RISK_MIN未満）", () => {
  const normal = decideDistribution({ commercialScore: 85, reliabilityScore: 80, isHighRiskCategory: false });
  const highRisk = decideDistribution({ commercialScore: 85, reliabilityScore: 80, isHighRiskCategory: true, highRiskCategoryLabel: "medical" });
  assert.equal(normal.decision, "WEB_AND_X");
  assert.equal(highRisk.decision, "HUMAN_REVIEW_REQUIRED");
  assert.equal(highRisk.humanReviewRequired, true);
  assert.ok(highRisk.humanReviewReason.includes("HIGH_RISK_CATEGORY"));
});

test("fail-closed publication: High Commercial + Low Reliability = DO NOT AUTO PUBLISH", () => {
  const result = decideDistribution({ commercialScore: 95, reliabilityScore: 40, isHighRiskCategory: false });
  assert.equal(result.decision, "HUMAN_REVIEW_REQUIRED");
  assert.equal(result.humanReviewRequired, true);
  assert.notEqual(result.humanReviewReason, "");
});

test("humanReviewRequired=trueの結果には必ずhumanReviewReasonが設定される", () => {
  const cases = [
    { commercialScore: 95, reliabilityScore: 40, isHighRiskCategory: false },
    { commercialScore: 75, reliabilityScore: 40, isHighRiskCategory: false },
    { commercialScore: 95, reliabilityScore: 80, isHighRiskCategory: true, highRiskCategoryLabel: "legal" },
  ];
  for (const c of cases) {
    const result = decideDistribution(c);
    if (result.humanReviewRequired) {
      assert.ok(result.humanReviewReason.length > 0, `case ${JSON.stringify(c)} should have a reason`);
    }
  }
});

test("channelsForDecision: REJECTとHUMAN_REVIEW_REQUIREDは全チャネルfalse（生成コストをかけない）", () => {
  assert.deepEqual(channelsForDecision("REJECT"), { webBreaking: false, webExplainer: false, xPost: false });
  assert.deepEqual(channelsForDecision("HUMAN_REVIEW_REQUIRED"), { webBreaking: false, webExplainer: false, xPost: false });
});

test("channelsForDecision: WEB_ONLY_CANDIDATEはX投稿なし", () => {
  const channels = channelsForDecision("WEB_ONLY_CANDIDATE");
  assert.equal(channels.webBreaking, true);
  assert.equal(channels.webExplainer, true);
  assert.equal(channels.xPost, false);
});

test("channelsForDecision: FULL_DISTRIBUTIONとWEB_AND_Xは全チャネルtrue", () => {
  for (const decision of ["FULL_DISTRIBUTION", "WEB_AND_X"]) {
    const channels = channelsForDecision(decision);
    assert.deepEqual(channels, { webBreaking: true, webExplainer: true, xPost: true });
  }
});
