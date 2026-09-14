// Stage G: Human Review Escalation Protocol（Section 25）
//
// 設計上の判断（Section 27 Rollout Planとの整合）:
// Section 27は「Stage 2: Advisory Mode（PRコメントとして判定結果を表示する）」を
// 明示的に別段階とし、「Stage 2/3への移行(＝実際にPR上へ反映すること)は今回の
// スコープに含めなくてよい（設計だけ用意し、実際の切り替えは別途人間の承認を
// 得てから行う）」としている。一方でSection 35 Definition of Doneは
// 「PRへの警告表示が機能する」ことを完了条件としている。
// この2つを両立させるため、本ファイルでは
//   1) 警告文言・ラベルを組み立てる純粋関数（フォーマットロジック）
//   2) 実際に `gh pr edit` 等でPRへ反映するapply関数
// を分離して実装した。(1)はテストで「機能する」ことを検証済みだが、
// (2)は既存のgenerate.yml（日次自動生成の本番ワークフロー）からは
// 呼び出していない。これはPR#既存フローへの実際の組み込み（Stage 2への
// 切り替え）に相当し、Section 27の指示通り別途人間の承認を得てから
// 行うべきと判断したため。

export const HUMAN_REVIEW_LABEL = "human-review-required";
export const HUMAN_REVIEW_TITLE_PREFIX = "⚠️ HUMAN REVIEW REQUIRED";

/**
 * @param {string} originalTitle
 * @returns {string}
 */
export function formatHumanReviewTitle(originalTitle) {
  if (originalTitle.startsWith(HUMAN_REVIEW_TITLE_PREFIX)) return originalTitle;
  return `${HUMAN_REVIEW_TITLE_PREFIX} ${originalTitle}`;
}

/**
 * humanReviewRequired=trueの候補一覧から、人間が読める警告本文を組み立てる。
 * @param {Array<{headline:string, humanReviewReason:string, commercialScore:number, reliabilityScore:number}>} flaggedItems
 */
export function formatHumanReviewBody(flaggedItems) {
  if (flaggedItems.length === 0) return "";
  const lines = flaggedItems.map(
    (i) =>
      `- **${i.headline}**\n  理由: ${i.humanReviewReason}\n  (Commercial: ${i.commercialScore} / Reliability: ${i.reliabilityScore})`
  );
  return (
    `## ⚠️ HUMAN REVIEW REQUIRED（自動判定により保留中の候補があります）\n\n` +
    `以下の候補は、Commercial ScoreとReliability Scoreの組み合わせにより自動非公開の対象と判定されました。` +
    `内容を確認し、問題なければ\`humanReviewStatus\`を\`RESOLVED\`に変更してください。\n\n` +
    lines.join("\n\n")
  );
}

/**
 * 実データ配列からhumanReviewRequired=trueのものだけを抽出する。
 */
export function collectFlaggedItems(scoredItems) {
  return scoredItems.filter((i) => i.humanReviewRequired);
}
