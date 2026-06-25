#!/usr/bin/env node
/**
 * Google Ads 账号诊断 — 拉取数据 + 打印报告
 *
 * 用法:
 *   node google-ads/diagnose.js <客户ID>           → 最近 7 天
 *   node google-ads/diagnose.js <客户ID> --days 30 → 最近 30 天
 *   node google-ads/diagnose.js vida-ai            → 使用 clients.json 别名
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fetchSummary } from './fetcher.js';

const DIR = join(homedir(), 'time-tracker');
const CLIENTS_PATH = join(DIR, 'google-ads', 'config', 'clients.json');
const DATA_DIR = join(DIR, 'data', 'ads-data');

function fmtCurrency(amount) { return `$${amount.toFixed(2)}`; }
function fmtPct(val) { return (val * 100).toFixed(2) + '%'; }
function fmtNum(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }

function resolveCustomerId(input) {
  if (/^\d{3}[-\s]?\d{3}[-\s]?\d{4}$/.test(input)) return input;

  if (existsSync(CLIENTS_PATH)) {
    const clients = JSON.parse(readFileSync(CLIENTS_PATH, 'utf-8'));
    for (const [key, c] of Object.entries(clients)) {
      if (key === input || c.name === input || (c.aliases || []).includes(input)) {
        return c.customerId;
      }
    }
  }
  throw new Error(`未找到客户 "${input}"。请在 google-ads/config/clients.json 中添加，或直接使用 10 位 Customer ID`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log('用法: node google-ads/diagnose.js <客户ID|别名> [--days 7]');
    process.exit(0);
  }

  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) || 7 : 7;
  const customerInput = daysIdx >= 0 ? args[0] : args[0];
  const customerId = resolveCustomerId(customerInput);

  console.log(`🔍 正在拉取 ${customerId} 的广告数据（最近 ${days} 天）...`);
  const data = await fetchSummary(customerId, days);
  const { overview, campaigns, topKeywords, deadKeywords, overBudget, dailyTrend } = data;

  // ── Print report ──
  console.log(`\n# 📊 Google Ads 诊断报告`);
  console.log(`> ${data.period.start} → ${data.period.end}  |  ${campaigns.length} 个 Campaign\n`);

  console.log('## 概览');
  console.log(`| 指标 | 数值 |`);
  console.log(`|------|------|`);
  console.log(`| 花费 | ${fmtCurrency(overview.totalCost)} |`);
  console.log(`| 展示 | ${fmtNum(overview.totalImpressions)} |`);
  console.log(`| 点击 | ${fmtNum(overview.totalClicks)} |`);
  console.log(`| 转化 | ${Math.round(overview.totalConversions)} |`);
  console.log(`| CTR | ${fmtPct(overview.avgCtr)} |`);
  console.log(`| CPA | ${fmtCurrency(overview.avgCpa)} |\n`);

  // Campaigns table
  console.log('## Campaign 详情');
  console.log('| Campaign | 花费 | 转化 | CPA | CTR | 预算使用 |');
  console.log('|----------|------|------|-----|-----|----------|');
  for (const c of campaigns) {
    const budgetPct = c.dailyBudget > 0 ? Math.round(c.cost / (c.dailyBudget * days) * 100) + '%' : '-';
    console.log(`| ${c.campaignName} | ${fmtCurrency(c.cost)} | ${c.conversions} | ${fmtCurrency(c.cpa)} | ${fmtPct(c.ctr)} | ${budgetPct} |`);
  }

  // Top keywords
  if (topKeywords.length > 0) {
    console.log('\n## 转化最好关键词');
    console.log('| 关键词 | Campaign | 转化 | CPA |');
    console.log('|--------|----------|------|-----|');
    for (const k of topKeywords.slice(0, 10)) {
      console.log(`| ${k.keyword} | ${k.campaignName} | ${k.conversions} | ${fmtCurrency(k.cpa)} |`);
    }
  }

  // Dead keywords (花钱但没转化)
  if (deadKeywords.length > 0) {
    console.log('\n## ⚠️ 花费但零转化的关键词');
    console.log('| 关键词 | Campaign | 花费 | 点击 |');
    console.log('|--------|----------|------|------|');
    for (const k of deadKeywords.slice(0, 10)) {
      console.log(`| ${k.keyword} | ${k.campaignName} | ${fmtCurrency(k.cost)} | ${k.clicks} |`);
    }
  }

  // Over-budget
  if (overBudget.length > 0) {
    console.log('\n## 🔴 预算即将用完');
    for (const c of overBudget) {
      console.log(`- **${c.campaignName}**: 花费 ${fmtCurrency(c.cost)} / 日预算 ${fmtCurrency(c.dailyBudget)}`);
    }
  }

  // Daily trend
  if (dailyTrend.length > 1) {
    console.log('\n## 每日趋势');
    console.log('| 日期 | 花费 | 转化 | CTR |');
    console.log('|------|------|------|-----|');
    for (const d of dailyTrend) {
      const dayCtr = d.impressions > 0 ? d.clicks / d.impressions : 0;
      console.log(`| ${d.date} | ${fmtCurrency(d.cost)} | ${d.conversions} | ${fmtPct(dayCtr)} |`);
    }
  }

  // ── Save raw data ──
  const clientName = customerInput.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const saveDir = join(DATA_DIR, clientName);
  mkdirSync(saveDir, { recursive: true });
  const savePath = join(saveDir, `snapshot-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(savePath, JSON.stringify(data, null, 2));
  console.log(`\n💾 原始数据已保存: ${savePath}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
