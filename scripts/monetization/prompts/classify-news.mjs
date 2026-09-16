// Section 30: classify-news プロンプト。カテゴリ・contentType・高リスク判定を行う。
export function buildClassifyNewsTool(taxonomy) {
  const categorySlugs = taxonomy.categories.map((c) => c.slug);
  return {
    name: "submit_classification",
    description: "ニュース候補のカテゴリ・コンテンツ種別・リスク区分を分類する。",
    input_schema: {
      type: "object",
      properties: {
        primaryCategory: { type: "string", enum: categorySlugs },
        secondaryCategories: { type: "array", items: { type: "string", enum: categorySlugs } },
        contentType: { type: "string", enum: taxonomy.contentTypes },
        isHighRiskCategory: {
          type: "boolean",
          description:
            "医療・法律・投資・サイバーセキュリティ被害・個人の安全・規制のいずれかに該当する場合はtrue",
        },
        highRiskCategoryLabel: {
          type: "string",
          enum: [...taxonomy.highRiskCategories, "none"],
          description: "isHighRiskCategoryがtrueの場合、該当するラベル。falseならnone",
        },
        evergreenPotential: { type: "string", enum: taxonomy.evergreenPotentialLevels },
      },
      required: ["primaryCategory", "secondaryCategories", "contentType", "isHighRiskCategory", "highRiskCategoryLabel", "evergreenPotential"],
    },
  };
}

export function buildClassifyNewsPrompt(item, taxonomy) {
  const categoryList = taxonomy.categories.map((c) => `${c.slug}(${c.label})`).join(", ");
  return `以下のAIニュース候補を分類してください。\n\n` +
    `【カテゴリ候補】${categoryList}\n\n` +
    `【見出し】${item.headline}\n【カテゴリ(元)】${item.category}\n【概要】${item.dek}\n【本文】${(item.body || []).join("\n")}\n\n` +
    `submit_classificationツールで分類結果を提出してください。医療・法律・投資・サイバーセキュリティ被害・` +
    `個人の安全・規制に関する内容は、影響の大小に関わらずisHighRiskCategory=trueとしてください（迷ったらtrue側に倒す）。`;
}
