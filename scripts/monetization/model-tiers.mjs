// config/model-tiers.json（Section 13.1）を読み込み、Tier名からモデルIDを引く。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "..", "config", "model-tiers.json");

let cached = null;
function loadConfig() {
  if (!cached) {
    cached = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  }
  return cached;
}

/**
 * Tier名（"lightest" | "mid" | "high"）から実際のモデルIDを返す。
 * 未知のTier名を渡した場合はfail-closedでエラーにする（無言でデフォルトに
 * フォールバックして意図しない高コストモデルを呼んでしまう事故を防ぐ）。
 */
export function getModelForTier(tierName) {
  const config = loadConfig();
  const tier = config.tiers[tierName];
  if (!tier) {
    throw new Error(`未知のmodel tier: "${tierName}"。config/model-tiers.jsonのtiersキーを確認してください。`);
  }
  return tier.model;
}
