// Section 14: Web速報（事実確認+速報、300〜700字、mid tier）
export const WEB_BREAKING_TOOL = {
  name: "submit_web_breaking",
  description: "Web速報記事を提出する。",
  input_schema: {
    type: "object",
    properties: {
      body: { type: "string", description: "300〜700字の日本語本文" },
      primarySourceNote: { type: "string", description: "一次情報の出典表記" },
    },
    required: ["body", "primarySourceNote"],
  },
};

export function buildWebBreakingPrompt(item) {
  return `以下のニュースについて、Web速報記事（300〜700字）を書いてください。\n\n` +
    `構成: 何が起きた／何が発表された／重要ポイント／誰に関係する／一次情報、の順で簡潔にまとめてください。` +
    `過剰なSEO文章は入れないでください。事実として確認できない情報（価格・仕様・発言等）は創作しないでください。` +
    `分からない場合はUNKNOWNと明記して構いません。\n\n` +
    `【見出し】${item.headline}\n【概要】${item.dek}\n【本文】${(item.body || []).join("\n")}\n【出典】${item.sourceLine || "(記載なし)"}\n\n` +
    `submit_web_breakingツールで提出してください。`;
}
