// Stage G (適用側): 実際にPRへ警告を反映するための関数群。
//
// これはSection 27の「Stage 2: Advisory Mode」への実際の切り替えに相当するため、
// 既存のgenerate.yml（日次自動生成ワークフロー）からは呼び出していない
// （scripts/monetization/human-review-escalation.mjsのコメント参照）。
// 手動、または将来の承認後にCIへ組み込む際のエントリポイントとして用意する。
import { execFileSync } from "node:child_process";
import { formatHumanReviewTitle, formatHumanReviewBody, HUMAN_REVIEW_LABEL } from "./human-review-escalation.mjs";

/**
 * gh CLI経由で、指定PRのタイトルに警告prefixを付与し、本文コメントと
 * ラベルを追加する。execFileSyncを使い、shell injectionを避ける
 * （既存のrecent-headlines.mjs等と同じ方針）。
 * @param {object} opts
 * @param {string} opts.repo - "owner/repo"
 * @param {number} opts.prNumber
 * @param {string} opts.originalTitle
 * @param {Array} opts.flaggedItems
 * @param {boolean} [opts.dryRun]
 */
export function applyHumanReviewEscalation({ repo, prNumber, originalTitle, flaggedItems, dryRun = true }) {
  const newTitle = formatHumanReviewTitle(originalTitle);
  const body = formatHumanReviewBody(flaggedItems);

  if (dryRun) {
    return { dryRun: true, newTitle, body, label: HUMAN_REVIEW_LABEL };
  }

  execFileSync("gh", ["pr", "edit", String(prNumber), "--repo", repo, "--title", newTitle, "--add-label", HUMAN_REVIEW_LABEL]);
  execFileSync("gh", ["pr", "comment", String(prNumber), "--repo", repo, "--body", body]);

  return { dryRun: false, newTitle, body, label: HUMAN_REVIEW_LABEL };
}
