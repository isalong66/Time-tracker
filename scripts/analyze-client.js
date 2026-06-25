#!/usr/bin/env node
/**
 * 客户 AI 诊断 — 拉数据 + 生成 Claude 分析 prompt
 *
 * 用法:
 *   node scripts/analyze-client.js vida-ai           → 从 API 拉数据 + 生成 prompt
 *   node scripts/analyze-client.js vida-ai --days 30 → 拉 30 天数据
 *   node scripts/analyze-client.js vida-ai --local   → 用本地缓存的 snapshot
 *
 * 生成 prompt 后，告诉 Claude「读取 data/analysis-prompts/ 下的文件并分析」即可。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DIR = join(homedir(), 'time-tracker');
const DATA_DIR = join(DIR, 'data', 'ads-data');
const PROMPT_DIR = join(DIR, 'data', 'analysis-prompts');
const PROFILES_DIR = join(DIR, 'profiles');

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log('用法: node scripts/analyze-client.js <客户别名|客户ID> [--days 7] [--local]');
    process.exit(0);
  }

  const clientName = args[0];
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) || 7 : 7;
  const useLocal = args.includes('--local');

  let adsData;

  if (useLocal) {
    // Load from cached snapshot
    const snapDir = join(DATA_DIR, clientName);
    if (!existsSync(snapDir)) {
      console.log(`❌ 未找到本地缓存: ${snapDir}`);
      console.log('   先运行 node google-ads/diagnose.js ' + clientName);
      process.exit(1);
    }
    const files = (await import('fs')).readdirSync(snapDir).filter(f => f.endsWith('.json')).sort().reverse();
    if (files.length === 0) {
      console.log('❌ 本地缓存为空');
      process.exit(1);
    }
    adsData = JSON.parse(readFileSync(join(snapDir, files[0]), 'utf-8'));
    console.log(`📂 使用本地缓存: ${files[0]}`);
  } else {
    // Fetch from Google Ads API
    console.log(`🔍 正在拉取 ${clientName} 广告数据...`);
    const { fetchSummary } = await import('../google-ads/fetcher.js');
    const { resolveCustomerId } = await import('./lib/resolve-client.js');

    let customerId;
    try {
      customerId = resolveCustomerId(clientName);
    } catch {
      customerId = clientName; // Assume it's already a Customer ID
    }
    adsData = await fetchSummary(customerId, days);

    // Save snapshot
    const snapDir = join(DATA_DIR, clientName);
    mkdirSync(snapDir, { recursive: true });
    const snapFile = join(snapDir, `snapshot-${new Date().toISOString().slice(0, 10)}.json`);
    writeFileSync(snapFile, JSON.stringify(adsData, null, 2));
    console.log(`💾 数据已缓存: ${snapFile}`);
  }

  // Generate diagnosis prompt
  const { generateDiagnosis } = await import('../ai/analyzer.js');
  const result = await generateDiagnosis(clientName, adsData, { days, savePrompt: true });

  console.log(`\n✅ 分析 prompt 已生成: ${result.promptFile}`);
  console.log(`📊 数据文件: ${result.dataFile}`);
  console.log(`\n👉 现在对 Claude 说:「读取 ${result.promptFile}，然后给我分析报告」`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
