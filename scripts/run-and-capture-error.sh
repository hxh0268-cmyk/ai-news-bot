#!/usr/bin/env bash
# generate-content Composite Actionの各パイプラインステップをラップし、
# 失敗時にエラーメッセージの手がかりを .step-error.log に残す。
# generate.ymlの失敗Slack通知で「失敗しました」だけでなく原因の一部を
# 表示できるようにするための仕組み（IMPROVEMENT_LOG.md 2026-09-09参照）。
#
# 各*.mjsスクリプトは main().catch((err) => console.error(err)) の形で
# 例外を出力しており、その1行目が "Error: 具体的なメッセージ" になっている
# ことが多いため、まずその行を優先的に拾う。見つからない場合（build-video.sh
# 等のbashスクリプトのエラー）は、出力全体の末尾の空でない行を代わりに使う。
set -uo pipefail

LOG_FILE="${STEP_ERROR_LOG:-.step-error.log}"
RAW_FILE="$(mktemp)"
rm -f "$LOG_FILE"

# ログの流れをそのままActionsの実行ログにも表示しつつ(tee)、
# ファイルにも保存する。パイプの終端はteeなので、実際のコマンドの
# 終了コードはPIPESTATUSの1番目から取得する。
"$@" 2>&1 | tee "$RAW_FILE"
EXIT_CODE=${PIPESTATUS[0]}

if [ "$EXIT_CODE" -ne 0 ]; then
  SNIPPET=$(grep -m1 -E '^[A-Za-z]*Error:' "$RAW_FILE" || true)
  if [ -z "$SNIPPET" ]; then
    SNIPPET=$(awk 'NF{line=$0} END{print line}' "$RAW_FILE")
  fi
  if [ -z "$SNIPPET" ]; then
    SNIPPET="(エラー出力なし)"
  fi
  printf '%s\n' "$SNIPPET" | cut -c1-300 > "$LOG_FILE"
fi

rm -f "$RAW_FILE"
exit "$EXIT_CODE"
