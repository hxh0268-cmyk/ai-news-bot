#!/usr/bin/env bash
# generate.ymlで、同じ対象日の生成がすでに成功しているかを判定する。
# 使い方: scripts/check-already-generated.sh <topic> <YYYY-MM-DD>
#
# 2026-09-29に、手動実行したgenerate.ymlの9分後に遅れていた定期実行も動き、
# 同じ日の生成が2回走った（API料金が2回分かかり、あとの実行がブランチを
# 強制pushで上書きした）。これを防ぐため、STEP1（API呼び出し）の前にこの判定を行う。
#
# 判定基準: ブランチ content/<topic>/<日付> のPRが「オープン」または「マージ済み」
# であれば、その日の生成は成功済みとみなし skip=true を出力する。
# PRが無い・マージせずに閉じたPRしか無い場合は skip=false（生成を続ける）。
# recovery-check.ymlの再実行は「前の実行が失敗してPRが作られなかった」ときに
# 行われるため、PRが無い＝skip=false となり、これまでどおり生成が進む。
#
# gh の呼び出し自体が失敗した場合は、判定できないまま生成に進んでAPI料金が
# 二重にかかることを避けるため、エラーで終了する（その場合はrecovery-check.ymlが
# 失敗として拾い、再実行する）。
set -euo pipefail

TOPIC="${1:?topicを指定してください}"
CONTENT_DATE="${2:?対象日(YYYY-MM-DD)を指定してください}"
BRANCH="content/${TOPIC}/${CONTENT_DATE}"

PRS_JSON=$(gh pr list ${REPO:+--repo "$REPO"} --head "$BRANCH" --state all --json number,state,url,headRefName)

# ghの--headでも絞り込んでいるが、念のためjq側でもブランチ名の完全一致を確認する。
EXISTING=$(echo "$PRS_JSON" | jq -r --arg b "$BRANCH" '[.[] | select(.headRefName == $b and (.state == "OPEN" or .state == "MERGED"))] | first | if . then "#\(.number)（\(.state)） \(.url)" else "" end')

if [ -n "$EXISTING" ]; then
  echo "対象日 ${CONTENT_DATE} の生成はすでに成功しています: PR ${EXISTING}"
  echo "APIを呼ばずにこの実行を終了します。"
  SKIP=true
else
  echo "ブランチ ${BRANCH} のオープン中・マージ済みのPRはありません。生成を続けます。"
  SKIP=false
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "skip=${SKIP}" >> "$GITHUB_OUTPUT"
  echo "existing_pr=${EXISTING}" >> "$GITHUB_OUTPUT"
fi
if [ "$SKIP" = true ] && [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "⏭️ ${TOPIC} の ${CONTENT_DATE} 分はすでに生成済み（PR ${EXISTING}）のため、生成をスキップしました。" >> "$GITHUB_STEP_SUMMARY"
fi
