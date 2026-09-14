import { test } from "node:test";
import assert from "node:assert/strict";
import { createArticleKpi, computeArticlePerformance, computeTopicPerformance } from "../kpi-schema.mjs";

test("createArticleKpi: 収益系フィールドはdummy値を持たずnullで初期化される", () => {
  const kpi = createArticleKpi({ articleId: "a1" });
  assert.equal(kpi.affiliateRevenue, null);
  assert.equal(kpi.totalRevenue, null);
  assert.equal(kpi.revenuePerArticle, null);
});

test("computeArticlePerformance: 収益データが無ければunavailable", () => {
  const kpi = createArticleKpi({ articleId: "a1", pageViews: 1000 });
  const perf = computeArticlePerformance(kpi);
  assert.equal(perf.status, "unavailable");
  assert.equal(perf.revenuePerArticle, null);
});

test("computeArticlePerformance: 収益データがあればrevenuePer1000Viewsを計算する", () => {
  const kpi = createArticleKpi({ articleId: "a1", pageViews: 2000, totalRevenue: 400 });
  const perf = computeArticlePerformance(kpi);
  assert.equal(perf.status, "available");
  assert.equal(perf.revenuePer1000Views, 200);
});

test("computeTopicPerformance: 記事が無ければ0件・unavailable", () => {
  const perf = computeTopicPerformance("ai-news", []);
  assert.equal(perf.articleCount, 0);
  assert.equal(perf.status, "unavailable");
});
