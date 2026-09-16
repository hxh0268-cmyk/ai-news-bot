import { test } from "node:test";
import assert from "node:assert/strict";
import { findDuplicate, deduplicateItems, normalizeTitle, extractCanonicalUrl, textSimilarity } from "../dedup.mjs";

test("same URL: sourceLineに同一URLがあれば重複と判定", () => {
  const a = { headline: "AがBを買収", dek: "詳細", sourceLine: "https://example.com/news/123（2026年9月）" };
  const b = { headline: "全く違う見出しの記事", dek: "別の話", sourceLine: "https://example.com/news/123" };
  const result = findDuplicate(b, [a]);
  assert.equal(result.isDuplicate, true);
  assert.equal(result.reason, "SAME_CANONICAL_URL");
});

test("same title: 正規化後のタイトルが完全一致すれば重複と判定", () => {
  const a = { headline: "OpenAI、新モデル「GPT-X」を発表", dek: "" };
  const b = { headline: "OpenAI、新モデル「GPT-X」を発表。", dek: "" }; // 句点の有無だけ違う
  const result = findDuplicate(b, [a]);
  assert.equal(result.isDuplicate, true);
  assert.equal(result.reason, "SAME_NORMALIZED_TITLE");
});

test("same event: 見出し・dekが酷似していれば重複と判定（semantic similarity近似）", () => {
  const a = { headline: "Amazonが半導体に9兆円投資、Nvidia包囲網", dek: "Qualcommと長期提携" };
  const b = { headline: "Amazonが半導体投資に9兆円、Nvidiaへの包囲網", dek: "Qualcommと長期的に提携" };
  const result = findDuplicate(b, [a]);
  assert.equal(result.isDuplicate, true);
  assert.equal(result.reason, "SAME_EVENT_SIMILARITY");
});

test("非重複: 全く異なる記事は重複と判定されない", () => {
  const a = { headline: "OpenAIがIPOを延期", dek: "AI開発ペース抑制で合意" };
  const b = { headline: "ローソンが品出しロボットを実証", dek: "KDDIがGENIAC採択" };
  const result = findDuplicate(b, [a]);
  assert.equal(result.isDuplicate, false);
});

test("normalizeTitle: 空白・記号の違いを吸収する", () => {
  assert.equal(normalizeTitle("AIが人類を脅かす確率は？"), normalizeTitle("AIが人類を脅かす確率は？　"));
});

test("extractCanonicalUrl: URLが無ければnull", () => {
  assert.equal(extractCanonicalUrl({ sourceLine: "日本経済新聞、2026年9月1日" }), null);
});

test("textSimilarity: 同一文字列は類似度1", () => {
  assert.equal(textSimilarity("テスト見出し", "テスト見出し"), 1);
});

test("deduplicateItems: 重複除去後、除去された記事の出典が採用記事のcorroboratingSourcesに残る", () => {
  const items = [
    { headline: "Amazonが半導体に9兆円投資、Nvidia包囲網", dek: "Qualcommと長期提携", sourceLine: "CNBC、2026年9月12日" },
    { headline: "Amazonが半導体投資に9兆円、Nvidiaへの包囲網", dek: "Qualcommと長期的に提携", sourceLine: "Reuters、2026年9月12日" },
    { headline: "全く別の話題のニュース", dek: "無関係", sourceLine: "AI Weekly" },
  ];
  const { accepted, rejected } = deduplicateItems(items);
  assert.equal(accepted.length, 2);
  assert.equal(rejected.length, 1);
  assert.ok(accepted[0]._corroboratingSources.includes("Reuters、2026年9月12日"));
});
