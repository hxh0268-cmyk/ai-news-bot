// STEP1後半（文章の書き直し）の安全網。
// 書き直しは文体だけを変える工程だが、AIが言い換えの途中で下書きにない数値を
// 足してしまうことがある。書き直し後の文章に、下書きのその記事のどこにも出てこない
// 数値が現れたら、その項目（body・why・キャプション）だけを下書きに戻す。
// あわせて、書き直しで変更しない約束の項目（見出し・stats・出典など）は常に下書きの値を使う。

// 書き直しの対象になっている項目
export const REWRITTEN_FIELDS = ["body", "why", "captionX", "captionThreads", "captionInstagram"];

// 書き直しで変更しない項目（generate.mjs の書き直し指示と同じ一覧）
export const PROTECTED_FIELDS = [
  "headline",
  "dek",
  "importance",
  "category",
  "catColor",
  "stats",
  "chips",
  "sourceLine",
  "sources",
  "videoId",
  "lifeRelevanceTag",
];

// 全角数字・全角記号を半角にし、3桁区切りのカンマを外してから、数値を「数値＋単位」の形で取り出す。
// 「1,600件」と「1600件」、「15％」と「15%」、「09月」と「9月」は同じものとして扱う。
// 単位まで含めて比べるのは、記事内のどこかに「3」があるだけで「3万人」を見逃さないようにするため。
const NUMBER_TOKEN_RE = /(\d+(?:\.\d+)?)([万億兆千]{0,2})(ドル|ユーロ|[%人件社台円倍年月日時分秒個本回割位歳週点])?/g;

export function extractNumbers(text) {
  const normalized = String(text ?? "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/．/g, ".")
    .replace(/％/g, "%")
    .replace(/(\d)[,，](?=\d{3}(?!\d))/g, "$1");
  const tokens = new Set();
  for (const m of normalized.matchAll(NUMBER_TOKEN_RE)) {
    tokens.add(String(Number(m[1])) + m[2] + (m[3] || ""));
  }
  return tokens;
}

// 書き直し後の数値が下書きにあるか。書き直しで単位だけ省いた場合（下書き「3万人」→「3万」）は許容する。
function isKnownNumber(token, draftTokens) {
  if (draftTokens.has(token)) return true;
  for (const d of draftTokens) if (d.startsWith(token)) return true;
  return false;
}

function textOf(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join(" ");
  if (typeof value === "object") return Object.values(value).map(textOf).join(" ");
  return String(value);
}

// 下書きと書き直し後を突き合わせ、安全な結果と、下書きに戻した項目の一覧を返す。
// 件数や並び順が変わっていた場合は、書き直し全体を使わず下書きのままにする。
export function guardRewrite(draftItems, rewrittenItems) {
  const sameShape =
    Array.isArray(rewrittenItems) &&
    rewrittenItems.length === draftItems.length &&
    rewrittenItems.every((it, i) => it && it.headline === draftItems[i].headline);
  if (!sameShape) {
    return { items: draftItems, reverted: [], fallbackAll: true };
  }

  const reverted = [];
  const items = draftItems.map((draft, i) => {
    const out = { ...rewrittenItems[i] };
    for (const key of PROTECTED_FIELDS) {
      if (key in draft) out[key] = draft[key];
      else delete out[key];
    }
    const allowed = extractNumbers(textOf(draft));
    for (const key of REWRITTEN_FIELDS) {
      if (!(key in draft)) continue;
      const added = [...extractNumbers(textOf(out[key]))].filter((n) => !isKnownNumber(n, allowed));
      if (added.length > 0) {
        out[key] = draft[key];
        reverted.push({ index: i, headline: draft.headline, field: key, added });
      }
    }
    return out;
  });
  return { items, reverted, fallbackAll: false };
}
