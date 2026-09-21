// STEP3b: ElevenLabsでナレーション音声を生成する（話題対応版）
import fs from "node:fs";
import path from "node:path";
import { fetch as undiciFetch, Agent } from "undici";
import { loadTopic } from "./topic-context.mjs";
import { withRetry } from "./retry.mjs";

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
if (!API_KEY || !VOICE_ID) {
  console.warn("ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID が未設定のため、ナレーションなしで続行します。");
  process.exit(0); // ナレーションは無くても投稿自体は成立するため、警告のみでワークフローは継続させる
}

const { topic, outputDir } = loadTopic();
const NARRATION_COUNT = topic.narrationCount ?? 3;

// scripts/generate.mjs（STEP1）で発生したUND_ERR_HEADERS_TIMEOUT障害（2026-09-19）を踏まえた
// 予防対応。このファイルは元々タイムアウト制御自体が無かったため、
// undiciパッケージ自身のfetch・Agentを使い、明示的なタイムアウトを設定する。
const NARRATION_FETCH_AGENT = new Agent({ headersTimeout: 150000, bodyTimeout: 150000 });

function buildScript(items) {
  const intro = `今日の${topic.displayName}、注目の${items.length}本をお届けします。`;
  const body = items.map((item, i) => `${i + 1}本目。${item.headline}。${item.why}`).join(" ");
  const outro = "続きや出典は、記事本文でご確認ください。";
  return `${intro} ${body} ${outro}`;
}

async function main() {
  const top5 = JSON.parse(fs.readFileSync(path.join(outputDir, "top5.json"), "utf-8"));
  const text = buildScript(top5.slice(0, NARRATION_COUNT));

  try {
    const buf = await withRetry(
      async () => {
        const res = await undiciFetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
          method: "POST",
          headers: { "xi-api-key": API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
          dispatcher: NARRATION_FETCH_AGENT,
          signal: AbortSignal.timeout(120000),
        });
        if (!res.ok) throw new Error(`ElevenLabs API エラー: ${res.status} ${await res.text()}`);
        return Buffer.from(await res.arrayBuffer());
      },
      { retries: 3, label: "ナレーション生成" }
    );
    fs.writeFileSync(path.join(outputDir, "narration.mp3"), buf);
    console.log(`[${topic.slug}] ナレーション音声を生成しました。`);
  } catch (err) {
    // ナレーション無しでも動画自体は成立するため、ここで失敗させず警告のみに留める
    console.error(`⚠️ ナレーション生成に失敗しました。音声なしの動画として続行します: ${err.message}`);
  }
}

main();
