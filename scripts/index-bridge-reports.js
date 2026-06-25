#!/usr/bin/env node
/**
 * Bridge Marketing 报告数据索引 + 分析
 *
 * 用法:
 *   node scripts/index-bridge-reports.js              → 扫描所有客户
 *   node scripts/index-bridge-reports.js --client Flova_AI  → 单客户详情
 *   node scripts/index-bridge-reports.js --csv Flova_AI       → 解析 placement CSV
 */
import { homedir } from 'os';
import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { scanAllReports, getClientReportSummary } from '../bridge-data/indexer.js';
import { parsePlacementCsv, analyzePlacements } from '../bridge-data/parser.js';
import { loadRegistry } from '../profiles/lib/profiler.js';

const DIR = join(homedir(), 'time-tracker');
const BRIDGE_DATA_DIR = join(DIR, 'data', 'bridge-reports');
mkdirSync(BRIDGE_DATA_DIR, { recursive: true });

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--csv')) {
    const idx = args.indexOf('--csv');
    const clientName = args[idx + 1];
    if (!clientName) { console.log('请指定客户名'); return; }
    showPlacementAnalysis(clientName);
    return;
  }

  if (args.includes('--client')) {
    const idx = args.indexOf('--client');
    const clientName = args[idx + 1];
    if (!clientName) { console.log('请指定客户名'); return; }
    showClientDetail(clientName);
    return;
  }

  // Full scan
  const index = scanAllReports();
  const clients = Object.entries(index);

  if (clients.length === 0) {
    console.log('📭 ~/bridge-marketing/reports/ 中未找到报告文件');
    return;
  }

  console.log(`# 📊 Bridge Marketing 报告索引\n`);
  console.log(`${clients.length} 个客户有报告文件\n`);
  console.log('| 客户 | 文件数 | 日报 | 周报 | 月报 | 时间范围 |');
  console.log('|------|--------|------|------|------|----------|');

  for (const [name, data] of clients.sort((a, b) => b[1].fileCount - a[1].fileCount)) {
    const range = data.dateRange ? `${data.dateRange.first} → ${data.dateRange.last}` : '-';
    console.log(`| ${name} | ${data.fileCount} | ${data.types.daily || 0} | ${data.types.weekly || 0} | ${data.types.monthly || 0} | ${range} |`);
  }

  console.log('');

  // Cross-reference with time tracker profiles
  const reg = loadRegistry();
  const profiledClients = Object.keys(reg);

  if (profiledClients.length > 0) {
    console.log('## 与 Time Tracker Profile 关联\n');

    // Map tracker aliases to bridge folders
    const { TRACKER_TO_BRIDGE, mapTrackerToBridge } = await import('../bridge-data/indexer.js');

    for (const [key, profile] of Object.entries(reg)) {
      const aliases = profile.aliases || [];
      const bridgeMatches = [];

      for (const alias of aliases) {
        const bridge = mapTrackerToBridge(alias);
        if (bridge && index[bridge]) bridgeMatches.push(bridge);
      }

      if (bridgeMatches.length > 0) {
        console.log(`  ✅ ${profile.name}: Bridge → ${bridgeMatches.join(', ')}`);
      } else {
        console.log(`  ⚠️ ${profile.name}: 未匹配到 Bridge 报告（别名: ${aliases.join(', ')}）`);
      }
    }
  }

  // Save index
  const indexPath = join(BRIDGE_DATA_DIR, 'report-index.json');
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\n💾 索引已保存: ${indexPath}`);
}

function showClientDetail(clientName) {
  const summary = getClientReportSummary(clientName);
  if (!summary) {
    console.log(`❌ 未找到客户 "${clientName}"`);
    return;
  }

  console.log(`# ${summary.clientKey} — 报告详情\n`);
  console.log(`文件数: ${summary.fileCount}`);
  console.log(`时间范围: ${summary.dateRange?.first} → ${summary.dateRange?.last}\n`);

  // Group by type
  const byType = {};
  for (const f of summary.files) {
    if (!byType[f.type]) byType[f.type] = [];
    byType[f.type].push(f);
  }

  for (const [type, files] of Object.entries(byType)) {
    console.log(`## ${type} (${files.length} 个文件)`);
    const sorted = files.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    for (const f of sorted.slice(0, 15)) {
      console.log(`  ${f.date}  ${f.relativePath}  (${(f.size / 1024).toFixed(0)}KB)`);
    }
    if (files.length > 15) console.log(`  ... 还有 ${files.length - 15} 个文件`);
    console.log('');
  }
}

function showPlacementAnalysis(clientName) {
  const summary = getClientReportSummary(clientName);
  if (!summary) {
    console.log(`❌ 未找到客户 "${clientName}"`);
    return;
  }

  // Find CSV files
  const csvFiles = summary.files.filter(f => f.ext === '.csv');
  if (csvFiles.length === 0) {
    console.log('📭 该客户没有 CSV 报告');
    return;
  }

  const allPlacements = [];
  for (const csv of csvFiles) {
    const placements = parsePlacementCsv(csv.path);
    allPlacements.push(...placements);
  }

  const analysis = analyzePlacements(allPlacements);
  if (!analysis) {
    console.log('📭 CSV 数据为空');
    return;
  }

  console.log(`# ${summary.clientKey} — Placement 排除分析\n`);
  console.log(`总排除数: ${analysis.totalPlacements}`);
  console.log(`浪费展示: ${analysis.totalWastedImpressions.toLocaleString()}\n`);

  console.log('## 按 Campaign');
  console.log('| Campaign | 浪费展示 | 排除数 |');
  console.log('|----------|----------|--------|');
  for (const [name, data] of analysis.byCampaign) {
    console.log(`| ${name} | ${data.impressions.toLocaleString()} | ${data.count} |`);
  }

  console.log('\n## 浪费最多的 Placement');
  console.log('| Placement | Campaign | 展示 | 原因 |');
  console.log('|-----------|----------|------|------|');
  for (const p of analysis.topWasted.slice(0, 10)) {
    const name = p.placement.length > 40 ? p.placement.slice(0, 37) + '...' : p.placement;
    console.log(`| ${name} | ${p.campaign} | ${p.impressions.toLocaleString()} | ${p.reason} |`);
  }

  console.log('\n## 按原因分类');
  for (const [reason, data] of analysis.byReason) {
    console.log(`- ${reason}: ${data.impressions.toLocaleString()} 展示 (${data.count} 条)`);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
