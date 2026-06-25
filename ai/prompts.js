/**
 * AI 分析 prompt 模板
 * 这些 prompt 写给 Claude Code，让 Claude 直接分析数据
 */

function buildBridgeDataSection(clientName, bridgeData) {
  if (!bridgeData) return '';

  const lines = ['## Bridge Marketing 本地报告数据', ''];

  if (bridgeData.reportSummary) {
    const s = bridgeData.reportSummary;
    lines.push(`- 报告文件总数: ${s.fileCount}`);
    if (s.dateRange) lines.push(`- 时间跨度: ${s.dateRange.first} → ${s.dateRange.last}`);
    lines.push(`- 日报: ${s.types.daily || 0} | 周报: ${s.types.weekly || 0} | 月报: ${s.types.monthly || 0}`);
    lines.push('');
  }

  if (bridgeData.placementAnalysis) {
    const p = bridgeData.placementAnalysis;
    lines.push('### Placement 排除数据');
    lines.push(`- 排除记录: ${p.totalPlacements} 条`);
    lines.push(`- 浪费展示总数: ${p.totalWastedImpressions.toLocaleString()}`);
    lines.push('');
    if (p.topWasted && p.topWasted.length > 0) {
      lines.push('浪费最多的 Placement:');
      for (const w of p.topWasted.slice(0, 5)) {
        const name = w.placement.length > 30 ? w.placement.slice(0, 27) + '...' : w.placement;
        lines.push(`  - ${name}: ${w.impressions.toLocaleString()} 展示 (${w.campaign})`);
      }
      lines.push('');
    }
    if (p.byReason && p.byReason.length > 0) {
      lines.push('按原因:');
      for (const [reason, data] of p.byReason) {
        lines.push(`  - ${reason}: ${data.impressions.toLocaleString()} 展示`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * 单客户诊断 prompt
 */
export function buildDiagnosisPrompt(clientName, adsData, timeData, bridgeData) {
  return `# Google Ads 客户诊断 — ${clientName}

你是 Bridge Marketing 的 Google Ads 优化专家。请分析以下数据并给出诊断建议。

## 广告数据（Google Ads API）

${JSON.stringify(adsData.overview, null, 2)}

### Campaign 详情
${adsData.campaigns?.map(c =>
  `- ${c.campaignName} [${c.status}]: 花费 $${c.cost}, ${c.conversions} 转化, CPA $${c.cpa}, CTR ${(c.ctr*100).toFixed(2)}%, 日预算 $${c.dailyBudget}`
).join('\n')}

### 带来转化的关键词
${(adsData.topKeywords || []).map(k =>
  `- "${k.keyword}": ${k.conversions} 转化, CPA $${k.cpa}, Campaign: ${k.campaignName}`
).join('\n')}

### 花钱但零转化的关键词
${(adsData.deadKeywords || []).map(k =>
  `- "${k.keyword}": 花费 $${k.cost}, ${k.clicks} 点击, 0 转化`
).join('\n')}

### 每日趋势
${(adsData.dailyTrend || []).map(d => `- ${d.date}: 花费 $${d.cost.toFixed(2)}, ${d.conversions} 转化`).join('\n')}

## 时间追踪数据

${timeData ? `
最近 7 天在该客户投入: **${timeData.totalMin || 0}分钟**
${Object.entries(timeData.modules || {}).map(([mod, min]) => `- ${mod}: ${min}分钟`).join('\n')}
` : '(无时间追踪数据)'}

${buildBridgeDataSection(clientName, bridgeData)}

---

## 请给出以下格式的分析报告：

### 1. 核心发现
概要性总结，3-5 句话概括账户现状

### 2. 问题诊断
${'| 严重度 | 问题 | 证据 | 影响 |'}
${'|--------|------|------|------|'}
按 high/medium/low 优先级列出实际问题

### 3. 优化机会
${'| 优先级 | 机会 | 预期效果 | 操作难度 | 具体步骤 |'}
${'|--------|------|----------|----------|----------|'}
列出具体可执行的操作建议

### 4. 时间投入分析
- 哪些模块花时间多但效果不明显？
- 哪些模块值得投入更多时间？
- 未来一周时间分配建议

请确保每个建议都是具体的、可操作的（不要说"优化关键词"，要说"暂停 campaign X 中关键词 Y，因其花费 $Z 且零转化"）。
`;
}

/**
 * 周报总结 prompt
 */
export function buildWeeklyPrompt(reports) {
  return `# Google Ads 周报总结

以下是 ${reports.length} 个客户本周的数据摘要。请生成一份面向老板的周报。

${reports.map(r => `
## ${r.clientName}
- 花费: $${r.overview?.totalCost}
- 转化: ${r.overview?.totalConversions}
- CPA: $${r.overview?.avgCpa}
- 主要工作: ${r.timeSpent ? r.timeSpent + '分钟' : 'N/A'}
`).join('\n')}

## 请生成：

### 本周亮点
哪些客户表现突出，数据支撑

### 需关注项
哪些客户/账號需要特别注意

### 下周重点
建议的下周工作优先级

### 老板汇报版本（直接可复制发送）
3-5 段文字，专业但没有过多术语，适合发给非技术背景的老板。
`;
}
