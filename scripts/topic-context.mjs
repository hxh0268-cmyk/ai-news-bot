// 全スクリプト共通：どの「話題」で動いているかを判定し、関連ファイルパスをまとめて返す。
// 環境変数 TOPIC が未指定の場合は "ai-news"（既存の挙動）にフォールバックする。
// CONTENT_DATE が設定されている場合はその日付を使う（日付またぎバグ対策）。

import fs from "node:fs";
import path from "node:path";

export function loadTopic() {
  const slug = process.env.TOPIC || "ai-news";
  const root = process.cwd();

  const topicConfigPath = path.join(root, "config", "topics", `${slug}.json`);
  if (!fs.existsSync(topicConfigPath)) {
    throw new Error(
      `話題設定が見つかりません: config/topics/${slug}.json\n` +
        `新しい話題を追加する場合は、このファイルを作成してください（config/topics/ai-news.json をコピーして編集するのが簡単です）。`
    );
  }
  const topic = JSON.parse(fs.readFileSync(topicConfigPath, "utf-8"));

  const affiliatePath = path.join(root, "config", "affiliate-links", `${slug}.json`);
  const affiliateConfig = fs.existsSync(affiliatePath)
    ? JSON.parse(fs.readFileSync(affiliatePath, "utf-8"))
    : { links: [] };

  const sponsorPath = path.join(root, "config", "sponsor-today", `${slug}.json`);
  const sponsor = fs.existsSync(sponsorPath) ? JSON.parse(fs.readFileSync(sponsorPath, "utf-8")) : null;

  // CONTENT_DATE が設定されていればそれを使う。なければ実行時刻のUTC日付。
  // ワークフロー開始時に一度だけ計算した日付をすべてのステップに渡すことで、
  // 深夜のステップ間で日付が変わる日付またぎバグを防ぐ。
  const today = process.env.CONTENT_DATE || new Date().toISOString().slice(0, 10);
  const outputDir = path.join(root, "output", slug, today);
  const docsDir = path.join(root, "docs", slug);

  return { slug, topic, affiliateConfig, sponsor, dateStr: today, outputDir, docsDir, root };
}
