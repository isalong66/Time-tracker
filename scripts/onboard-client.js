#!/usr/bin/env node
/**
 * 新客户录入 — 交互式引导
 *
 * 用法:
 *   node scripts/onboard-client.js
 */
import { createInterface } from 'readline';
import { createProfile, listProfiles } from '../profiles/lib/profiler.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(resolve => rl.question(q, resolve));

async function main() {
  console.log('🆕 新客户录入\n');

  console.log('现有客户:');
  const existing = listProfiles();
  if (existing.length > 0) {
    existing.forEach(c => console.log(`  - ${c.key}: ${c.name} (${c.customerId})`));
  } else {
    console.log('  (无)');
  }
  console.log('');

  const key = await ask('客户别名 (英文, 用作文件夹名, 如 vida-ai): ');
  const name = await ask('客户显示名 (如 VIDA AI): ');
  const customerId = await ask('Google Ads Customer ID (10位数字): ');
  const aliasesStr = await ask('Time Tracker 别名 (逗号分隔, 如 vida.marketing.ai,VIDA): ');
  const notes = await ask('备注 (可选): ');

  const aliases = aliasesStr.split(',').map(s => s.trim()).filter(Boolean);

  try {
    createProfile({ key, name, customerId, aliases, notes });
    console.log(`\n👉 下一步: node scripts/analyze-client.js ${key}`);
  } catch (e) {
    console.error('❌', e.message);
  }

  rl.close();
}

main();
