/**
 * Google Ads OAuth2 token 管理
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DIR = join(homedir(), 'time-tracker');
const CONFIG_PATH = join(DIR, 'google-ads', 'config', 'google-ads.json');

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error('❌ 未配置 google-ads.json。请先运行 node google-ads/setup-auth.js');
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

export function saveRefreshToken(refreshToken) {
  const config = loadConfig();
  config.refresh_token = refreshToken;
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('✅ Refresh token 已保存');
}

/**
 * 用 refresh token 换新的 access token
 */
export async function getAccessToken() {
  const config = loadConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: config.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`OAuth 失败: ${data.error_description || data.error}`);
  return data.access_token;
}
