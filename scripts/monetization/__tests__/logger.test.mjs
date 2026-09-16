import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger, readLogEvents, redactSecrets, LOG_EVENT_TYPES } from "../logger.mjs";

test("redactSecrets: key/token/secret/passwordを含むキーはREDACTEDになる", () => {
  const redacted = redactSecrets({
    apiKey: "sk-ant-super-secret",
    ANTHROPIC_API_KEY: "sk-ant-super-secret",
    token: "ghp_xxx",
    password: "hunter2",
    headline: "これは残る",
    nested: { secret: "abc", ok: "value" },
  });
  assert.equal(redacted.apiKey, "[REDACTED]");
  assert.equal(redacted.ANTHROPIC_API_KEY, "[REDACTED]");
  assert.equal(redacted.token, "[REDACTED]");
  assert.equal(redacted.password, "[REDACTED]");
  assert.equal(redacted.headline, "これは残る");
  assert.equal(redacted.nested.secret, "[REDACTED]");
  assert.equal(redacted.nested.ok, "value");
});

test("createLogger: JSONLとして1行1イベント追記され、読み戻せる", () => {
  const tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "monetization-log-test-")), "log.jsonl");
  const logger = createLogger(tmpFile);
  logger.log(LOG_EVENT_TYPES.NEWS_DISCOVERED, { headline: "テスト記事", apiKey: "should-be-redacted" });
  logger.log(LOG_EVENT_TYPES.DISTRIBUTION_DECISION, { headline: "テスト記事", decision: "WEB_AND_X" });

  const events = readLogEvents(tmpFile);
  assert.equal(events.length, 2);
  assert.equal(events[0].eventType, LOG_EVENT_TYPES.NEWS_DISCOVERED);
  assert.equal(events[0].apiKey, "[REDACTED]");
  assert.equal(events[1].decision, "WEB_AND_X");
  assert.ok(events[0].timestamp);

  fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
});
