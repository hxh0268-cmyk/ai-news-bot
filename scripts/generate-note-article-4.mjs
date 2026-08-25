// STEP1.8: note販売用の記事ドラフトを生成する（話題対応版）
import fs from "node:fs";
import path from "node:path";
import { loadTopic } from "./topic-context.mjs";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY が設定されていません。");
  process.exit(1);
}

const MODEL = "claude-sonnet-5";
const { topic, outputDir, dateStr } = loadTopic();
const data = JSON.parse(fs.readFileSync(path.join(outputDir, "data.json"), "utf-8"));

const SYSTEM_PROMPT = `
${topic.noteEditorRole || "あなたはnote.comで販売する有料記事を書く編集者です。"}

【文体：物語調の連載エッセイ】
単なるニュースの要約ではなく、「AIの進化を毎日追いかけている、ひとりの語り手（編集長）」の
一人称視点による連載エッセイとして書いてください。読者は「今日は何があったか」ではなく
「この語り手が何を感じ、何を考えたか」を追体験する感覚で読みます。

- 冒頭は、その日の空気感や語り手の気づきから始める小さな情景描写・導入にする（例：「〜を見て、ふと手が止まった」）
- ニュースを箇条書きで並べるのではなく、複数のニュースを地続きの「今日の物語」として繋げる
- 語り手の率直な感想・違和感・驚きを織り交ぜる（ただし断定しすぎず、読者と一緒に考える姿勢を保つ）
- 事実（何が起きたか）は一切脚色・誇張しない。物語的なのは「語り口・視点」だけで、起きていない出来事を作ってはいけない
- 「〜です、〜ます」の丁寧語をベースにしつつ、語り手の人間味が伝わる自然な文体にする

構成ルール：
- 冒頭は無料で読める部分。読者が続きを読みたくなるような、物語の「つかみ」にする
- 本文中に必ず1行だけ ---PAYWALL--- という区切り文字列を入れる（これ以降が有料部分）
- 有料部分では、物語の続きとして、深掘り解説・複数ニュースを繋げた考察・今後の展望を語る
- 有料部分の最後（まとめの前）に、「今日からできる、ひとつだけのアクション」を必ず1つ提案する。
  これは物語の自然な締めくくりとして書くこと（唐突な箇条書き広告のようにしない）。
  提案内容は日によって変えてよい：紹介したツールを実際に触ってみる、関連情報を少し調べてみる、
  自分の仕事にどう関係するか1分だけ考えてみる、など。読者に行動を強制する書き方は避け、
  「よければ、こんなことを試してみませんか」という軽い誘いのトーンにする
- 最後に「想定価格」を提案する（1本あたり100〜300円程度が目安）
- 企業名・サービス名・製品名などの固有名詞は、カタカナ訳をせず公式の英語表記のまま使う（例：「アンソロピック」ではなく「Anthropic」）

出力形式（Markdown、これ以外の文章は含めない）：

# （記事タイトル。ニュース見出しの羅列ではなく、その日の物語を表すタイトルにする）

（無料部分の本文）

---PAYWALL---

（有料部分の本文。末尾に「今日からできる、ひとつだけのアクション」を自然な文章として含める）

## まとめ

（まとめ文。物語のいったんの着地点として書く）

（続けて、2〜4文程度の短い結びの文章を書く。この結びには必ず次の2つの要素を、
自然な1つの流れとして含めること：
①今日語った内容が、読者自身の仕事や日常のどこかに、前向きな形でつながる可能性を
　1つだけ示す（不安を煽らず、「自分の選択肢が広がるかもしれない」というトーンにする）
②明日もまた、AIの世界のどこかで新しい変化が起きているはずだという、
　押しつけがましくない静かな期待を持たせる一文で締める（具体的な予告内容は書かない）
不安・焦り・「乗り遅れる」といった煽り表現は一切使わないこと）

---
**想定価格：（金額）円**
**タグ案：（カンマ区切りで5個程度）**
`.trim();

const USER_PROMPT = `以下は本日(${dateStr})の「${topic.displayName}」7本です。このデータをもとに、上記フォーマットでnote記事を作成してください。\n\n${JSON.stringify(
  data.map((d) => ({ headline: d.headline, dek: d.dek, body: d.body, why: d.why, sourceLine: d.sourceLine })),
  null,
  2
)}`;

async function callClaude() {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 6000, system: SYSTEM_PROMPT, messages: [{ role: "user", content: USER_PROMPT }] }),
  });
  if (!res.ok) throw new Error(`Claude API エラー: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

async function main() {
  console.log(`[${topic.slug}] noteの有料記事ドラフトを作成しています…`);
  const article = await callClaude();

  const header = `<!--
  noteへの掲載手順（手動・所要3分程度）:
  1. ---PAYWALL--- より前を、noteエディタの本文に貼り付け
  2. note編集画面の「有料エリア設定」で、---PAYWALL--- 以降を有料部分として貼り付け
  3. 下部の「想定価格」を参考に価格を設定
  4. タグ案を参考にタグを設定
  5. 内容を確認し、公開

  note公式には投稿APIが無いため、この貼り付け作業だけは手動で行ってください。
-->

`;

  fs.writeFileSync(path.join(outputDir, "note-article.md"), header + article, "utf-8");
  console.log(`完了: output/${topic.slug}/${dateStr}/note-article.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
