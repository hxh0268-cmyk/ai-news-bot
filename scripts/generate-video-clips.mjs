// STEP3a: Kling AIで動画クリップを生成する（話題対応版）。コスト調整のため
// 画像は5枚作るが、動画は各話題設定の videoCount 本だけに絞る。
import fs from "node:fs";
import path from "node:path";
import { loadTopic } from "./topic-context.mjs";
import { withRetry } from "./retry.mjs";

const API_KEY = process.env.KLING_API_KEY;
const BASE_URL = process.env.KLING_API_BASE_URL || "https://api.klingai.com";
if (!API_KEY) {
  console.error("KLING_API_KEY が設定されていません。");
  process.exit(1);
}

const { topic, outputDir } = loadTopic();
const VIDEO_COUNT = topic.videoCount ?? 3;

function motionPrompt(item) {
  return `${item.headline}。ゆっくりとした映画的なズームと、被写体の自然な揺らぎ。派手な動きは避け、上品で落ち着いた印象にする。`;
}

async function submitJob(imagePath, prompt) {
  const imageBase64 = fs.readFileSync(imagePath).toString("base64");
  const res = await fetch(`${BASE_URL}/v1/videos/image2video`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "kling-v3", image: imageBase64, prompt, duration: 4, aspect_ratio: "3:4" }),
  });
  if (!res.ok) throw new Error(`Kling API エラー（送信）: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const taskId = data.task_id || data.id;
  if (!taskId) throw new Error("task_idが取得できませんでした: " + JSON.stringify(data));
  return taskId;
}

async function pollJob(taskId, { intervalMs = 5000, timeoutMs = 5 * 60 * 1000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${BASE_URL}/v1/tasks/${taskId}`, { headers: { Authorization: `Bearer ${API_KEY}` } });
    if (!res.ok) throw new Error(`Kling API エラー（ポーリング）: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const status = data.status || data.task_status;
    if (["succeed", "completed", "success"].includes(status)) {
      const videoUrl = data.video_url || data.result?.video_url || data.output?.video_url;
      if (!videoUrl) throw new Error("動画URLが見つかりません: " + JSON.stringify(data));
      return videoUrl;
    }
    if (["failed", "error"].includes(status)) throw new Error("生成失敗: " + JSON.stringify(data));
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`タイムアウト: タスク ${taskId}`);
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
          const taskId = await submitJob(path.join(cardsDir, `${i + 1}.png`), motionPrompt(targets[i]));
          const videoUrl = await pollJob(taskId);
          await downloadTo(videoUrl, path.join(clipsDir, `${i + 1}.mp4`));
        },
        { retries: 2, label: `動画クリップ生成(${i + 1})` }
      );
      successCount++;
    } catch (err) {
      // Kling APIが不調でも、静止画だけで投稿は続行できるようにする（全体を止めない）
      console.error(`⚠️ 動画クリップ(${i + 1})の生成に失敗しました。動画なしで続行します: ${err.message}`);
    }
  }

  // 1本も動画が作れなかった場合は、後続のbuild-video.shが動画無しで正常終了できるよう
  // その旨をファイルに記録しておく（build-video.sh側で参照）
  fs.writeFileSync(
    path.join(outputDir, "video-status.json"),
    JSON.stringify({ requested: targets.length, succeeded: successCount }, null, 2),
    "utf-8"
  );

  console.log(`動画クリップ生成完了（成功: ${successCount}/${targets.length}）`);
  // 1本も成功しなかった場合でも、ワークフロー自体は失敗させない（continue-on-errorではなく、ここで正常終了扱いにする）
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
