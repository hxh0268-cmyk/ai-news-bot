// MOCK_MODE用の共通ヘルパー。scripts/monetization/llm-client.mjsと
// scripts/generate-monetization-article.mjsの両方から使う。
//
// APIキーが無いローカル環境やCIでも、実際のClaude APIを呼ばずに
// 「schemaの形だけは正しいダミーレスポンス」を組み立てて返す。
// 各ツールごとに個別のダミーデータを用意すると、実際のtool schema
// （プロンプト側）が変わった際に食い違って気づけなくなるため、
// input_schema（JSON Schema）を実際に読み取って機械的に生成する方式にした。
export function buildMockResponse(schema) {
  if (!schema) return null;

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  switch (schema.type) {
    case "string":
      return "[MOCK]";
    case "integer":
    case "number": {
      const min = typeof schema.minimum === "number" ? schema.minimum : 0;
      const max = typeof schema.maximum === "number" ? schema.maximum : 100;
      return Math.round((min + max) / 2);
    }
    case "boolean":
      return false;
    case "array": {
      const itemSchema = schema.items || { type: "string" };
      const count = typeof schema.minItems === "number" ? Math.max(schema.minItems, 1) : 1;
      return Array.from({ length: count }, () => buildMockResponse(itemSchema));
    }
    case "object": {
      const properties = schema.properties || {};
      const keys = Array.isArray(schema.required) ? schema.required : Object.keys(properties);
      const obj = {};
      for (const key of keys) {
        obj[key] = buildMockResponse(properties[key]);
      }
      return obj;
    }
    default:
      return null;
  }
}
