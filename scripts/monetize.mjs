// STEP1.5: 本文へのアフィリエイトリンク自動挿入・PR表記の自動付与。
// 話題ごとの config/affiliate-links/<topic>.json / config/sponsor-today/<topic>.json を参照する。

import fs from "node:fs";
import path from "node:path";
import { loadTopic } from "./topic-context.mjs";

const { topic, affiliateConfig, sponsor, outputDir, dateStr } = loadTopic();

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withUtm(url, { source, medium, campaign, content }) {
  const u = new URL(url);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", campaign);
  if (content) u.searchParams.set("utm_content", content);
  return u.toString();
}

function insertAffiliateLinks(item, articleIndex) {
  const usedKeywords = new Set();
  let linkCount = 0;

  const linkedBody = (item.body || []).map((paragraph) => {
    let text = paragraph;
    for (const link of affiliateConfig.links) {
      if (usedKeywords.has(link.keyword)) continue;
      const re = new RegExp(escapeRegExp(link.keyword), "i");
      if (re.test(text)) {
        // どの記事・どのキーワード経由のクリックかを後から追跡できるよう、UTMパラメータを自動付与する
        const trackedUrl = withUtm(link.url, {
          source: topic.slug,
          medium: "affiliate",
          campaign: dateStr,
          content: `article${articleIndex}-${link.keyword}`,
        });
        text = text.replace(re, (match) => `<a href="${trackedUrl}" rel="sponsored noopener" target="_blank">${match}</a>`);
        usedKeywords.add(link.keyword);
        linkCount++;
      }
    }
    return text;
  });

  return { ...item, body: linkedBody, _affiliateKeywordsUsed: Array.from(usedKeywords), _affiliateLinkCount: linkCount };
}

function applySponsorDisclosure(item) {
  if (!sponsor) return item;
  const disclosure = `【PR】${sponsor.message || `本日の投稿は${sponsor.name}提供でお届けします`}`;
  return {
    ...item,
    captionX: `${disclosure}\n\n${item.captionX}`,
    captionThreads: `${disclosure}\n\n${item.captionThreads}`,
    captionInstagram: `${disclosure}\n\n${item.captionInstagram}`,
    _sponsored: true,
  };
}

function processItems(items) {
  return items.map((item, i) => applySponsorDisclosure(insertAffiliateLinks(item, i + 1)));
}

function buildReport(dataItems) {
  const lines = [];
  lines.push(`# 本日のマネタイズ処理レポート（${topic.displayName} / ${dateStr}）`);
  lines.push("");
  if (sponsor) {
    lines.push(`## ⚠️ 本日はタイアップ案件あり: ${sponsor.name}`);
    lines.push("全SNSキャプションの冒頭に【PR】表記を自動挿入しました。**正しい位置・文言になっているか必ず目視確認してください。**");
  } else {
    lines.push("## 本日はタイアップ案件なし（通常投稿）");
  }
  lines.push("");
  lines.push("## 挿入されたアフィリエイトリンク");
  let totalLinks = 0;
  dataItems.forEach((item, i) => {
    if (item._affiliateLinkCount > 0) {
      totalLinks += item._affiliateLinkCount;
      lines.push(`- 記事${i + 1}「${item.headline}」: ${item._affiliateKeywordsUsed.join("、")}`);
    }
  });
  if (totalLinks === 0) lines.push("- 該当するキーワードなし");
  lines.push("");
  lines.push(`合計リンク数: ${totalLinks}`);
  lines.push("");
  lines.push("## 確認事項（Human Check）");
  lines.push("- [ ] 挿入されたリンク先URLが正しいか");
  lines.push("- [ ] 文脈上不自然なリンクになっていないか");
  lines.push(sponsor ? "- [ ] PR表記が冒頭かつ分かりやすい位置にあるか" : "- [ ] （タイアップなしのため該当なし）");
  return lines.join("\n");
}

function main() {
  const dataPath = path.join(outputDir, "data.json");
  const top5Path = path.join(outputDir, "top5.json");

  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const top5Raw = JSON.parse(fs.readFileSync(top5Path, "utf-8"));

  const processedData = processItems(data);
  const processedTop5 = top5Raw.map((t) => processedData.find((d) => d.headline === t.headline) || t);

  fs.writeFileSync(dataPath, JSON.stringify(processedData, null, 2), "utf-8");
  fs.writeFileSync(top5Path, JSON.stringify(processedTop5, null, 2), "utf-8");
  fs.writeFileSync(path.join(outputDir, "monetization-report.md"), buildReport(processedData), "utf-8");

  console.log(`[${topic.slug}] マネタイズ処理が完了しました。`);
}

main();
