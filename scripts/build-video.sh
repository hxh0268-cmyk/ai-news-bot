#!/usr/bin/env bash
# STEP3c: クリップ結合＋ナレーション合成（話題対応版・フォールバック対応・堅牢化版）
# Kling APIが不調でクリップが1本も無い場合は、カード画像から簡易スライドショーを作る。
#
# 修正点：nullglobを使い、該当ファイルが0件の場合でもエラーにならないようにした
# （以前は ls | wc -l の組み合わせが、0件のときに set -e で異常終了する不具合があった）。

set -euo pipefail
shopt -s nullglob

TOPIC="${TOPIC:-ai-news}"
DATE_STR=$(date -u +%Y-%m-%d)
DIR="output/${TOPIC}/${DATE_STR}"
CLIPS="${DIR}/clips"
CARDS="${DIR}/cards"
NARRATION="${DIR}/narration.mp3"
CONCAT_LIST="${DIR}/concat_list.txt"
SILENT_OUT="${DIR}/slideshow_silent.mp4"
FINAL_OUT="${DIR}/slideshow.mp4"

clip_files=()
if [ -d "$CLIPS" ]; then
  clip_files=("${CLIPS}"/*.mp4)
fi
AVAILABLE_CLIPS=${#clip_files[@]}

if [ "$AVAILABLE_CLIPS" -gt 0 ]; then
  echo "Kling生成クリップ ${AVAILABLE_CLIPS}本を使用します。"
  : > "$CONCAT_LIST"
  for f in "${clip_files[@]}"; do
    echo "file '$(pwd)/${f}'" >> "$CONCAT_LIST"
  done
  ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -c:v libx264 -pix_fmt yuv420p -r 30 "$SILENT_OUT"
else
  echo "⚠️ Klingクリップが1本も無いため、カード画像から簡易スライドショーで代替します。"
  card_files=("${CARDS}"/*.png)
  if [ ${#card_files[@]} -eq 0 ]; then
    echo "エラー: カード画像も見つかりません（${CARDS}）。動画生成をスキップします。"
    exit 0
  fi
  : > "$CONCAT_LIST"
  for f in "${card_files[@]}"; do
    echo "file '$(pwd)/${f}'" >> "$CONCAT_LIST"
    echo "duration 3" >> "$CONCAT_LIST"
  done
  # concat demuxerの仕様上、最後のファイルをもう一度書く必要がある
  LAST_CARD="${card_files[-1]}"
  echo "file '$(pwd)/${LAST_CARD}'" >> "$CONCAT_LIST"
  ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -vf "scale=1080:1350,fps=30" -pix_fmt yuv420p "$SILENT_OUT"
fi

if [ -f "$NARRATION" ]; then
  ffmpeg -y -i "$SILENT_OUT" -i "$NARRATION" -c:v copy -c:a aac -shortest "$FINAL_OUT"
else
  cp "$SILENT_OUT" "$FINAL_OUT"
fi

echo "生成しました: ${FINAL_OUT}"
