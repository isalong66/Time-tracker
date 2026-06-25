#!/usr/bin/env node
/**
 * 时间效率交叉分析
 *
 * 用法:
 *   node scripts/correlate.js --client vida-ai --days 7
 *   node scripts/correlate.js --days 7           → 分析所有客户
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getTimeInvestment, buildCorrelationPrompt } from '../dash/lib/cross-ref.js';
import { loadRegistry } from '../profiles/lib/profiler.js';

const DIR = join(homedir(), 'time-tracker');
const DATA_DIR = join(DIR, 'data', 'ads-data');
const CORREL_DIR = join(DIR, 'data', 'correlations');
mkdirSync(CORREL_DIR, { recursive: true });

async function main() {
  const args = process.argv.slice(2);
  const clientIdx = args.indexOf('--client');
  const clientKey = clientIdx >= 0 ? args[clientIdx + 1] : null;
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) || 7 : 7;

  // Determine which clients to analyze
  let clients = [];
  if (clientKey) {
    const reg = loadRegistry();
    if (reg[clientKey]) {
      clients = [[clientKey, reg[clientKey]]];
    } else {
      console.log(`❌ 未找到客户 "${clientKey}"，运行 node scripts/dashboard.js 查看列表`);
      process.exit(1);
    }
  } else {
    const reg = loadRegistry();
    clients = Object.entries(reg);
  }

  if (clients.length === 0) {
    console.log('📭 没有客户档案。运行 node scripts/onboard-client.js');
    process.exit(0);
  }

  console.log(`🔬 时间效率分析 — ${clients.length} 个客户（最近 ${days} 天）\n`);

  const allPrompts = [];

  for (const [key, info] of clients) {
    const aliases = info.aliases || [info.name];
    const timeData = getTimeInvestment(aliases, days);

    if (timeData.totalMin === 0) {
      console.log(`  ⏭️ ${info.name}: 无时间数据，跳过`);
      continue;
    }

    // Try to load ads data
    const adsDir = join(DATA_DIR, key);
    let adsData = null;
    if (existsSync(adsDir)) {
      const files = (await import('fs')).readdirSync(adsDir).filter(f => f.endsWith('.json')).sort().reverse();
      if (files.length > 0) {
        adsData = JSON.parse(readFileSync(join(adsDir, files[0]), 'utf-8'));
      }
    }

    console.log(`## ${info.name}`);
    console.log(`  时间投入: ${timeData.totalMin}分钟`);
    for (const [mod, min] of Object.entries(timeData.modules).sort((a, b) => b[1] - a[1])) {
      console.log(`    - ${mod}: ${Math.round(min)}m`);
    }

    if (adsData?.dailyTrend && adsData.dailyTrend.length > 1) {
      const trend = adsData.dailyTrend;
      const mid = Math.floor(trend.length / 2);
      const firstHalf = trend.slice(0, mid);
      const secondHalf = trend.slice(mid);
      const cost1 = firstHalf.reduce((s, d) => s + d.cost, 0);
      const cost2 = secondHalf.reduce((s, d) => s + d.cost, 0);
      const conv1 = firstHalf.reduce((s, d) => s + d.conversions, 0);
      const conv2 = secondHalf.reduce((s, d) => s + d.conversions, 0);
      console.log(`  花费: $${cost1.toFixed(0)} → $${cost2.toFixed(0)}`);
      console.log(`  转化: ${conv1.toFixed(0)} → ${conv2.toFixed(0)}`);
    }

    // Build prompt for Claude
    const prompt = buildCorrelationPrompt(info.name, timeData, adsData);
    if (prompt) {
      const promptFile = join(CORREL_DIR, `correlate-${key}-${new Date().toISOString().slice(0, 10)}.md`);
      writeFileSync(promptFile, prompt);
      allPrompts.push({ client: info.name, file: promptFile });
    }

    console.log('');
  }

  if (allPrompts.length > 0) {
    console.log('📝 分析 prompt 已生成:');
    for (const p of allPrompts) {
      console.log(`   ${p.client}: ${p.file}`);
    }
    console.log(`\n👉 对 Claude 说: 「读取 data/correlations/ 下的文件，给我时间效率分析」`);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
