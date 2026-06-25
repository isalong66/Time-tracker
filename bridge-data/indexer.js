/**
 * Bridge Marketing 报告索引器
 * 扫描 ~/bridge-marketing/reports/ 目录，生成每客户的报告时间线
 */
import { readdirSync, statSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { homedir } from 'os';

const REPORTS_DIR = join(homedir(), 'bridge-marketing', 'reports');

// Standardize client names (from sort-reports.mjs logic)
const CLIENT_ALIASES = {
  'Einsia_AI': ['Einsia', 'Einsia AI', 'Einsia_AI'],
  'Flova_AI': ['Flova', 'Flova-Bridge', 'Flova_AI'],
  'Intellectia_AI': ['Intellectia', 'Intellectia AI', 'Intellectia_AI'],
  'OpenArt_AI': ['OpenArt', 'OpenArt AI', 'OpenArt AI Inc', 'OpenArt_AI'],
  'VIDA_AI': ['VIDA', 'VIDA AI', 'vida.marketing.ai', 'VIDA_AI'],
  'AIMA': ['AIMA'],
  'Tapnow_AI': ['Tapnow', 'Tapnow AI', 'Tapnow_AI'],
  'ConvergeAI': ['ConvergeAI'],
  'Chronusmart': ['Chronusmart'],
  'Corespeed': ['Corespeed'],
  'Desqra': ['Desqra'],
  'MSPbots': ['MSPbots'],
  'Ottocast_Getpair': ['Ottocast', 'Getpair', 'Ottocast_Getpair'],
  'Safari_Star': ['Safari Star', 'Safari_Star'],
  'Combos': ['Combos'],
  'SureThing': ['SureThing'],
  '_Bridge_Internal': ['Bridge Internal', '_Bridge_Internal'],
};

// Map time-tracker account names to Bridge client folders
export const TRACKER_TO_BRIDGE = {
  'vida.marketing.ai': 'VIDA_AI',
  'Flova-Bridge': 'Flova_AI',
  'OpenArt AI Inc.': 'OpenArt_AI',
  'Taylor Kom': 'SureThing',
  'Bridge Connections MCC': '_Bridge_Internal',
};

/**
 * Scan reports/ directory and build client index
 */
export function scanAllReports() {
  const index = {};

  if (!existsSync(REPORTS_DIR)) return index;

  const clientDirs = readdirSync(REPORTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const clientDir of clientDirs) {
    const clientPath = join(REPORTS_DIR, clientDir);
    const files = scanClientDir(clientPath);
    if (files.length > 0) {
      index[clientDir] = {
        path: clientPath,
        fileCount: files.length,
        files,
        dateRange: getDateRange(files),
        types: getTypeBreakdown(files),
      };
    }
  }

  return index;
}

function scanClientDir(dir, prefix = '') {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanClientDir(fullPath, join(prefix, entry.name)));
    } else {
      const stat = statSync(fullPath);
      const { date, type } = parseFilename(entry.name);
      results.push({
        name: entry.name,
        path: fullPath,
        relativePath: join(prefix, entry.name),
        ext: extname(entry.name).toLowerCase(),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        date: date || stat.mtime.toISOString().slice(0, 10),
        type: type || guessType(join(prefix, entry.name)),
      });
    }
  }

  return results;
}

/**
 * Parse date from filename like "2026-06-11_Flova_AI_daily.pdf"
 */
function parseFilename(filename) {
  // YYYY-MM-DD at start
  const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : null;

  // Report type
  let type = 'other';
  const lower = filename.toLowerCase();
  if (lower.includes('daily')) type = 'daily';
  else if (lower.includes('weekly')) type = 'weekly';
  else if (lower.includes('monthly') || lower.includes('quarter')) type = 'monthly';
  else if (lower.includes('proposal') || lower.includes('strategy') || lower.includes('plan')) type = 'proposal';
  else if (lower.match(/\.(jpg|png|mp4|mov|gif|svg|psd|ai)$/)) type = 'creative';

  return { date, type };
}

function guessType(relativePath) {
  const lower = relativePath.toLowerCase();
  if (lower.includes('daily')) return 'daily';
  if (lower.includes('weekly')) return 'weekly';
  if (lower.includes('monthly')) return 'monthly';
  if (lower.includes('proposal') || lower.includes('creative')) return 'proposal';
  return 'other';
}

function getDateRange(files) {
  const dates = files.map(f => f.date).filter(Boolean).sort();
  return dates.length > 0 ? { first: dates[0], last: dates[dates.length - 1] } : null;
}

function getTypeBreakdown(files) {
  const types = {};
  for (const f of files) {
    types[f.type] = (types[f.type] || 0) + 1;
  }
  return types;
}

/**
 * Get report summary for a specific client (compatible with time tracker profiles)
 */
export function getClientReportSummary(clientKey) {
  const index = scanAllReports();
  const aliases = CLIENT_ALIASES[clientKey] || [clientKey];

  for (const [dirKey, data] of Object.entries(index)) {
    if (aliases.some(a => dirKey.toLowerCase().includes(a.toLowerCase()))) {
      return {
        clientKey: dirKey,
        ...data,
      };
    }
  }
  return null;
}

/**
 * Map time tracker account name to Bridge client
 */
export function mapTrackerToBridge(accountName) {
  for (const [tracker, bridge] of Object.entries(TRACKER_TO_BRIDGE)) {
    if (accountName.toLowerCase().includes(tracker.toLowerCase())) return bridge;
  }
  return null;
}
