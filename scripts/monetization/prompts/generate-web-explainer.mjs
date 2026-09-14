// Section 15: Web解説（1,500〜3,000字、high tier）
export const WEB_EXPLAINER_TOOL = {
  name: "submit_web_explainer",
  description: "Web解説記事を提出する。",
  input_schema: {
    type: "object",
    properties: {
      body: { type: "string", description: "1,500〜3,000字の日本語本文" },
      sectionsUsed: {
        type: "array",
        items: { type: "string" },
        description: "実際に使用した見出し構成（無理に全項目埋めなくてよい）",
      },
    },
    required: ["body", "sectionsUsed"],
  },
};

export function buildWebExplainerPrompt(item) {
  return `以下のニュースについて、Web解説記事（1,500〜3,000字）を書いてください。\n\n` +
    `以下の構成を参考にしてください（すべて無理に埋める必要はありません。事実が無い項目は省略してください）。\n` +
    `1. 何が発表されたか\n2. 何が変わったか\n3. なぜ重要か\n4. 誰に関係するか\n5. 実務でどう使えるか\n` +
    `6. 他サービスとの比較\n7. 料金・制約\n8. メリット\n9. デメリット\n10. 結論\n11. Source\n\n` +
    `事実に存在しない情報（価格・仕様・引用・統計）を埋めるために創作しないでください。不明な点はUNKNOWNと明記してください。\n\n` +
    `【見出し】${item.headline}\n【概要】${item.dek}\n【本文】${(item.body || []).join("\n")}\n【なぜ重要か】${item.why || ""}\n【出典】${item.sourceLine || "(記載なし)"}\n\n` +
    `submit_web_explainerツールで提出してください。`;
}
