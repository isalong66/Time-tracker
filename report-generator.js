/**
 * 报告生成器 — 日/周/月报
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DIR = join(homedir(), 'time-tracker');
const DATA_DIR = join(DIR, 'data');

function ymd(d) { return (d||new Date()).toISOString().slice(0,10); }
function hms(d) { return d.toTimeString().slice(0,8); }
function fmtMin(m) { const h=Math.floor(m/60), r=Math.round(m%60); return h>0?`${h}h ${r}m`:`${r}m`; }

function loadSessions(dateStr) {
  const f = join(DATA_DIR, `${dateStr}.json`);
  if (!existsSync(f)) return [];
  try { return JSON.parse(readFileSync(f,'utf-8')); } catch { return []; }
}

function loadRange(fromYmd, toYmd) {
  let all = [];
  const from = new Date(fromYmd), to = new Date(toYmd);
  for (let d = new Date(from); d <= to; d.setDate(d.getDate()+1)) {
    all = all.concat(loadSessions(ymd(d)));
  }
  return all;
}

// ── Core aggregation ─────────────────────────────────────────────────

function aggregate(sessions, filterCats) {
  const catMap={}, appMap={}, urlMap={}, gaAccounts={}, hourMap={};
  let totalMs=0;

  for (const s of sessions) {
    if (s.category==='Idle' || s.app==='Idle') continue;
    const cat = s.category||'其他';
    if (filterCats && filterCats.length>0 && !filterCats.includes(cat)) continue;
    const ms = s.durationMs||0;
    totalMs += ms;
    catMap[cat] = (catMap[cat]||0)+ms;
    appMap[s.app] = (appMap[s.app]||0)+ms;
    if (s.url) {
      const host = s.url.split('/')[0];
      urlMap[host] = (urlMap[host]||0)+ms;
    }
    // Hour
    const h = new Date(s.start).toTimeString().slice(0,2)+':00';
    hourMap[h] = (hourMap[h]||0)+ms;
    // GA account
    if (s.app==='Google Chrome') {
      let m = s.title.match(/^(.+?)\s*[-–—]\s*(.+?)\s*[-–—]\s*Google\s*Ads/i);
      let account, module;
      if (m) { module=m[1].trim(); account=m[2].trim(); }
      else {
        m = s.title.match(/^(.+?)\s*[-–—]\s*Google\s*Ads/i);
        if (m) { account=m[1].trim(); module='浏览'; }
      }
      if (account && account.length<50 && !account.includes('High me') && !account.includes('High memory')) {
        if (!gaAccounts[account]) gaAccounts[account]={totalMs:0,modules:{}};
        gaAccounts[account].totalMs += ms;
        gaAccounts[account].modules[module] = (gaAccounts[account].modules[module]||0)+ms;
      }
    }
  }

  return { totalMs, catMap, appMap, urlMap, gaAccounts, hourMap };
}

// ── Build single section ─────────────────────────────────────────────

function buildSection(label, data, dateHint) {
  const { totalMs, catMap, appMap, urlMap, gaAccounts, hourMap } = data;
  const totalMin = totalMs/60000;
  const lines=[];

  lines.push(`### ${label} — ${fmtMin(totalMin)}`);
  lines.push('');

  // Category bar
  const cats = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  if (cats.length>0) {
    lines.push(`| 类目 | 时间 | 占比 |`);
    lines.push(`|------|------|------|`);
    for (const [c,ms] of cats) {
      const pct = (ms/totalMs*100).toFixed(1);
      const bar = '█'.repeat(Math.round(pct/3));
      lines.push(`| ${c} | ${fmtMin(ms/60000)} | ${bar} ${pct}% |`);
    }
    lines.push('');
  }
  // Apps
  const apps = Object.entries(appMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if (apps.length>0) {
    lines.push(`| App | 时间 |`);
    lines.push(`|------|------|`);
    for (const [a,ms] of apps) lines.push(`| ${a} | ${fmtMin(ms/60000)} |`);
    lines.push('');
  }
  // URLs
  const urls = Object.entries(urlMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if (urls.length>0) {
    lines.push(`| 网页 | 时间 |`);
    lines.push(`|------|------|`);
    for (const [u,ms] of urls) lines.push(`| ${u} | ${fmtMin(ms/60000)} |`);
    lines.push('');
  }
  // Google Ads accounts
  const gas = Object.entries(gaAccounts).sort((a,b)=>b[1].totalMs-a[1].totalMs);
  if (gas.length>0) {
    lines.push('**📢 Google Ads 账号明细**');
    lines.push('');
    for (const [acct, adata] of gas) {
      lines.push(`- **${acct}** — ${fmtMin(adata.totalMs/60000)}`);
      const mods = Object.entries(adata.modules).sort((a,b)=>b[1]-a[1]);
      for (const [mod,ms] of mods) lines.push(`  - ${mod}: ${fmtMin(ms/60000)}`);
    }
    lines.push('');
  }
  // Hourly
  const hours = Object.entries(hourMap).sort();
  if (hours.length>0) {
    lines.push('| 小时 | 时间 |');
    lines.push('|------|------|');
    for (const [h,ms] of hours) lines.push(`| ${h} | ${fmtMin(ms/60000)} |`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Daily report ─────────────────────────────────────────────────────

export function generateDailyReport(dateStr) {
  const sessions = loadSessions(dateStr);
  if (sessions.length===0) return null;

  const sections = [
    { label: '工作日报', desc: 'Bridge Marketing', cats: ['Bridge Marketing'] },
    { label: '学习日报', desc: 'AI / 学习', cats: ['AI / 学习'] },
    { label: '其他时间', desc: '餐厅 · 沟通 · 创作', cats: ['其他','滇南米线','邮件 & 沟通','内容创作'] },
  ];

  const lines=[];
  lines.push(`# ⏱️ 时间分配报告 — ${dateStr}`);
  lines.push('');

  // Overall summary
  const all = aggregate(sessions);
  const totalMin = all.totalMs/60000;
  lines.push(`## 📊 今日总览 — ${fmtMin(totalMin)}`);
  lines.push('');
  lines.push(`| 板块 | 时间 | 占比 |`);
  lines.push(`|------|------|------|`);
  for (const sec of sections) {
    const d = aggregate(sessions, sec.cats);
    const pct = totalMin>0 ? (d.totalMs/all.totalMs*100).toFixed(1) : 0;
    const bar = '█'.repeat(Math.round(pct/4));
    lines.push(`| ${sec.label} | ${fmtMin(d.totalMs/60000)} | ${bar} ${pct}% |`);
  }
  lines.push('');

  // Section details
  for (const sec of sections) {
    const d = aggregate(sessions, sec.cats);
    if (d.totalMs===0) continue;
    lines.push(buildSection(sec.label, d));
    lines.push('---');
    lines.push('');
  }

  lines.push(`*Time Tracker 自动生成 · ${ymd()}*`);
  return lines.join('\n');
}

// ── Weekly report ────────────────────────────────────────────────────

export function generateWeeklyReport(endDateStr) {
  const end = new Date(endDateStr);
  const start = new Date(end);
  start.setDate(start.getDate()-6);
  const sStr = ymd(start), eStr = ymd(end);
  const sessions = loadRange(sStr, eStr);
  if (sessions.length===0) return null;

  const sections = [
    { label: '工作周报', cats: ['Bridge Marketing'] },
    { label: '学习周报', cats: ['AI / 学习'] },
    { label: '其他时间', cats: ['其他','滇南米线','邮件 & 沟通','内容创作'] },
  ];

  const all = aggregate(sessions);
  const totalMin = all.totalMs/60000, totalH = Math.round(totalMin/6)/10;
  const lines=[];
  lines.push(`# ⏱️ 时间分配周报 — ${sStr} → ${eStr}`);
  lines.push('');
  lines.push(`## 📊 本周总览 — ${fmtMin(totalMin)}`);
  lines.push('');

  // Day-by-day
  lines.push('### 每日时间');
  lines.push('| 日期 | 工作 | 学习 | 其他 | 合计 |');
  lines.push('|------|------|------|------|------|');
  for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) {
    const ds = ymd(d);
    const daySessions = loadSessions(ds);
    const workMs = aggregate(daySessions, ['Bridge Marketing']).totalMs;
    const learnMs = aggregate(daySessions, ['AI / 学习']).totalMs;
    const otherMs = aggregate(daySessions, ['其他','滇南米线','邮件 & 沟通','内容创作']).totalMs;
    const dayTotal = workMs+learnMs+otherMs;
    if (dayTotal===0) continue;
    const dow = d.toLocaleDateString('zh-CN',{weekday:'short'});
    lines.push(`| ${ds} ${dow} | ${fmtMin(workMs/60000)} | ${fmtMin(learnMs/60000)} | ${fmtMin(otherMs/60000)} | ${fmtMin(dayTotal/60000)} |`);
  }
  lines.push('');

  // Section details
  for (const sec of sections) {
    const d = aggregate(sessions, sec.cats);
    if (d.totalMs===0) continue;
    lines.push(`---`);
    lines.push('');
    lines.push(buildSection(sec.label, d));
    lines.push('');
  }

  lines.push(`*Time Tracker 自动生成 · ${ymd()}*`);
  return lines.join('\n');
}

// ── Monthly report ───────────────────────────────────────────────────

export function generateMonthlyReport(year, month) {
  const start = new Date(year, month-1, 1);
  const end = new Date(year, month, 0);
  const sStr=ymd(start), eStr=ymd(end);
  const sessions = loadRange(sStr, eStr);
  if (sessions.length===0) return null;

  const sections = [
    { label: '工作月报', cats: ['Bridge Marketing'] },
    { label: '学习月报', cats: ['AI / 学习'] },
    { label: '其他时间', cats: ['其他','滇南米线','邮件 & 沟通','内容创作'] },
  ];

  const all = aggregate(sessions);
  const totalMin = all.totalMs/60000;
  const lines=[];
  lines.push(`# ⏱️ 时间分配月报 — ${year}年${month}月`);
  lines.push('');
  lines.push(`## 📊 本月总览 — ${fmtMin(totalMin)}`);
  lines.push('');

  // Week-by-week
  lines.push('### 每周时间');
  lines.push('| 周 | 工作 | 学习 | 其他 | 合计 |');
  lines.push('|------|------|------|------|------|');
  let weekStart = new Date(start);
  while (weekStart <= end) {
    let weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate()+6);
    if (weekEnd > end) weekEnd = new Date(end);
    const ws = loadRange(ymd(weekStart), ymd(weekEnd));
    const wWork = aggregate(ws, ['Bridge Marketing']).totalMs;
    const wLearn = aggregate(ws, ['AI / 学习']).totalMs;
    const wOther = aggregate(ws, ['其他','滇南米线','邮件 & 沟通','内容创作']).totalMs;
    const wTotal = wWork+wLearn+wOther;
    if (wTotal===0) { weekStart.setDate(weekStart.getDate()+7); continue; }
    lines.push(`| ${ymd(weekStart)}→${ymd(weekEnd)} | ${fmtMin(wWork/60000)} | ${fmtMin(wLearn/60000)} | ${fmtMin(wOther/60000)} | ${fmtMin(wTotal/60000)} |`);
    weekStart.setDate(weekStart.getDate()+7);
  }
  lines.push('');

  for (const sec of sections) {
    const d = aggregate(sessions, sec.cats);
    if (d.totalMs===0) continue;
    lines.push(`---`);
    lines.push('');
    lines.push(buildSection(sec.label, d));
    lines.push('');
  }

  lines.push(`*Time Tracker 自动生成 · ${ymd()}*`);
  return lines.join('\n');
}
