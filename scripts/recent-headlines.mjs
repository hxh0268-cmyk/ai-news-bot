// 直近の既出トピックを集約し、STEP1（generate.mjs）のプロンプトに
// 「重複回避の除外リスト」として渡すためのヘルパー。
//
// 主なデータソースは output/<topic>/<日付>/top5.json。generate.mjs は
// 常にリポジトリのmainブランチ上でチェックアウトされた状態で実行される
// ため、loadRecentHeadlines() がファイルシステムから読める日付は
// すべて「人間がレビューしてマージ済み」の過去分に限られる。
// 加えて loadOpenPrHeadlines() は、まだマージされていない
// （＝レビュー待ちの）content/<topic>/* ブランチもGitHub API経由で
// 参照する。これにより、複数日分のPRが同時にレビュー待ちで滞留している
// 状況でも、そのPR同士の内容が重複するのを避けやすくなる。
//
// APIを呼ばないloadRecentHeadlines()等は純粋関数として分離しているため、
// ユニットテストやローカルでの動作確認がしやすい（generate.mjs単体の
// 実行にはAPIキーが必要だが、こちらは不要）。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const DEFAULT_RECENT_DAYS = 5;

const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;

// output/<topic>/ 配下から、dateStrより前の日付ディレクトリを新しい順に
// 最大 days 件集め、それぞれの top5.json から見出し・chipsを取り出す。
// 過去ディレクトリが1つも無い場合や、個々のファイルが読めない場合でも
// 例外を投げず、集められた分だけを返す。
export function loadRecentHeadlines({ root, topicSlug, dateStr, days = DEFAULT_RECENT_DAYS }) {
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
    .reverse()
    .slice(0, days);

  const items = [];
  for (const date of pastDates) {
    const top5Path = path.join(topicOutputDir, date, "top5.json");
    if (!fs.existsSync(top5Path)) continue;
    try {
      const top5 = JSON.parse(fs.readFileSync(top5Path, "utf-8"));
      for (const item of top5) {
        if (!item || !item.headline) continue;
        items.push({ date, headline: item.headline, chips: Array.isArray(item.chips) ? item.chips : [] });
      }
    } catch {
      // 壊れたJSON・想定外の形式は読み飛ばす（重複回避は補助的な仕組みのため、
      // ここで失敗してもSTEP1本体を止めるべきではない）
      continue;
    }
  }
  return items;
}

// 現在オープン中の content/<topic>/* ブランチ（＝人間のレビュー待ちのPR）
// からも見出しを収集する。gh CLIを使ってGitHub APIを呼び出すため、
// GITHUB_REPOSITORY環境変数（GitHub Actions実行時に自動設定される）と、
// gh CLIが認証済みであること（GH_TOKEN/GITHUB_TOKEN環境変数）が必要。
// ローカル実行時や、権限・API制限等でどこかの呼び出しが失敗した場合でも
// 例外を投げず、取得できた分だけ（0件も含む）を返す。
export function loadOpenPrHeadlines({ topicSlug }) {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return [];

  let branches;
  try {
    const raw = execFileSync(
      "gh",
      ["pr", "list", "--repo", repo, "--state", "open", "--json", "headRefName"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
    );
    branches = JSON.parse(raw)
      .map((pr) => pr.headRefName)
      .filter((ref) => typeof ref === "string" && ref.startsWith(`content/${topicSlug}/`));
  } catch {
    return [];
  }

  const items = [];
  for (const branch of branches) {
    const date = branch.split("/")[2];
    if (!date || !DATE_DIR_RE.test(date)) continue;
    try {
      // 注意: gh api は -f/-F でパラメータを渡すと自動的にPOSTへ切り替わって
      // しまう（Contents APIはGETしか受け付けないため404になる）。
      // refクエリパラメータは直接URLに埋め込むことでGETのまま呼び出す。
      const raw = execFileSync(
        "gh",
        [
          "api",
          `repos/${repo}/contents/output/${topicSlug}/${date}/top5.json?ref=${encodeURIComponent(branch)}`,
          "--jq",
          ".content",
        ],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
      );
      const top5 = JSON.parse(Buffer.from(raw.trim(), "base64").toString("utf-8"));
      for (const item of top5) {
        if (!item || !item.headline) continue;
        items.push({ date: `${date}（レビュー待ち）`, headline: item.headline, chips: Array.isArray(item.chips) ? item.chips : [] });
      }
    } catch {
      // そのブランチのファイルが読めない・存在しない等は読み飛ばす
      continue;
    }
  }
  return items;
}

// プロンプトに埋め込む「除外リスト」セクションを組み立てる。
// 完全一致の文字列比較ではなく、Claude自身に「同一の出来事・同一の発表を
// 扱っているかどうか」を判断させる指示文にしている（続報・詳細判明なども
// 含めて避けてほしいが、機械的な一致だけに頼らないため）。
export function buildExclusionSection(items, days = DEFAULT_RECENT_DAYS) {
  if (items.length === 0) return "";

  const lines = items
    .map((i) => `- ${i.headline}${i.chips.length ? `（キーワード: ${i.chips.join("、")}）` : ""}`)
    .join("\n");

  return `

【重複回避：直近${days}日以内に取り上げた、またはレビュー待ちのニュース】
以下は直近の配信で既に取り上げた記事、および現在レビュー待ち（マージ前）のPRに含まれる記事の見出しです。同一の出来事・同一の発表を扱う記事（続報・詳細が新たに判明した場合なども含む）は、
できるだけ避けて別の話題を選んでください。表現やキーワードが少し違っていても、報じている出来事の実態が同じなら重複とみなしてください。
ただし、他に代わるニュースが本当に無い場合はこの限りではありません。

${lines}`;
}

// カンマ区切りの文字列（workflow_dispatch入力 EXCLUDE_HEADLINES 等）を
// キーワード配列にパースする。空文字・未設定・空白のみの要素は取り除く。
export function parseManualKeywords(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// regenerate-content.yml（手動の丸ごと再生成）で、人間が明示的に指定した
// 除外キーワード用のセクション。loadRecentHeadlines()による自動検出とは
// 独立した仕組みのため、プロンプト上も別セクションとして分けている。
export function buildManualExclusionSection(keywords) {
  if (keywords.length === 0) return "";

  return `

【追加の除外指定（手動指定）】
今回は特に以下のキーワードに関連するニュースは避けてください：${keywords.join("、")}`;
}
