// Section 23: Logging
// JSONL形式でイベントを1行1レコードとして追記する。secret/tokenの漏洩を
// 機械的に防ぐため、書き込み前に既知のキー名を再帰的にredactする。
import fs from "node:fs";
import path from "node:path";

export const LOG_EVENT_TYPES = Object.freeze({
  NEWS_DISCOVERED: "news_discovered",
  NEWS_DEDUPLICATED: "news_deduplicated",
  COMMERCIAL_SCORE_GENERATED: "commercial_score_generated",
  RELIABILITY_SCORE_GENERATED: "reliability_score_generated",
  DISTRIBUTION_DECISION: "distribution_decision",
  HUMAN_REVIEW_FLAGGED: "human_review_flagged",
  CONTENT_GENERATION: "content_generation",
  PUBLICATION_DECISION: "publication_decision",
  PUBLICATION_RESULT: "publication_result",
  ANALYTICS_EVENT: "analytics_event",
});

const SECRET_KEY_PATTERN = /(key|token|secret|password|authorization|api[_-]?key)/i;
const REDACTED = "[REDACTED]";

export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? REDACTED : redactSecrets(v);
    }
    return out;
  }
  return value;
}

export function createLogger(logFilePath) {
  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });

  function log(eventType, payload = {}) {
    const record = {
      timestamp: new Date().toISOString(),
      eventType,
      ...redactSecrets(payload),
    };
    fs.appendFileSync(logFilePath, JSON.stringify(record) + "\n", "utf-8");
    return record;
  }

  return { log };
}

/** テスト・検証用: JSONLファイルを読み戻す。 */
export function readLogEvents(logFilePath) {
  if (!fs.existsSync(logFilePath)) return [];
  return fs
    .readFileSync(logFilePath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
