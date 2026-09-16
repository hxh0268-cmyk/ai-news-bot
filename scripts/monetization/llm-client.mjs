// 最小限のprovider abstraction。
//
// 調査の結果、既存コード（scripts/generate.mjs 等）にはAI providerの抽象化層が
// 存在せず、Anthropic APIをその都度raw fetch()で直接呼んでいた。Section 13.1で
// 要求されているModel Tier戦略を成立させるには「呼び出し先モデルを差し替え
// 可能にする」最小限の関数が必要なため、既存のcallClaude()と同じHTTPインター
// フェース・リトライ方針（scripts/retry.mjsのwithRetryをそのまま利用）を踏襲した
// 薄いラッパーをここに新設する。既存のgenerate.mjs等は変更しない。
import { withRetry } from "../retry.mjs";
import { buildMockResponse } from "../mock-response.mjs";

const API_KEY = process.env.ANTHROPIC_API_KEY;
// MOCK_MODE=true の間は実際のAnthropic API呼び出しを一切行わず、
// tool.input_schemaの形だけを満たすダミーレスポンスを返す（APIキー不要）。
const MOCK_MODE = process.env.MOCK_MODE === "true";

/**
 * 構造化出力（tool-use）を強制してClaude APIを呼び出す。
 * @param {object} opts
 * @param {string} opts.model - config/model-tiers.jsonで解決したモデルID
 * @param {string} opts.system - システムプロンプト
 * @param {string} opts.userPrompt - ユーザープロンプト
 * @param {object} opts.tool - Anthropic tool定義（name, description, input_schema）
 * @param {string} [opts.label] - リトライログ用ラベル
 * @param {number} [opts.maxTokens]
 */
export async function callStructured({ model, system, userPrompt, tool, label = "monetization-engine呼び出し", maxTokens = 4000 }) {
  if (MOCK_MODE) {
    return buildMockResponse(tool.input_schema);
  }

  if (!API_KEY) {
    throw new Error("ANTHROPIC_API_KEYが設定されていません。");
  }

  return withRetry(
    async () => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: userPrompt }],
          tools: [tool],
          tool_choice: { type: "tool", name: tool.name },
        }),
        // 軽量Tierでの分類・スコアリング呼び出しが多数走ることを想定し、
        // STEP1本体(8分)より短いタイムアウトで早期に失敗を検知する。
        signal: AbortSignal.timeout(120000),
      });

      if (!res.ok) {
        throw new Error(`Claude APIエラー(${label}): ${res.status} ${await res.text()}`);
      }

      const data = await res.json();
      const block = data.content.find((b) => b.type === "tool_use" && b.name === tool.name);
      if (!block?.input) {
        throw new Error(`${label}: tool_useブロックが取得できませんでした: ${JSON.stringify(data).slice(0, 500)}`);
      }
      return block.input;
    },
    { retries: 2, baseDelayMs: 5000, label }
  );
}
