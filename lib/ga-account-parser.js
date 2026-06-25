/**
 * Google Ads 账号名 + 模块名解析器
 * 从 Chrome 标签页标题中提取账号和模块
 *
 * 标题格式示例:
 *   "搜索字词 - vida.marketing.ai - Google Ads"
 *   "Campaigns - Flova-Bridge - Google Ads"
 *   "概览 - 123-456-7890 - Google Ads"
 */
export function parseGoogleAdsTitle(title) {
  if (!title) return null;

  // Pattern: "模块名 - 账号名 - Google Ads"
  let m = title.match(/^(.+?)\s*[-–—]\s*(.+?)\s*[-–—]\s*Google\s*Ads/i);
  let module, account;

  if (m) {
    module = m[1].trim();
    account = m[2].trim();
  } else {
    // Pattern: "账号名 - Google Ads" (no module)
    m = title.match(/^(.+?)\s*[-–—]\s*Google\s*Ads/i);
    if (m) {
      account = m[1].trim();
      module = '浏览';
    }
  }

  // Filter out noise
  if (account && account.length < 50 && !account.includes('High me') && !account.includes('High memory')) {
    return { account, module };
  }

  return null;
}

/**
 * 把模块名标准化为中文（Google Ads UI 里有中英文混用）
 */
export function normalizeModule(module) {
  const map = {
    'campaigns': '广告系列',
    'campaign': '广告系列',
    'ad groups': '广告组',
    'ads': '广告',
    'keywords': '关键字',
    'search terms': '搜索字词',
    'search keywords': '搜索广告关键字',
    'audiences': '受众群体',
    'locations': '地理位置',
    'ad schedule': '广告投放时间',
    'devices': '设备',
    'overview': '概览',
    'settings': '账号设置',
    'billing': '结算',
    'conversions': '转化操作',
    'reports': '报告编辑器',
    'recommendations': '优化建议',
    'asset groups': '素材资源组',
    'assets': '素材资源',
    'extensions': '附加信息',
    'change history': '更改历史',
  };
  const lower = module.toLowerCase().trim();
  return map[lower] || module;
}
