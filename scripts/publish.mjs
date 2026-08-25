// STEP4（PRがMergeされた後に実行）: 承認済みデータをZapierへ送信する（話題対応版）
//
// 必要な環境変数:
//   TOPIC                 … どの話題か（publish.ymlがPRのブランチ名から自動設定）
//   ZAPIER_WEBHOOKS_JSON   … { "ai-news": "https://hooks.zapier.com/...", "finance-news": "https://..." }
//                             のようなJSON文字列。話題ごとに別のZapに振り分けたい場合に対応
//   GITHUB_REPOSITORY     … GitHub Actionsが自動設定

import fs from "node:fs";
import path from "node:path";
import { loadTopic } from "./topic-context.mjs";

const WEBHOOKS_JSON = process.env.ZAPIER_WEBHOOKS_JSON;
const REPO = process.env.GITHUB_REPOSITORY;

if (!WEBHOOKS_JSON) {
  console.error("ZAPIER_WEBHOOKS_JSON が設定されていません。GitHub Secretsに登録してください。");
  process.exit(1);
}
if (!REPO) {
  console.error("GITHUB_REPOSITORY が取得できませんでした。");
  process.exit(1);
}

const { topic, outputDir, dateStr, root } = loadTopic();

// ── 冪等性（重複投稿防止）チェック ──────────────────────────────
// 「この話題・この日付」がすでに投稿済みかどうかを ledger/<topic>.json に記録する。
// 何らかの理由でワークフローが二重に走った場合でも、二重投稿を防ぐための安全策。
const ledgerPath = path.join(root, "ledger", `${topic.slug}.json`);
const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, "utf-8")) : { published: [] };

const alreadyPublished = ledger.published.some((entry) => entry.date === dateStr);
if (alreadyPublished) {
  console.log(
    `[${topic.slug}] ${dateStr} 分は ledger 上ですでに投稿済み（ALREADY_PUBLISHED）と記録されています。` +
      `二重投稿を防ぐため、今回の送信はスキップします。`
  );
  process.exit(0);
}

const webhooks = JSON.parse(WEBHOOKS_JSON);
const webhookUrl = webhooks[topic.slug];
if (!webhookUrl) {
  throw new Error(
    `話題 "${topic.slug}" 用のWebhook URLが ZAPIER_WEBHOOKS_JSON に見つかりません。` +
      `例: {"${topic.slug}": "https://hooks.zapier.com/..."} の形式で登録してください。`
  );
}

const top5 = JSON.parse(fs.readFileSync(path.join(outputDir, "top5.json"), "utf-8"));

const rawBase = `https://raw.githubusercontent.com/${REPO}/main/output/${topic.slug}/${dateStr}`;
const [owner, repoName] = REPO.split("/");
const siteBaseUrl = `https://${owner}.github.io/${repoName}/${topic.slug}/`;

function siteUrlWithUtm(medium) {
  const u = new URL(siteBaseUrl);
  u.searchParams.set("utm_source", topic.slug);
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", dateStr);
  return u.toString();
}

const withSiteLink = (caption, medium) => `${caption}\n\n🔗 続き・出典まとめはこちら: ${siteUrlWithUtm(medium)}`;

const payload = {
  topic: topic.slug,
  date: dateStr,
  siteUrl: siteBaseUrl,
  // Instagram/Threads向け（縦長 1080x1350）
  imagesPortrait: top5.map((_, i) => `${rawBase}/cards/${i + 1}.png`),
  // X向け（横長 1200x675）。無ければportrait版にフォールバック
  imagesLandscape: top5.map((_, i) => `${rawBase}/cards-x/${i + 1}.png`),
  video: `${rawBase}/slideshow.mp4`,
  posts: top5.map((item, i) => ({
    index: i + 1,
    headline: item.headline,
    captionX: item.captionX,
    captionThreads: item.captionThreads,
    captionInstagram: item.captionInstagram,
    imageUrlPortrait: `${rawBase}/cards/${i + 1}.png`,
    imageUrlLandscape: `${rawBase}/cards-x/${i + 1}.png`,
  })),
  carouselCaptionInstagram: withSiteLink(top5[0]?.captionInstagram || "", "instagram"),
  carouselCaptionThreads: withSiteLink(top5[0]?.captionThreads || "", "threads"),
  carouselCaptionX: withSiteLink(top5[0]?.captionX || "", "x"),
};

async function main() {
  console.log(`[${topic.slug}] Zapier webhookに送信します`);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Webhook送信エラー: ${res.status} ${await res.text()}`);

  // 送信成功をledgerに記録する（この記録がGitHub Actions上でcommitされ、次回以降の重複防止に使われる）
  const variantPath = path.join(outputDir, "variant.json");
  const variant = fs.existsSync(variantPath) ? JSON.parse(fs.readFileSync(variantPath, "utf-8")).variant : null;
  ledger.published.push({
    date: dateStr,
    publishedAt: new Date().toISOString(),
    runId: process.env.GITHUB_RUN_ID || null,
    variant,
  });
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), "utf-8");

  console.log("送信完了。Zapier → Buffer 経由でSNS投稿が行われます。ledgerを更新しました。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
