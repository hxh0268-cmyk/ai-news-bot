// Stage E (前半): Duplicate Detection（Section 12）
//
// 実装方針（over-engineering回避のための意図的な簡略化）:
// 現行のNEWS_ITEM_SCHEMAには記事URLフィールドが存在しないため、
// 「canonical URL」判定はsourceLineに含まれるURLらしき文字列があれば
// それを使う best-effort とし、必須の一次判定にはしていない。
// 「semantic similarity」は、埋め込みモデル等の追加依存を避けるため、
// 文字bigramのJaccard類似度による軽量な近似で代替する（日本語は分かち書き
// が無いため単語トークナイザより頑健で、追加ライブラリも不要）。
// 「same-event detection」は、見出し+dekの類似度が閾値を超えた場合を
// 同一イベントとみなす、という上記semantic similarityの応用として扱う
// （専用の固有表現抽出等は今回のスコープでは行わない）。

const URL_RE = /https?:\/\/[^\s、。（）()【】「」]+/;

export function extractCanonicalUrl(item) {
  const match = (item.sourceLine || "").match(URL_RE);
  return match ? match[0].replace(/[.,)]+$/, "") : null;
}

export function normalizeTitle(title) {
  return (title || "")
    .toLowerCase()
    .replace(/[\s　、。！？!?「」『』（）()【】・\-—:：]/g, "")
    .trim();
}

function bigrams(text) {
  const chars = Array.from(text);
  const set = new Set();
  for (let i = 0; i < chars.length - 1; i++) {
    set.add(chars[i] + chars[i + 1]);
  }
  if (set.size === 0 && chars.length > 0) set.add(chars[0]);
  return set;
}

/**
 * 文字bigramのJaccard類似度（0〜1）。semantic similarityの軽量近似。
 */
export function textSimilarity(a, b) {
  const setA = bigrams(normalizeTitle(a));
  const setB = bigrams(normalizeTitle(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const g of setA) {
    if (setB.has(g)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const SAME_EVENT_THRESHOLD = 0.6;

/**
 * candidateが、既に採用済み(accepted)のitem群のいずれかと重複するかを判定する。
 * @param {object} candidate
 * @param {object[]} acceptedItems - 直近で既に重複なしと判定済みのitem群
 * @returns {{isDuplicate:boolean, reason:string|null, matchedWith:object|null, similarity:number}}
 */
export function findDuplicate(candidate, acceptedItems) {
  const candidateUrl = extractCanonicalUrl(candidate);
  const candidateNorm = normalizeTitle(candidate.headline);

  for (const existing of acceptedItems) {
    // 1. canonical URL一致（best-effort。両方にURLがある場合のみ判定材料にする）
    const existingUrl = extractCanonicalUrl(existing);
    if (candidateUrl && existingUrl && candidateUrl === existingUrl) {
      return { isDuplicate: true, reason: "SAME_CANONICAL_URL", matchedWith: existing, similarity: 1 };
    }

    // 2. 正規化タイトル完全一致
    if (candidateNorm && candidateNorm === normalizeTitle(existing.headline)) {
      return { isDuplicate: true, reason: "SAME_NORMALIZED_TITLE", matchedWith: existing, similarity: 1 };
    }

    // 3. semantic similarity / same-event（見出し+dekの類似度）
    const candidateText = `${candidate.headline} ${candidate.dek || ""}`;
    const existingText = `${existing.headline} ${existing.dek || ""}`;
    const similarity = textSimilarity(candidateText, existingText);
    if (similarity >= SAME_EVENT_THRESHOLD) {
      return { isDuplicate: true, reason: "SAME_EVENT_SIMILARITY", matchedWith: existing, similarity };
    }
  }

  return { isDuplicate: false, reason: null, matchedWith: null, similarity: 0 };
}

/**
 * 候補配列全体を重複排除する。重複と判定された候補は、既存の情報源情報を
 * corroboration（裏付け情報源）として採用済み記事側に追記し、破棄はするが
 * 情報自体は失わないようにする（Section 12: 「source corroborationとして
 * 利用してください」）。
 */
export function deduplicateItems(items) {
  const accepted = [];
  const rejected = [];

  for (const item of items) {
    const result = findDuplicate(item, accepted);
    if (result.isDuplicate) {
      const target = result.matchedWith;
      target._corroboratingSources = target._corroboratingSources || [];
      if (item.sourceLine) target._corroboratingSources.push(item.sourceLine);
      rejected.push({ item, ...result });
    } else {
      accepted.push(item);
    }
  }

  return { accepted, rejected };
}
