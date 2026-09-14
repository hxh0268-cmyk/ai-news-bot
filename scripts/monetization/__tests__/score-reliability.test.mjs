import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReliabilityScore, loadReliabilityConfig } from "../score-reliability.mjs";

const config = loadReliabilityConfig();

test("official source high score: 一次情報+複数独立情報源+具体的根拠は高スコア", () => {
  const score = computeReliabilityScore({
    hasOfficialPrimarySource: true,
    isMajorTrustedPublication: true,
    hasMultipleIndependentSources: true,
    hasConcreteEvidence: true,
    isAnonymousOnlyClaim: false,
    hasNoTraceableSource: false,
    isHighRiskUnqualifiedClaim: false,
    isSensationalOrUnverifiable: false,
  });
  assert.ok(score >= config.thresholds.HIGH_RISK_MIN_RELIABILITY, `score=${score} should be >= HIGH_RISK_MIN_RELIABILITY`);
});

test("unknown source low score: 匿名のみ・追跡不能・扇動的な場合は低スコア", () => {
  const score = computeReliabilityScore({
    hasOfficialPrimarySource: false,
    isMajorTrustedPublication: false,
    hasMultipleIndependentSources: false,
    hasConcreteEvidence: false,
    isAnonymousOnlyClaim: true,
    hasNoTraceableSource: true,
    isHighRiskUnqualifiedClaim: false,
    isSensationalOrUnverifiable: true,
  });
  assert.ok(score < config.thresholds.AUTO_PUBLISH_MIN_RELIABILITY, `score=${score} should be below AUTO_PUBLISH_MIN_RELIABILITY`);
});

test("high-risk threshold: 高リスク無資格断定はスコアを大きく下げる", () => {
  const base = computeReliabilityScore({
    hasOfficialPrimarySource: true,
    isMajorTrustedPublication: false,
    hasMultipleIndependentSources: false,
    hasConcreteEvidence: false,
    isAnonymousOnlyClaim: false,
    hasNoTraceableSource: false,
    isHighRiskUnqualifiedClaim: false,
    isSensationalOrUnverifiable: false,
  });
  const withRiskyClaim = computeReliabilityScore({
    hasOfficialPrimarySource: true,
    isMajorTrustedPublication: false,
    hasMultipleIndependentSources: false,
    hasConcreteEvidence: false,
    isAnonymousOnlyClaim: false,
    hasNoTraceableSource: false,
    isHighRiskUnqualifiedClaim: true,
    isSensationalOrUnverifiable: false,
  });
  assert.ok(withRiskyClaim < base);
});

test("score never exceeds 0-100 bounds", () => {
  const allTrue = computeReliabilityScore({
    hasOfficialPrimarySource: true,
    isMajorTrustedPublication: true,
    hasMultipleIndependentSources: true,
    hasConcreteEvidence: true,
    isAnonymousOnlyClaim: true,
    hasNoTraceableSource: true,
    isHighRiskUnqualifiedClaim: true,
    isSensationalOrUnverifiable: true,
  });
  assert.ok(allTrue >= 0 && allTrue <= 100);
});
