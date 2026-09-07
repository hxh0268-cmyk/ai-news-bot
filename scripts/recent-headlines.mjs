// 直近の既出トピックを集約し、STEP1（generate.mjs）のプロンプトに
// 「重複回避の除外リスト」として渡すためのヘルパー。
//
// データソースは output/<topic>/<日付>/top5.json。generate.mjs は
// 常にリポジトリのmainブランチ上でチェックアウトされた状態で実行される
// ため、ここに存在する日付はすべて「人間がレビューしてマージ済み」の
// 過去分に限られる（レビュー前のPRの内容を誤って参照することはない）。
//
// APIを呼ばない純粋関数として分離しているため、ユニットテストや
// ローカルでの動作確認がしやすい（generate.mjs単体の実行にはAPIキーが
// 必要だが、こちらは不要）。
import fs from "node:fs";
import path from "node:path";

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

【重複回避：直近${days}日以内に既に取り上げたニュース】
以下は直近の配信で既に取り上げた記事の見出しです。同一の出来事・同一の発表を扱う記事（続報・詳細が新たに判明した場合なども含む）は、
できるだけ避けて別の話題を選んでください。表現やキーワードが少し違っていても、報じている出来事の実態が同じなら重複とみなしてください。
ただし、他に代わるニュースが本当に無い場合はこの限りではありません。

${lines}`;
}
