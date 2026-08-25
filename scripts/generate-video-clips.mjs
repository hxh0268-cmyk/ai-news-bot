// STEP3a: fal.ai経由でKling AIを呼び出し、動画クリップを生成する（話題対応版）。
// fal.aiの公式クライアント（@fal-ai/client）を使用する。理由：
// fal.aiはファイルアップロード・キュー管理（送信→ステータス確認→結果取得）を
// 独自のREST仕様で行っており、公式クライアントを使うことでこれらを自動化できる。
//
// 必要な環境変数:
//   FAL_KEY … fal.aiのAPIキー（fal.ai/dashboard/keys から取得）
//
// コスト調整のため、画像は5枚作るが動画は各話題設定の videoCount 本だけに絞る。

import fs from "node:fs";
import path from "node:path";
import { fal } from "@fal-ai/client";
import { loadTopic } from "./topic-context.mjs";
import { withRetry } from "./retry.mjs";

const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) {
  console.error("FAL_KEY が設定されていません。GitHub Secretsに登録してください。");
  process.exit(1);
}
fal.config({ credentials: FAL_KEY });

const { topic, outputDir } = loadTopic();
const VIDEO_COUNT = topic.videoCount ?? 3;

// 使用するモデル。コストと画質のバランスが良い「standard」を既定にしている。
// 画質を優先したい場合は "fal-ai/kling-video/v3/pro/image-to-video" 等に変更可能
// （fal.aiのモデル一覧: https://fal.ai/models?category=image-to-video で確認できます）。
const MODEL_ENDPOINT = "fal-ai/kling-video/v2.1/standard/image-to-video";

function motionPrompt(item) {
  return `${item.headline}。ゆっくりとした映画的なズームと、被写体の自然な揺らぎ。派手な動きは避け、上品で落ち着いた印象にする。`;
}

async function uploadImage(imagePath) {
  const buf = fs.readFileSync(imagePath);
  const file = new File([buf], path.basename(imagePath), { type: "image/png" });
  return await fal.storage.upload(file);
}

async function generateClip(imagePath, prompt) {
  const imageUrl = await uploadImage(imagePath);

  const result = await fal.subscribe(MODEL_ENDPOINT, {
    input: {
      image_url: imageUrl,
      prompt,
      duration: "5",
    },
    logs: false,
  });

  const videoUrl = result?.data?.video?.url;
  if (!videoUrl) throw new Error("動画URLが結果に含まれていません: " + JSON.stringify(result).slice(0, 500));
  return videoUrl;
}

async function downloadTo(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ダウンロード失敗: ${res.status}`);
  fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const top5 = JSON.parse(fs.readFileSync(path.join(outputDir, "top5.json"), "utf-8"));
  const targets = top5.slice(0, VIDEO_COUNT);
  const cardsDir = path.join(outputDir, "cards");
  const clipsDir = path.join(outputDir, "clips");
  fs.mkdirSync(clipsDir, { recursive: true });

  let successCount = 0;
  for (let i = 0; i < targets.length; i++) {
    console.log(`[${topic.slug}] 動画クリップ生成中 (${i + 1}/${targets.length})...`);
    try {
      await withRetry(
        async () => {
          const videoUrl = await generateClip(path.join(cardsDir, `${i + 1}.png`), motionPrompt(targets[i]));
          await downloadTo(videoUrl, path.join(clipsDir, `${i + 1}.mp4`));
        },
        { retries: 2, label: `動画クリップ生成(${i + 1})` }
      );
      successCount++;
    } catch (err) {
      // fal.ai/Klingが不調でも、静止画だけで投稿は続行できるようにする（全体を止めない）
      console.error(`⚠️ 動画クリップ(${i + 1})の生成に失敗しました。動画なしで続行します: ${err.message}`);
    }
  }

  fs.writeFileSync(
    path.join(outputDir, "video-status.json"),
    JSON.stringify({ requested: targets.length, succeeded: successCount }, null, 2),
    "utf-8"
  );

  console.log(`動画クリップ生成完了（成功: ${successCount}/${targets.length}）`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
