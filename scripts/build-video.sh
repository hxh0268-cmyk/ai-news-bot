#!/usr/bin/env bash
# STEP3c: クリップ結合＋ナレーション合成（話題対応版・フォールバック対応）
# Kling APIが不調でクリップが1本も無い場合は、カード画像から簡易スライドショーを作る。

set -euo pipefail

TOPIC="${TOPIC:-ai-news}"
VIDEO_COUNT="${VIDEO_COUNT:-3}"
DATE_STR=$(date -u +%Y-%m-%d)
DIR="output/${TOPIC}/${DATE_STR}"
CLIPS="${DIR}/clips"
CARDS="${DIR}/cards"
NARRATION="${DIR}/narration.mp3"
CONCAT_LIST="${DIR}/concat_list.txt"
SILENT_OUT="${DIR}/slideshow_silent.mp4"
FINAL_OUT="${DIR}/slideshow.mp4"

AVAILABLE_CLIPS=0
if [ -d "$CLIPS" ]; then
  AVAILABLE_CLIPS=$(ls "${CLIPS}"/*.mp4 2>/dev/null | wc -l | tr -d ' ')
fi

if [ "$AVAILABLE_CLIPS" -gt 0 ]; then
  echo "Kling生成クリップ ${AVAILABLE_CLIPS}本を使用します。"
  > "$CONCAT_LIST"
  for f in "${CLIPS}"/*.mp4; do
    echo "file '$(pwd)/${f}'" >> "$CONCAT_LIST"
  done
  ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -c:v libx264 -pix_fmt yuv420p -r 30 "$SILENT_OUT"
else
  echo "⚠️ Klingクリップが1本も無いため、カード画像から簡易スライドショーで代替します。"
  > "$CONCAT_LIST"
  for f in "${CARDS}"/*.png; do
    echo "file '$(pwd)/${f}'" >> "$CONCAT_LIST"
    echo "duration 3" >> "$CONCAT_LIST"
  done
  # concat demuxerの仕様上、最後のファイルをもう一度書く必要がある
  LAST_CARD=$(ls "${CARDS}"/*.png | tail -n 1)
  echo "file '$(pwd)/${LAST_CARD}'" >> "$CONCAT_LIST"
  ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -vf "scale=1080:1350,fps=30" -pix_fmt yuv420p "$SILENT_OUT"
fi

if [ -f "$NARRATION" ]; then
  ffmpeg -y -i "$SILENT_OUT" -i "$NARRATION" -c:v copy -c:a aac -shortest "$FINAL_OUT"
else
  cp "$SILENT_OUT" "$FINAL_OUT"
fi

echo "生成しました: ${FINAL_OUT}"
