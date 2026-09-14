// Section 17/18: X投稿（見出し+URLのコピーではなく独立した価値を持たせる、mid tier）
export const X_POST_TOOL = {
  name: "submit_x_post",
  description: "X投稿本文を提出する。",
  input_schema: {
    type: "object",
    properties: {
      body: { type: "string", description: "120字以内の日本語投稿本文" },
      style: { type: "string", enum: ["BREAKING", "EXPLAINER", "HOW_TO", "COMPARISON", "INSIGHT"] },
    },
    required: ["body", "style"],
  },
};

export function buildXPostPrompt(item) {
  return `以下のニュースについて、X（旧Twitter）投稿を作成してください（120字以内）。\n\n` +
    `見出しとURLをそのまま貼るのではなく、投稿単体で価値が伝わる独立した文章にしてください。` +
    `過剰な煽り・根拠のない断定・clickbait・fake urgency・fake scarcity・未確認情報・投資推奨・医療/法律判断は避けてください。\n\n` +
    `【見出し】${item.headline}\n【概要】${item.dek}\n\n` +
    `submit_x_postツールで、本文とスタイル区分（BREAKING/EXPLAINER/HOW_TO/COMPARISON/INSIGHT）を提出してください。`;
}
