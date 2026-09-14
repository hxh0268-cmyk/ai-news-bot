// Section 30: score-commercial-value プロンプト（責務を分割した個別ファイル）
export function buildCommercialScoringTool(weights) {
  const dims = Object.keys(weights);
  const properties = {};
  for (const dim of dims) {
    properties[dim] = {
      type: "integer",
      minimum: 0,
      maximum: weights[dim],
      description: `0〜${weights[dim]}の整数。`,
    };
  }
  return {
    name: "submit_commercial_score",
    description: "ニュース候補のCommercial News Scoreを内訳付きで提出する。",
    input_schema: {
      type: "object",
      properties: {
        breakdown: { type: "object", properties, required: dims },
        reasoningSummary: {
          type: "array",
          items: { type: "string" },
          maxItems: 3,
          description: "簡潔な根拠（各項目1文程度、長大なchain-of-thoughtは不可）",
        },
      },
      required: ["breakdown", "reasoningSummary"],
    },
  };
}

export function buildCommercialScoringPrompt(item, weights) {
  const dimLines = Object.entries(weights)
    .map(([key, max]) => `- ${key}: 0〜${max}点`)
    .join("\n");
  return `以下のAIニュース候補を、実用性・拡散性・鮮度・検索需要・独自性・note深掘り可能性・` +
    `アフィリエイト親和性・商品化可能性・B2B価値・将来戦略価値の観点で採点してください。\n\n` +
    `各項目の満点は以下の通りです（合計100点）。\n${dimLines}\n\n` +
    `【見出し】${item.headline}\n【カテゴリ】${item.category}\n【概要】${item.dek}\n【本文】${(item.body || []).join("\n")}\n\n` +
    `submit_commercial_scoreツールで、各項目の点数（breakdown）と、簡潔な根拠（reasoningSummary、最大3件、各1文程度）を提出してください。` +
    `長い思考過程は保存しないでください。`;
}
