// Section 30: score-reliability プロンプト。
// 最終スコアはLLMに計算させず、LLMには「事実の有無」だけを判定させ、
// スコアの加減算は自コード側で決定的に行う（Philosophy #6 Deterministic Behavior）。
export function buildReliabilityFactorsTool(sourceTypeHierarchy) {
  return {
    name: "submit_reliability_factors",
    description: "ニュース候補の情報源信頼性に関する事実要素を判定する。",
    input_schema: {
      type: "object",
      properties: {
        sourceType: { type: "string", enum: sourceTypeHierarchy },
        hasOfficialPrimarySource: { type: "boolean" },
        isMajorTrustedPublication: { type: "boolean" },
        hasMultipleIndependentSources: { type: "boolean" },
        hasConcreteEvidence: { type: "boolean", description: "具体的な数値・データ・引用等があるか" },
        isAnonymousOnlyClaim: { type: "boolean" },
        hasNoTraceableSource: { type: "boolean" },
        isHighRiskUnqualifiedClaim: {
          type: "boolean",
          description: "医療・法律・投資等の専門的判断を、資格ある情報源の裏付けなく断定しているか",
        },
        isSensationalOrUnverifiable: { type: "boolean" },
      },
      required: [
        "sourceType",
        "hasOfficialPrimarySource",
        "isMajorTrustedPublication",
        "hasMultipleIndependentSources",
        "hasConcreteEvidence",
        "isAnonymousOnlyClaim",
        "hasNoTraceableSource",
        "isHighRiskUnqualifiedClaim",
        "isSensationalOrUnverifiable",
      ],
    },
  };
}

export function buildReliabilityFactorsPrompt(item) {
  return `以下のAIニュース候補について、情報源の信頼性を判定するための事実要素を判定してください。` +
    `推測ではなく、記載されている出典情報から判断できる範囲で回答してください（不明な場合はfalse側に倒してください）。\n\n` +
    `【見出し】${item.headline}\n【出典】${item.sourceLine || "(記載なし)"}\n【本文】${(item.body || []).join("\n")}\n【なぜ重要か】${item.why || ""}\n\n` +
    `submit_reliability_factorsツールで判定結果を提出してください。`;
}
