// Section 24: Failure Categories
//
// 既存のrecovery-check.ymlとの連携方針（Section 2/24で要求されている報告）:
// recovery-check.ymlは「generate.ymlの各トピックジョブのconclusion（成功/失敗）」
// のみを監視するインフラ障害検知の仕組みであり、日次自動生成フローの外側から
// GitHub Actions REST APIで見ている。一方、本タクソノミーが表す
// LOW_COMMERCIAL_VALUE / LOW_RELIABILITY / HUMAN_REVIEW_REQUIRED /
// DUPLICATE_CONTENT は「収益化エンジンが正常に動作した結果として下した却下・
// 保留の判定」であり、インフラ障害ではない。これらをrecovery-check.ymlの
// bounded retry経路に混ぜると、正しく却下された候補が誤って「障害」として
// 再トリガーされてしまう。
//
// そのため、本タクソノミーは2系統に分けて扱う:
//   - INFRA（PROVIDER_FAILED, SOURCE_FETCH_FAILED, GENERATION_FAILED,
//     VALIDATION_FAILED, ANALYTICS_FAILED）
//     → 既存のscripts/retry.mjs(withRetry)による同一プロセス内リトライを
//       第一防波堤とし、それでも失敗する場合はgenerate.yml本体のジョブ失敗
//       として扱われ、結果的に既存のrecovery-check.ymlのbounded retryの
//       対象になる（新しい別経路を作らず、既存の仕組みにそのまま乗せる）。
//   - DECISION（SOURCE_UNVERIFIED, DUPLICATE_CONTENT, LOW_COMMERCIAL_VALUE,
//     LOW_RELIABILITY, HUMAN_REVIEW_REQUIRED, PUBLISH_BLOCKED）
//     → recovery-check.ymlとは完全に独立した経路（構造化ログ＋Section 25の
//       Human Review Escalationのみ）で扱う。KILL_SWITCHとも連動させない
//       （KILL_SWITCHは「運用を止める」意図のスイッチであり、個々の記事の
//       品質判定とは無関係なため）。

export const FAILURE_CATEGORY = Object.freeze({
  // DECISION系（正常動作の結果としての却下・保留。recovery-check.ymlとは独立）
  SOURCE_UNVERIFIED: "SOURCE_UNVERIFIED",
  DUPLICATE_CONTENT: "DUPLICATE_CONTENT",
  LOW_COMMERCIAL_VALUE: "LOW_COMMERCIAL_VALUE",
  LOW_RELIABILITY: "LOW_RELIABILITY",
  HUMAN_REVIEW_REQUIRED: "HUMAN_REVIEW_REQUIRED",
  PUBLISH_BLOCKED: "PUBLISH_BLOCKED",

  // INFRA系（既存retry.mjs→既存recovery-check.ymlの経路にそのまま乗せる）
  SOURCE_FETCH_FAILED: "SOURCE_FETCH_FAILED",
  GENERATION_FAILED: "GENERATION_FAILED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  PROVIDER_FAILED: "PROVIDER_FAILED",
  ANALYTICS_FAILED: "ANALYTICS_FAILED",
});

export const DECISION_CATEGORIES = new Set([
  FAILURE_CATEGORY.SOURCE_UNVERIFIED,
  FAILURE_CATEGORY.DUPLICATE_CONTENT,
  FAILURE_CATEGORY.LOW_COMMERCIAL_VALUE,
  FAILURE_CATEGORY.LOW_RELIABILITY,
  FAILURE_CATEGORY.HUMAN_REVIEW_REQUIRED,
  FAILURE_CATEGORY.PUBLISH_BLOCKED,
]);

export const INFRA_CATEGORIES = new Set([
  FAILURE_CATEGORY.SOURCE_FETCH_FAILED,
  FAILURE_CATEGORY.GENERATION_FAILED,
  FAILURE_CATEGORY.VALIDATION_FAILED,
  FAILURE_CATEGORY.PROVIDER_FAILED,
  FAILURE_CATEGORY.ANALYTICS_FAILED,
]);

export function isKnownFailureCategory(category) {
  return Object.values(FAILURE_CATEGORY).includes(category);
}

/**
 * 未知のエラーをsilently ignoreしないためのガード。
 * 分類できないエラーは明示的にUNKNOWNとして扱い、ログに残す。
 */
export function classifyOrUnknown(category) {
  return isKnownFailureCategory(category) ? category : "UNKNOWN";
}
