// generate-monetization-article.mjs用の重複回避ヘルパー。
// recent-headlines.mjs（generate.mjsの重複回避）と同じ考え方・同じ
// 実装パターンを踏襲している: 専用の履歴ファイルは持たず、既に
// generate-monetization-article.mjsが出力しているoutput/<topic>/<date>/
// monetization-article.jsonを直接読み返すことで「直近取り上げたツール」を
// 復元する（生成の副産物をそのまま履歴として使う、追加の状態管理を持たない
// 設計）。
//
// 本スクリプトの生成頻度は週1〜2回程度（毎日ではない）ため、
// recent-headlines.mjsのような「直近◯日」ではなく「直近◯回」で
// 数える点が異なる。過去の日付ディレクトリを新しい順に遡り、
// monetization-article.jsonが実際に存在した回だけをカウントする。
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_RECENT_COUNT = 4;

const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;

// output/<topic>/ 配下をdateStrより前の日付で新しい順に遡り、
// monetization-article.jsonが存在する回をcount件集めてtoolNameを返す。
// ディレクトリが無い・JSONが壊れている等でも例外を投げず、
// 集められた分だけを返す（重複回避は補助的な仕組みのため、
// ここで失敗しても記事生成本体を止めるべきではない）。
export function loadRecentMonetizationTools({ root, topicSlug, dateStr, count = DEFAULT_RECENT_COUNT }) {
  const topicOutputDir = path.join(root, "output", topicSlug);
  if (!fs.existsSync(topicOutputDir)) return [];

  let entries;
  try {
    entries = fs.readdirSync(topicOutputDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const pastDates = entries
    .filter((e) => e.isDirectory() && DATE_DIR_RE.test(e.name) && e.name < dateStr)
    .map((e) => e.name)
    .sort()
    .reverse();

  const tools = [];
  for (const date of pastDates) {
    if (tools.length >= count) break;
    const articlePath = path.join(topicOutputDir, date, "monetization-article.json");
    if (!fs.existsSync(articlePath)) continue;
    try {
      const article = JSON.parse(fs.readFileSync(articlePath, "utf-8"));
      if (article && article.toolName) tools.push({ date, toolName: article.toolName });
    } catch {
      continue;
    }
  }
  return tools;
}

// プロンプトに埋め込む「除外リスト」セクションを組み立てる。
// buildExclusionSection（recent-headlines.mjs）と同じ考え方: 完全一致では
// なく、Claude自身に「同一のツール・サービスかどうか」を判断させる。
export function buildMonetizationToolExclusionSection(tools) {
  if (tools.length === 0) return "";

  const lines = tools.map((t) => `- ${t.toolName}（${t.date}に取り上げ済み）`).join("\n");

  return `

【重複回避：直近${tools.length}回で取り上げたツール・サービス】
以下は直近の「AIマネタイズ副業」記事で既に取り上げたツール・サービスです。同一のツール・サービス（表記ゆれや別称も含む）を再び選ぶことは避け、別のツール・サービスを選んでください。
ただし、他に紹介できる実在のツール・サービスが本当に見当たらない場合はこの限りではありません。

${lines}`;
}
