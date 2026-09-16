// Stage B: Taxonomy / Data Model（Section 6）
//
// 既存のNEWS_ITEM_SCHEMA（generate.mjs内、Claudeへのtool-use契約）は本番の
// 生成フローが依存する既存契約のため変更しない。ここでは、そのitemに対して
// 「収益化エンジン」が後から付与するメタデータを別レイヤーとして定義する
// （既存schemaへの侵襲を避け、後方互換性を保つため）。

export const HUMAN_REVIEW_STATUS = Object.freeze({
  PENDING: "PENDING",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  RESOLVED: "RESOLVED",
});

/**
 * Section 6のmetadata schemaに沿った既定値を持つオブジェクトを生成する。
 * @param {object} overrides
 */
export function createContentMetadata(overrides = {}) {
  const metadata = {
    contentType: "",
    primaryCategory: "",
    secondaryCategories: [],
    sourceType: "",
    publishedAt: null,
    generatedAt: new Date().toISOString(),
    commercialScore: 0,
    reliabilityScore: 0,
    distributionDecision: "",
    monetizationPotential: "",
    evergreenPotential: "",
    humanReviewRequired: false,
    humanReviewReason: "",
    humanReviewStatus: HUMAN_REVIEW_STATUS.PENDING,
    ...overrides,
  };
  validateContentMetadata(metadata);
  return metadata;
}

/**
 * 「humanReviewRequiredがtrueなのに理由が空」という状態を防ぐガード。
 * Section 6: 「空の理由でtrueにしないこと」を機械的に強制する。
 */
export function validateContentMetadata(metadata) {
  if (metadata.humanReviewRequired && !metadata.humanReviewReason) {
    throw new Error(
      "humanReviewRequired=trueの場合はhumanReviewReasonを必ず設定してください（空の理由でtrueにできません）。"
    );
  }
  if (
    metadata.humanReviewStatus &&
    !Object.values(HUMAN_REVIEW_STATUS).includes(metadata.humanReviewStatus)
  ) {
    throw new Error(`不正なhumanReviewStatus: ${metadata.humanReviewStatus}`);
  }
  return true;
}
