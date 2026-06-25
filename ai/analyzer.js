/**
 * AI 分析编排器 — 拉数据 → 拼 prompt → 调 Claude Code → 格式化输出
 *
 * 两种模式:
 *   1. --prompt: 仅生成 prompt 文件，供 Claude Code 读取
 *   2. 默认: 生成完整分析指令，指导 Claude 怎么做
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { buildDiagnosisPrompt, buildWeeklyPrompt } from './prompts.js';

const DIR = join(homedir(), 'time-tracker');
const PROFILES_DIR = join(DIR, 'profiles');
const PROMPT_DIR = join(DIR, 'data', 'analysis-prompts');

mkdirSync(PROMPT_DIR, { recursive: true });

// ── Time data helper ──────────────────────────────────────────────────

function loadTimeData(accountAliases, days = 7) {
  // Read report-summary.json or scan data files
  const summaryPath = join(DIR, 'data', 'report-summary.json');
  if (!existsSync(summaryPath)) return null;

  const reports = JSON.parse(readFileSync(summaryPath, 'utf-8'));
  if (!Array.isArray(reports)) return null;

  // Aggregate time per module across recent days
  const aliases = Array.isArray(accountAliases) ? accountAliases : [accountAliases];
  let totalMin = 0;
  const modules = {};

  for (const report of reports.slice(-days)) {
    for (const [acct, data] of Object.entries(report.gaAccounts || {})) {
      const isMatch = aliases.some(a => acct.toLowerCase().includes(a.toLowerCase()));
      if (!isMatch) continue;
      totalMin += data.totalMin || 0;
      for (const [mod, min] of Object.entries(data.modules || {})) {
        modules[mod] = (modules[mod] || 0) + min;
      }
    }
  }

  return { totalMin, modules };
}

// ── Main ─────────────────────────────────────────────────────────────

/**
 * 生成诊断分析指令
 * @param {string} clientName - 客户名（对应 clients.json 的 key 或 Customer ID）
 * @param {object} adsData - 从 fetcher 拉取的数据（如果为空则从 snapshot 读取）
 * @param {object} options - { days: 7, savePrompt: true }
 */
export async function generateDiagnosis(clientName, adsData, options = {}) {
  const { days = 7, savePrompt = true } = options;

  // Load time tracker data
  const timeData = loadTimeData([clientName], days);

  // Load Bridge Marketing report data if exists
  let bridgeData = null;
  try {
    const { getClientReportSummary } = await import('../bridge-data/indexer.js');
    const { parsePlacementCsv, analyzePlacements } = await import('../bridge-data/parser.js');
    const summary = getClientReportSummary(clientName);
    if (summary) {
      bridgeData = { reportSummary: summary };
      // Parse CSV if available
      const csvFiles = summary.files?.filter(f => f.ext === '.csv') || [];
      if (csvFiles.length > 0) {
        const allPlacements = [];
        for (const csv of csvFiles) {
          allPlacements.push(...parsePlacementCsv(csv.path));
        }
        bridgeData.placementAnalysis = analyzePlacements(allPlacements);
      }
    }
  } catch {
    // Bridge data not available, continue without it
  }

  // Build prompt
  const prompt = buildDiagnosisPrompt(clientName, adsData, timeData, bridgeData);

  const date = new Date().toISOString().slice(0, 10);

  if (savePrompt) {
    const filename = `diagnosis-${clientName}-${date}.md`;
    const filepath = join(PROMPT_DIR, filename);
    writeFileSync(filepath, prompt);
    console.log(`📝 分析 prompt 已保存: ${filepath}`);
  }

  // Save analysis data alongside prompt for reference
  const clientDir = join(PROFILES_DIR, clientName, 'analyses');
  mkdirSync(clientDir, { recursive: true });
  writeFileSync(
    join(clientDir, `data-${date}.json`),
    JSON.stringify({ clientName, adsData, timeData, generatedAt: new Date().toISOString() }, null, 2)
  );

  return {
    prompt,
    promptFile: join(PROMPT_DIR, `diagnosis-${clientName}-${date}.md`),
    dataFile: join(clientDir, `data-${date}.json`),
  };
}
