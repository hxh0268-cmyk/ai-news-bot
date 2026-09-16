// Stage H: KPI Instrumentation（Section 19〜22）
// このPhaseでは実測値は無いため、収益系は原則nullで保持する（dummy revenueは生成しない）。

/**
 * Section 20: 記事単位の最低限のKPIフィールド。
 */
export function createArticleKpi(overrides = {}) {
  return {
    articleId: null,
    category: null,
    contentType: null,
    commercialScore: null,
    reliabilityScore: null,

    pageViews: null,
    uniqueVisitors: null,
    organicTraffic: null,
    socialTraffic: null,

    xImpressions: null,
    xEngagements: null,
    xClicks: null,

    outboundClicks: null,
    affiliateClicks: null,

    noteCandidate: false,

    publishedAt: null,

    // Section 21: Future Revenue Fields（schemaのみ、dummy値は入れない）
    affiliateRevenue: null,
    noteRevenue: null,
    productRevenue: null,
    subscriptionRevenue: null,
    b2bRevenue: null,
    totalRevenue: null,
    revenuePerArticle: null,
    revenuePer1000Views: null,

    ...overrides,
  };
}

/**
 * Section 22: ArticlePerformance。収益が無ければnull/unavailableとする。
 */
export function computeArticlePerformance(kpi) {
  const hasRevenue = typeof kpi.totalRevenue === "number";
  const hasViews = typeof kpi.pageViews === "number" && kpi.pageViews > 0;

  return {
    articleId: kpi.articleId,
    revenuePerArticle: hasRevenue ? kpi.totalRevenue : null,
    revenuePer1000Views: hasRevenue && hasViews ? (kpi.totalRevenue / kpi.pageViews) * 1000 : null,
    xCtr:
      typeof kpi.xImpressions === "number" && kpi.xImpressions > 0 && typeof kpi.xClicks === "number"
        ? kpi.xClicks / kpi.xImpressions
        : null,
    webConversionRate:
      typeof kpi.pageViews === "number" && kpi.pageViews > 0 && typeof kpi.outboundClicks === "number"
        ? kpi.outboundClicks / kpi.pageViews
        : null,
    status: hasRevenue ? "available" : "unavailable",
  };
}

/**
 * Section 22: TopicPerformance。複数記事のKPIを集計する。
 */
export function computeTopicPerformance(topicSlug, articleKpis) {
  const withRevenue = articleKpis.filter((k) => typeof k.totalRevenue === "number");
  const totalRevenue = withRevenue.length > 0 ? withRevenue.reduce((sum, k) => sum + k.totalRevenue, 0) : null;
  const totalViews = articleKpis.reduce((sum, k) => sum + (typeof k.pageViews === "number" ? k.pageViews : 0), 0);

  return {
    topicSlug,
    articleCount: articleKpis.length,
    totalRevenue,
    revenueEfficiency: totalRevenue !== null && totalViews > 0 ? totalRevenue / totalViews : null,
    status: totalRevenue !== null ? "available" : "unavailable",
  };
}
