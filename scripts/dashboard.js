#!/usr/bin/env node
/**
 * 客户一览表
 *
 * 用法:
 *   node scripts/dashboard.js
 */
import { listProfiles } from '../profiles/lib/profiler.js';

function main() {
  const profiles = listProfiles();

  if (profiles.length === 0) {
    console.log('📭 还没有客户档案。运行 node scripts/onboard-client.js 创建');
    return;
  }

  console.log(`# 📊 客户一览 — ${profiles.length} 个客户\n`);
  console.log('| 客户 | Customer ID | 最后分析 | 分析次数 | 录入日期 |');
  console.log('|------|------------|----------|----------|----------|');

  for (const p of profiles) {
    console.log(`| ${p.name} | ${p.customerId} | ${p.lastAnalyzed || '未分析'} | ${p.analysisCount} | ${p.createdAt} |`);
  }

  console.log('');
  console.log('👉 分析客户: node scripts/analyze-client.js <别名>');
  console.log('👉 录入新客户: node scripts/onboard-client.js');
}

main();
