/**
 * 时间-vs-效果 交叉分析引擎
 *
 * 核心逻辑:
 *   1. 从 Time Tracker 提取每个账号、每个模块的时间投入
 *   2. 从 Google Ads API 提取对应周期的效果变化
 *   3. 计算 "单位时间的效果产出"，排序找出高效和低效模块
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DIR = join(homedir(), 'time-tracker');
const DATA_DIR = join(DIR, 'data');

// ── Time data ─────────────────────────────────────────────────────────

function loadTrackerSessions(dateStr) {
  const f = join(DATA_DIR, `${dateStr}.json`);
  if (!existsSync(f)) return [];
  try { return JSON.parse(readFileSync(f, 'utf-8')); } catch { return []; }
}

/**
 * 获取指定账号在最近 N 天的时间投入
 */
export function getTimeInvestment(accountAliases, days = 7) {
  const modules = {};
  let totalMin = 0;
  const dailyMinutes = {};

  const aliases = Array.isArray(accountAliases) ? accountAliases.map(a => a.toLowerCase()) : [accountAliases.toLowerCase()];

  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const sessions = loadTrackerSessions(dateStr);

    for (const s of sessions) {
      if (!s.title) continue;
      const titleMatch = aliases.some(a => s.title.toLowerCase().includes(a));
      if (!titleMatch) continue;

      const min = (s.durationMs || 0) / 60000;
      totalMin += min;
      dailyMinutes[dateStr] = (dailyMinutes[dateStr] || 0) + min;

      // Extract module from title: "搜索字词 - vida.marketing.ai - Google Ads"
      const moduleMatch = s.title.match(/^(.+?)\s*[-–—]\s*(.+?)\s*[-–—]\s*Google/i);
      if (moduleMatch) {
        const mod = normalizeMod(moduleMatch[1].trim());
        modules[mod] = (modules[mod] || 0) + min;
      }
    }
  }

  return { totalMin: Math.round(totalMin), modules, dailyMinutes };
}

function normalizeMod(name) {
  const m = {
    'search terms': '搜索字词', 'campaigns': '广告系列', 'ad groups': '广告组',
    'ads': '广告', 'keywords': '关键字', 'audiences': '受众群体',
    'locations': '地理位置', 'devices': '设备', 'overview': '概览',
    'settings': '账号设置', 'conversions': '转化操作', 'reports': '报告编辑器',
    'asset groups': '素材资源组', 'extensions': '附加信息',
    'change history': '更改历史', 'recommendations': '优化建议',
  };
  const lower = name.toLowerCase().trim();
  return m[lower] || name;
}

// ── Cross-reference ───────────────────────────────────────────────────

/**
 * 关联时间投入和广告效果变化
 */
export function correlateTimeVsPerformance(timeData, adsTrend) {
  if (!timeData || !adsTrend) return null;

  const { totalMin, modules, dailyMinutes } = timeData;
  const trendDays = adsTrend.dailyTrend || [];

  // Calculate performance deltas
  let costDelta = 0, convDelta = 0;
  if (trendDays.length >= 2) {
    // Compare first half vs second half
    const mid = Math.floor(trendDays.length / 2);
    const first = trendDays.slice(0, mid);
    const second = trendDays.slice(mid);

    const avgCost1 = first.reduce((s, d) => s + d.cost, 0) / first.length || 0;
    const avgCost2 = second.reduce((s, d) => s + d.cost, 0) / second.length || 0;
    costDelta = avgCost1 > 0 ? (avgCost2 - avgCost1) / avgCost1 : 0;

    const avgConv1 = first.reduce((s, d) => s + d.conversions, 0) / first.length || 0;
    const avgConv2 = second.reduce((s, d) => s + d.conversions, 0) / second.length || 0;
    convDelta = avgConv1 > 0 ? (avgConv2 - avgConv1) / avgConv1 : 0;
  }

  // Module efficiency scores
  const moduleScores = Object.entries(modules)
    .filter(([, min]) => min >= 5) // Skip modules with <5 min
    .map(([mod, min]) => ({
      module: mod,
      minutes: Math.round(min),
      pctOfTime: Math.round(min / totalMin * 100),
    }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    totalTimeMin: totalMin,
    moduleScores,
    performanceDelta: {
      cost: Math.round(costDelta * 100) / 100,
      conversions: Math.round(convDelta * 100) / 100,
    },
    observation: null, // Will be filled by Claude
  };
}

/**
 * 生成时间效率分析的 prompt（给 Claude）
 */
export function buildCorrelationPrompt(clientName, timeData, adsSummary) {
  const correlation = correlateTimeVsPerformance(timeData, adsSummary);
  if (!correlation) return null;

  return `# 时间投入 vs 效果分析 — ${clientName}

## 时间投入（最近 7 天）
${correlation.moduleScores.map(m => `- ${m.module}: ${m.minutes}分钟 (${m.pctOfTime}%)`).join('\n')}

总时间: ${correlation.totalTimeMin}分钟

## 效果变化
- 花费变化: ${correlation.performanceDelta.cost > 0 ? '+' : ''}${(correlation.performanceDelta.cost * 100).toFixed(1)}%
- 转化变化: ${correlation.performanceDelta.conversions > 0 ? '+' : ''}${(correlation.performanceDelta.conversions * 100).toFixed(1)}%

## 请分析：
1. 哪个模块花时间最多但效果不明显？（低效率）
2. 哪个模块投入时间少但潜力大？（高杠杆）
3. 未来一周的时间分配建议
4. 一句话总结改进方向`;
}
