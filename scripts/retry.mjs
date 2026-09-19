// 外部API呼び出し共通のリトライユーティリティ。
// Gemini/Kling/ElevenLabsなど、一時的なエラーが起きうるAPI呼び出しに使う。

export async function withRetry(fn, { retries = 3, baseDelayMs = 2000, label = "API呼び出し" } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const startedAt = Date.now();
    try {
      return await fn();
    } catch (err) {
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      lastErr = err;
      const causeInfo = err.cause ? `（原因: ${err.cause.code || err.cause.name || err.cause.message || err.cause}）` : "";
      console.warn(`[retry] ${label} 失敗（${attempt}/${retries}回目、経過${elapsedSec}秒）: ${err.message}${causeInfo}`);
      if (attempt < retries) {
        const delay = baseDelayMs * attempt; // 2s, 4s, 6s... と徐々に間隔をあける
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  const finalCause = lastErr.cause ? `（原因: ${lastErr.cause.code || lastErr.cause.name || lastErr.cause.message || lastErr.cause}）` : "";
  throw new Error(`${label} が${retries}回のリトライ後も失敗しました: ${lastErr.message}${finalCause}`);
}
