/**
 * Google Ads 数据拉取 — campaign / keyword / ad group 级别
 */
import { GoogleAdsApi } from 'google-ads-api';
import { loadConfig, getAccessToken } from './auth.js';

// ── Query helpers ────────────────────────────────────────────────────

function dateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '');
  return { start: fmt(start), end: fmt(end) };
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

// ── Client init ──────────────────────────────────────────────────────

export async function getClient(customerId) {
  const config = loadConfig();
  const accessToken = await getAccessToken();

  const api = new GoogleAdsApi({
    client_id: config.client_id,
    client_secret: config.client_secret,
    developer_token: config.developer_token,
  });

  return api.Customer({
    customer_id: customerId.replace(/-/g, ''),
    refresh_token: config.refresh_token,
    login_customer_id: config.login_customer_id || undefined,
  });
}

// ── Fetchers ─────────────────────────────────────────────────────────

/**
 * Campaign 级数据：cost, clicks, impressions, conversions, CTR, CPA
 */
export async function fetchCampaignPerformance(customerId, days = 7) {
  const client = await getClient(customerId);
  const range = dateRange(days);

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion,
      campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date BETWEEN '${range.start}' AND '${range.end}'
    ORDER BY metrics.cost_micros DESC
  `;

  const rows = await client.query(query);
  return rows.map(r => ({
    campaignId: r.campaign?.id,
    campaignName: r.campaign?.name,
    status: r.campaign?.status,
    channelType: r.campaign?.advertising_channel_type,
    cost: (r.metrics?.cost_micros || 0) / 1_000_000,
    impressions: r.metrics?.impressions || 0,
    clicks: r.metrics?.clicks || 0,
    conversions: r.metrics?.conversions || 0,
    conversionValue: r.metrics?.conversions_value || 0,
    ctr: r.metrics?.ctr || 0,
    avgCpc: (r.metrics?.average_cpc || 0) / 1_000_000,
    cpa: (r.metrics?.cost_per_conversion || 0) / 1_000_000,
    dailyBudget: (r.campaign_budget?.amount_micros || 0) / 1_000_000,
  }));
}

/**
 * 搜索关键词级数据
 */
export async function fetchKeywordPerformance(customerId, days = 7) {
  const client = await getClient(customerId);
  const range = dateRange(days);

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      ad_group_criterion.keyword.text,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.ctr,
      metrics.cost_per_conversion
    FROM keyword_view
    WHERE campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND segments.date BETWEEN '${range.start}' AND '${range.end}'
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
  `;

  const rows = await client.query(query);
  return rows.map(r => ({
    campaignName: r.campaign?.name,
    keyword: r.ad_group_criterion?.keyword?.text,
    cost: (r.metrics?.cost_micros || 0) / 1_000_000,
    impressions: r.metrics?.impressions || 0,
    clicks: r.metrics?.clicks || 0,
    conversions: r.metrics?.conversions || 0,
    ctr: r.metrics?.ctr || 0,
    cpa: (r.metrics?.cost_per_conversion || 0) / 1_000_000,
  }));
}

/**
 * 每日趋势（最近 N 天的每天汇总）
 */
export async function fetchDailyTrend(customerId, days = 30) {
  const client = await getClient(customerId);
  const range = dateRange(days);

  const query = `
    SELECT
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.cost_per_conversion
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date BETWEEN '${range.start}' AND '${range.end}'
    ORDER BY segments.date
  `;

  const rows = await client.query(query);

  // Aggregate per day
  const daily = {};
  for (const r of rows) {
    const date = `${r.segments?.date?.slice(0, 4)}-${r.segments?.date?.slice(4, 6)}-${r.segments?.date?.slice(6, 8)}`;
    if (!daily[date]) daily[date] = { cost: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 };
    daily[date].cost += (r.metrics?.cost_micros || 0) / 1_000_000;
    daily[date].impressions += r.metrics?.impressions || 0;
    daily[date].clicks += r.metrics?.clicks || 0;
    daily[date].conversions += r.metrics?.conversions || 0;
    daily[date].value += r.metrics?.conversions_value || 0;
  }

  return Object.entries(daily)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => ({ date, ...d }));
}

/**
 * 汇总 — 单次调用获取全部关键指标
 */
export async function fetchSummary(customerId, days = 7) {
  const [campaigns, keywords, trend] = await Promise.all([
    fetchCampaignPerformance(customerId, days),
    fetchKeywordPerformance(customerId, days),
    fetchDailyTrend(customerId, Math.max(days, 7)),
  ]);

  const totalCost = campaigns.reduce((s, c) => s + c.cost, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const avgCpa = totalConversions > 0 ? totalCost / totalConversions : 0;
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

  // Over-budget campaigns
  const overBudget = campaigns.filter(c => c.dailyBudget > 0 && c.cost > c.dailyBudget * days * 0.95);

  // High-cost zero-conversion keywords
  const deadKeywords = keywords.filter(k => k.cost > 0 && k.conversions === 0).sort((a, b) => b.cost - a.cost).slice(0, 10);

  return {
    period: { start: ymd(new Date(Date.now() - days * 86400000)), end: ymd(new Date()) },
    overview: {
      totalCost: Math.round(totalCost * 100) / 100,
      totalConversions: Math.round(totalConversions * 10) / 10,
      totalClicks,
      totalImpressions,
      avgCpa: Math.round(avgCpa * 100) / 100,
      avgCtr: Math.round(avgCtr * 10000) / 10000,
    },
    campaigns,
    topKeywords: keywords.filter(k => k.conversions > 0).sort((a, b) => b.conversions - a.conversions).slice(0, 10),
    deadKeywords,
    overBudget,
    dailyTrend: trend,
  };
}
