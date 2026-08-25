// 外部API呼び出し共通のリトライユーティリティ。
// Gemini/Kling/ElevenLabsなど、一時的なエラーが起きうるAPI呼び出しに使う。

export async function withRetry(fn, { retries = 3, baseDelayMs = 2000, label = "API呼び出し" } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.warn(`[retry] ${label} 失敗（${attempt}/${retries}回目）: ${err.message}`);
      if (attempt < retries) {
        const delay = baseDelayMs * attempt; // 2s, 4s, 6s... と徐々に間隔をあける
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw new Error(`${label} が${retries}回のリトライ後も失敗しました: ${lastErr.message}`);
}
