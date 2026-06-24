#!/usr/bin/env node
/**
 * 报告抓取器 — 从 Gmail 拉取 Time Tracker 邮件，解析数据，生成总结
 *
 * 用法：
 *   node fetch-reports.js            → 抓最近 7 天报告
 *   node fetch-reports.js 30        → 抓最近 30 天
 *   node fetch-reports.js --monthly → 月趋势
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const DIR = join(homedir(), 'time-tracker');
const DATA_DIR = join(DIR, 'data');
const CACHE_DIR = join(DATA_DIR, 'email-cache');
const CONFIG_PATH = join(DIR, 'email-config.json');

mkdirSync(CACHE_DIR, { recursive: true });

// ── Helpers ──────────────────────────────────────────────────────────

function fmtMin(m) {
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
}

function parseMinutes(str) {
  if (!str) return 0;
  let total = 0;
  str = str.trim();
  const h = str.match(/(\d+)\s*h/);
  const m = str.match(/(\d+)\s*m/);
  if (h) total += parseInt(h[1]) * 60;
  if (m) total += parseInt(m[1]);
  return total;
}

// ── Parse plain-text report ──────────────────────────────────────────

function parseReport(text, date) {
  const result = {
    date,
    totalMin: 0,
    sections: {},
    categories: {},
    apps: {},
    urls: {},
    gaAccounts: {},
    hourly: {},
  };

  const lines = text.split('\n');
  let currentSection = null;
  let mode = null; // 'categories' | 'apps' | 'urls' | 'hourly'
  let inGaSection = false;
  let currentGaAcct = null;
  let overallSections = {}; // from the overview table

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // ── Total time ──
    const totalMatch = line.match(/📊\s*(今日|本周|本月)总览\s*[—\-]\s*(.+)$/);
    if (totalMatch) {
      result.totalMin = parseMinutes(totalMatch[2]);
      continue;
    }

    // ── Overview table ──
    if (line.startsWith('| 板块') || line.startsWith('| 类目') || line.startsWith('| App') || line.startsWith('| 网页') || line.startsWith('| 小时')) {
      mode = line.includes('类目') ? 'categories' :
             line.includes('板块') ? 'overview' :
             line.includes('App') ? 'apps' :
             line.includes('网页') ? 'urls' :
             line.includes('小时') ? 'hourly' : null;
      continue;
    }
    if (line === '|------|------|------|' || line === '|------|------|') continue;

    if (line.startsWith('|') && mode) {
      const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
      if (cells.length >= 2) {
        const name = cells[0];
        const min = parseMinutes(cells[1]);
        if (mode === 'overview') {
          overallSections[name] = min;
        } else if (mode === 'categories') {
          result.categories[name] = (result.categories[name] || 0) + min;
          if (currentSection) {
            if (!result.sections[currentSection]) result.sections[currentSection] = { totalMin: 0, categories: {}, apps: {}, urls: {} };
            result.sections[currentSection].categories[name] = (result.sections[currentSection].categories[name] || 0) + min;
          }
        } else if (mode === 'apps') {
          result.apps[name] = (result.apps[name] || 0) + min;
        } else if (mode === 'urls') {
          result.urls[name] = (result.urls[name] || 0) + min;
        } else if (mode === 'hourly') {
          result.hourly[name] = (result.hourly[name] || 0) + min;
        }
      }
      continue;
    }

    // ── Separator: end of section ──
    if (line === '---') {
      currentSection = null;
      mode = null;
      inGaSection = false;
      continue;
    }

    // ── Section header: "工作日报 — 1h 3m" ──
    const secMatch = line.match(/^(工作日报|学习日报|其他时间|工作周报|学习周报|工作月报|学习月报)\s*[—\-]\s*(.+)$/);
    if (secMatch) {
      currentSection = secMatch[1];
      const secMin = parseMinutes(secMatch[2]);
      if (!result.sections[currentSection]) result.sections[currentSection] = { totalMin: secMin, categories: {}, apps: {}, urls: {} };
      result.sections[currentSection].totalMin = secMin;
      mode = null;
      continue;
    }

    // ── Google Ads section ──
    if (line.includes('📢 Google Ads')) {
      inGaSection = true;
      mode = null;
      continue;
    }
    if (inGaSection && line.startsWith('- ')) {
      // Account line: "- account_name — Xm" (has em dash before time)
      const gaMatch = line.match(/^-\s*(.+?)\s*[—]\s*(.+)$/);
      if (gaMatch) {
        currentGaAcct = gaMatch[1].trim();
        const min = parseMinutes(gaMatch[2]);
        if (!result.gaAccounts[currentGaAcct]) result.gaAccounts[currentGaAcct] = { totalMin: 0, modules: {} };
        result.gaAccounts[currentGaAcct].totalMin += min;
        continue;
      }
      // Module line: "- name: Xm" (has colon, no em dash)
      if (line.includes(':') && currentGaAcct) {
        const modMatch = line.match(/^-\s*(.+?):\s*(.+)$/);
        if (modMatch && result.gaAccounts[currentGaAcct]) {
          result.gaAccounts[currentGaAcct].modules[modMatch[1].trim()] = parseMinutes(modMatch[2]);
        }
        continue;
      }
    }
    // Exit GA section on tables or next section
    if (inGaSection && (line.startsWith('|') || line.match(/^(工作|学习|其他|Time Tracker)/))) {
      inGaSection = false;
    }
  }

  // Fill section totals from overview
  for (const [secName, min] of Object.entries(overallSections)) {
    if (result.sections[secName]) {
      result.sections[secName].totalMin = min;
    }
  }

  return result;
}

// ── Fetch from Gmail ─────────────────────────────────────────────────

async function fetchReports(days = 7) {
  if (!existsSync(CONFIG_PATH)) {
    console.log('❌ 未配置 email-config.json');
    return [];
  }
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });

  console.log(`📧 连接 Gmail...`);
  await client.connect();
  await client.mailboxOpen('INBOX');

  const since = new Date();
  since.setDate(since.getDate() - days);

  const found = await client.search({
    from: cfg.user,
    subject: '⏱️',
    since,
  });

  console.log(`🔍 找到 ${found.length} 封 Time Tracker 邮件（最近 ${days} 天）\n`);

  // Fetch all, parse, deduplicate by date — keep fullest report per day
  const dateMap = {};
  for (const seq of found) {
    try {
      const fetched = await client.fetchOne(seq, { source: true });
      const parsed = await simpleParser(fetched.source);
      const date = (parsed.subject || '').match(/(\d{4}-\d{2}-\d{2})/)?.[1] || '';
      const text = parsed.text || '';
      const report = parseReport(text, date);

      // Deduplicate: keep the one with most total time
      if (!dateMap[date] || report.totalMin > dateMap[date].totalMin) {
        dateMap[date] = report;
        // Cache the best version
        writeFileSync(join(CACHE_DIR, `email-${date}.txt`), text);
      }
    } catch (e) {
      // skip malformed emails
    }
  }

  await client.logout();

  // Sort by date
  const reports = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  for (const r of reports) {
    console.log(`  ✅ ${r.date} — ${fmtMin(r.totalMin)}`);
  }

  return reports;
}

// ── Summary generator ────────────────────────────────────────────────

function generateTrend(reports) {
  const lines = [];
  lines.push('# 📈 Time Tracker 趋势报告');
  lines.push(`> ${reports[0]?.date || '?'} → ${reports[reports.length - 1]?.date || '?'}`);
  lines.push('');

  // ── Daily breakdown ──
  lines.push('## 每日时间');
  lines.push('| 日期 | 总时间 | Bridge Mktg | AI/学习 | 其他 |');
  lines.push('|------|--------|-------------|---------|------|');

  for (const r of reports) {
    const dow = new Date(r.date).toLocaleDateString('zh-CN', { weekday: 'short' });
    const bm = r.categories['Bridge Marketing'] || 0;
    const ai = r.categories['AI / 学习'] || 0;
    const other = r.totalMin - bm - ai;
    lines.push(`| ${r.date} ${dow} | ${fmtMin(r.totalMin)} | ${fmtMin(bm)} | ${fmtMin(ai)} | ${fmtMin(other)} |`);
  }
  lines.push('');

  // ── Averages ──
  if (reports.length > 0) {
    const avgTotal = Math.round(reports.reduce((s, r) => s + r.totalMin, 0) / reports.length);
    const avgWork = Math.round(reports.reduce((s, r) => s + (r.categories['Bridge Marketing'] || 0), 0) / reports.length);
    const avgAi = Math.round(reports.reduce((s, r) => s + (r.categories['AI / 学习'] || 0), 0) / reports.length);

    lines.push('## 日均');
    lines.push(`- 总时间: **${fmtMin(avgTotal)}**`);
    lines.push(`- 工作: **${fmtMin(avgWork)}**`);
    lines.push(`- 学习: **${fmtMin(avgAi)}**`);
    lines.push('');
  }

  // ── Category breakdown ──
  lines.push('## 类目汇总');
  const catTotals = {};
  for (const r of reports) {
    for (const [cat, min] of Object.entries(r.categories)) {
      catTotals[cat] = (catTotals[cat] || 0) + min;
    }
  }
  const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  lines.push('| 类目 | 总时间 |');
  lines.push('|------|--------|');
  for (const [cat, min] of topCats) {
    lines.push(`| ${cat} | ${fmtMin(min)} |`);
  }
  lines.push('');

  // ── Top apps ──
  lines.push('## 最常用 App');
  const appTotals = {};
  for (const r of reports) {
    for (const [app, min] of Object.entries(r.apps)) {
      appTotals[app] = (appTotals[app] || 0) + min;
    }
  }
  const topApps = Object.entries(appTotals).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [app, min] of topApps) {
    lines.push(`- ${app}: ${fmtMin(min)}`);
  }
  lines.push('');

  // ── Google Ads accounts ──
  lines.push('## Google Ads 账号');
  const gaTotals = {};
  for (const r of reports) {
    for (const [acct, data] of Object.entries(r.gaAccounts)) {
      if (['商标', '版权文档网络表单'].includes(acct)) continue;
      if (!gaTotals[acct]) gaTotals[acct] = { totalMin: 0, modules: {} };
      gaTotals[acct].totalMin += data.totalMin;
      for (const [mod, min] of Object.entries(data.modules)) {
        gaTotals[acct].modules[mod] = (gaTotals[acct].modules[mod] || 0) + min;
      }
    }
  }
  const topGa = Object.entries(gaTotals).sort((a, b) => b[1].totalMin - a[1].totalMin).slice(0, 8);
  for (const [acct, data] of topGa) {
    const topMods = Object.entries(data.modules).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const modStr = topMods.map(([m, t]) => `${m}: ${fmtMin(t)}`).join(', ');
    lines.push(`- **${acct}**: ${fmtMin(data.totalMin)} (${modStr})`);
  }
  lines.push('');

  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let days = 7;
  if (args[0] && !isNaN(args[0])) days = parseInt(args[0]);
  else if (args.includes('--monthly')) days = 30;

  const reports = await fetchReports(days);
  if (reports.length === 0) { console.log('❌ 未找到报告邮件'); return; }

  // Save structured data
  const summaryFile = join(DATA_DIR, 'report-summary.json');
  writeFileSync(summaryFile, JSON.stringify(reports, null, 2));
  console.log(`\n💾 结构化数据: ${summaryFile}`);

  // Generate trend
  const trend = generateTrend(reports);
  console.log('\n' + trend);

  const trendFile = join(DATA_DIR, 'trend-report.md');
  writeFileSync(trendFile, trend);
  console.log(`📄 趋势报告: ${trendFile}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
