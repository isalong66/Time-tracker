#!/usr/bin/env node
/**
 * 时间追踪器 — 每 5 秒记录当前 App/网页，自动归类，生成日报
 *
 * 用法：
 *   node tracker.js              → 前台运行，Ctrl+C 停止
 *   node tracker.js --daemon     → 后台运行
 *   node tracker.js --report     → 查看今天的报告
 *   node tracker.js --report 2026-06-22  → 查看指定日期
 *   node tracker.js --stop       → 停止后台进程
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(homedir(), 'time-tracker');
const DATA_DIR = join(DIR, 'data');
const REPORTS_DIR = join(DIR, 'reports');
const CONFIG_PATH = join(DIR, 'config.json');
const PID_FILE = join(DIR, '.tracker.pid');

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
const POLL_MS = config.pollIntervalMs || 5000;
const IDLE_MS = config.idleThresholdMs || 120000;

// ── Helpers ──────────────────────────────────────────────────────────

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function hms(d = new Date()) {
  return d.toTimeString().slice(0, 8);
}
function ts() {
  return Date.now();
}

function getDataFile(dateStr) {
  return join(DATA_DIR, `${dateStr}.json`);
}

function formatMin(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── AppleScript queries ──────────────────────────────────────────────

function queryActiveApp() {
  try {
    const out = execSync(
      `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`,
      { timeout: 2000 }
    ).toString().trim();
    return out || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

function queryWindowTitle(appName) {
  try {
    // Escape double quotes and backslashes for AppleScript string
    const safeName = appName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const script = `tell application "System Events" to tell process "${safeName}" to get title of front window`;
    const out = execSync(`osascript -e '${script}'`, { timeout: 2000 }).toString().trim();
    return out || '';
  } catch {
    return '';
  }
}

function queryChromeURL() {
  try {
    const out = execSync(
      `osascript -e 'tell application "Google Chrome" to get URL of active tab of front window'`,
      { timeout: 2000 }
    ).toString().trim();
    return out || '';
  } catch {
    return '';
  }
}

// ── Categorization ───────────────────────────────────────────────────

function categorize(app, title, url) {
  const cats = config.categories;
  const joined = `${app} ${title} ${url}`.toLowerCase();

  for (const [cat, rules] of Object.entries(cats)) {
    if (cat === '其他') continue;

    // Check apps
    for (const a of rules.apps || []) {
      if (app.toLowerCase().includes(a.toLowerCase())) return cat;
    }

    // Check URL keywords
    for (const u of rules.urls || []) {
      if (url.toLowerCase().includes(u.toLowerCase())) return cat;
    }

    // Check domain keywords in app paths (for VS Code / Terminal projects)
    for (const d of rules.domains || []) {
      if (title.toLowerCase().includes(d.toLowerCase())) return cat;
      if (url.toLowerCase().includes(d.toLowerCase())) return cat;
    }
  }

  return '其他';
}

// ── Data storage ─────────────────────────────────────────────────────

function loadSessions(dateStr) {
  const file = getDataFile(dateStr);
  if (existsSync(file)) {
    try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return []; }
  }
  return [];
}

function saveSessions(dateStr, sessions) {
  const file = getDataFile(dateStr);
  writeFileSync(file, JSON.stringify(sessions, null, 2));
}

// ── Running tracker loop ─────────────────────────────────────────────

async function runTracker() {
  console.log(`⏱️  时间追踪器启动 (每 ${POLL_MS / 1000}s 检测)`);
  console.log(`📂 数据目录: ${DATA_DIR}`);
  console.log(`Ctrl+C 停止\n`);

  let today = ymd();
  let sessions = loadSessions(today);
  let current = null;
  let lastActivity = ts();
  let idle = false;

  const saveCurrent = () => {
    if (current && current.durationMs > 0) {
      sessions.push({ ...current });
      saveSessions(today, sessions);
    }
    current = null;
  };

  const flush = () => {
    // Check if day changed
    const newDay = ymd();
    if (newDay !== today) {
      saveCurrent();
      today = newDay;
      sessions = loadSessions(today);
    }
  };

  // Tick loop
  const tick = () => {
    flush();

    const app = queryActiveApp();
    const title = queryWindowTitle(app);
    const url = app === 'Google Chrome' ? queryChromeURL() : '';
    const category = categorize(app, title, url);
    const now = ts();

    // Idle detection
    if (app === current?.app && title === current?.title) {
      // Same as before — check if idle
      const timeSinceActivity = now - lastActivity;
      if (timeSinceActivity > IDLE_MS) {
        if (!idle) {
          saveCurrent();
          idle = true;
          current = { app: 'Idle', title: '', url: '', category: '其他', start: lastActivity, durationMs: 0 };
        }
      }
    } else {
      // App changed — save previous session
      saveCurrent();
      idle = false;
      lastActivity = now;

      current = {
        app,
        title: title || '',
        url: url ? (new URL(url)).hostname + (new URL(url)).pathname : '',
        category,
        start: now,
        durationMs: 0,
      };
    }

    if (current) {
      current.durationMs += POLL_MS;
    }
  };

  // Run tick immediately, then every POLL_MS
  tick();
  const interval = setInterval(tick, POLL_MS);

  // Graceful shutdown
  const shutdown = () => {
    clearInterval(interval);
    saveCurrent();
    console.log(`\n✅ 追踪器已停止。今天的记录已保存到 ${getDataFile(ymd())}`);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ── Report generation ────────────────────────────────────────────────

async function generateReport(dateStr) {
  // Use shared report generator
  const { generateDailyReport } = await import('./report-generator.js');
  const report = generateDailyReport(dateStr);
  if (!report) {
    console.log(`❌ ${dateStr} 没有记录`);
    return;
  }
  console.log(report);
  const reportFile = join(REPORTS_DIR, `report-${dateStr}.md`);
  writeFileSync(reportFile, report);
  console.log(`\n📄 报告已保存到: ${reportFile}`);
}

// ── CLI entry ────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--report')) {
  const dateIdx = args.indexOf('--report');
  const dateStr = args[dateIdx + 1] && args[dateIdx + 1].match(/^\d{4}-\d{2}-\d{2}$/)
    ? args[dateIdx + 1]
    : ymd();
  generateReport(dateStr);

} else if (args.includes('--stop')) {
  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8'));
    try { process.kill(pid, 'SIGTERM'); console.log(`✅ 已停止 PID ${pid}`); } catch { console.log('⚠️ 进程已不在'); }
  } else {
    // Try to find and kill any running tracker
    try {
      execSync('pkill -f "node.*tracker.js"', { timeout: 3000 });
      console.log('✅ 已停止追踪器');
    } catch {
      console.log('⚠️ 没有运行中的追踪器');
    }
  }

} else if (args.includes('--daemon')) {
  // Check if already running
  if (existsSync(PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8'));
      process.kill(pid, 0);
      console.log(`⚠️ 追踪器已在运行 (PID ${pid})`);
      process.exit(0);
    } catch {
      // Dead PID file, remove it
    }
  }

  const scriptPath = fileURLToPath(import.meta.url);
  const child = spawn('node', [scriptPath], {
    detached: true,
    stdio: 'ignore',
    cwd: DIR,
  });
  writeFileSync(PID_FILE, child.pid.toString());
  console.log(`🚀 追踪器已在后台启动 (PID ${child.pid})`);
  console.log(`node ${DIR}/tracker.js --report   → 看今天的报告`);
  console.log(`node ${DIR}/tracker.js --stop     → 停止`);
  child.unref();

} else {
  // Foreground
  runTracker();
}
