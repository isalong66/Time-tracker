/**
 * Bridge Marketing CSV 解析器
 * 从 placement exclusion CSV 中提取结构化数据
 */
import { readFileSync, existsSync } from 'fs';

/**
 * Parse placement exclusion CSV
 *
 * CSV format:
 *   展示位置,展示位置网址,类型,投放网络,广告系列,展示次数,排除原因/建议
 *
 * Returns array of { placement, url, type, network, campaign, impressions, reason }
 */
export function parsePlacementCsv(filePath) {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    // Handle quoted fields
    const cells = parseCSVLine(lines[i]);
    if (cells.length < 7) continue;

    const row = {
      placement: cells[0]?.replace(/^"|"$/g, '') || '',
      url: cells[1]?.replace(/^"|"$/g, '') || '',
      type: cells[2] || '',
      network: cells[3] || '',
      campaign: cells[4] || '',
      impressions: parseInt(cells[5]) || 0,
      reason: cells[6] || '',
    };

    if (row.impressions > 0) results.push(row);
  }

  return results;
}

/**
 * Simple CSV line parser (handles quotes)
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse placement TXT file (URLs only, one per line)
 */
export function parsePlacementTxt(filePath) {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  return content.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

/**
 * Analyze placement data for insights
 */
export function analyzePlacements(placements) {
  if (placements.length === 0) return null;

  // Aggregate by campaign
  const byCampaign = {};
  for (const p of placements) {
    if (!byCampaign[p.campaign]) byCampaign[p.campaign] = { impressions: 0, count: 0, placements: [] };
    byCampaign[p.campaign].impressions += p.impressions;
    byCampaign[p.campaign].count++;
    byCampaign[p.campaign].placements.push(p);
  }

  // Aggregate by type
  const byType = {};
  for (const p of placements) {
    if (!byType[p.type]) byType[p.type] = { impressions: 0, count: 0 };
    byType[p.type].impressions += p.impressions;
    byType[p.type].count++;
  }

  // Aggregate by reason
  const byReason = {};
  for (const p of placements) {
    if (!byReason[p.reason]) byReason[p.reason] = { impressions: 0, count: 0 };
    byReason[p.reason].impressions += p.impressions;
    byReason[p.reason].count++;
  }

  // Top wasted placements
  const topWasted = [...placements].sort((a, b) => b.impressions - a.impressions).slice(0, 10);

  const totalImpressions = placements.reduce((s, p) => s + p.impressions, 0);

  return {
    totalPlacements: placements.length,
    totalWastedImpressions: totalImpressions,
    byCampaign: Object.entries(byCampaign).sort((a, b) => b[1].impressions - a[1].impressions),
    byType: Object.entries(byType).sort((a, b) => b[1].impressions - a[1].impressions),
    byReason: Object.entries(byReason).sort((a, b) => b[1].impressions - a[1].impressions),
    topWasted,
  };
}
