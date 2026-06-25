#!/usr/bin/env node
/**
 * Google Ads OAuth 引导授权
 * 用法: node google-ads/setup-auth.js
 *
 * 前提: 已在 Google Cloud Console 创建 OAuth 桌面应用，
 *       google-ads/config/google-ads.json 已填入 client_id 和 client_secret
 */
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import open from 'open';

const DIR = join(homedir(), 'time-tracker');
const CONFIG_PATH = join(DIR, 'google-ads', 'config', 'google-ads.json');
const CONFIG_DIR = join(DIR, 'google-ads', 'config');

// Ensure directory exists
mkdirSync(CONFIG_DIR, { recursive: true });

// Read or create config
let config;
if (existsSync(CONFIG_PATH)) {
  config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
} else {
  console.log('📝 创建 google-ads.json 配置模板...\n');
  config = { developer_token: '', client_id: '', client_secret: '', refresh_token: '' };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Check prerequisites
if (!config.client_id || !config.client_secret) {
  console.log('❌ 请先在 google-ads/config/google-ads.json 填入 client_id 和 client_secret\n');
  console.log('   获取方式:');
  console.log('   1. 打开 https://console.cloud.google.com/apis/credentials');
  console.log('   2. 创建 OAuth 2.0 客户端 ID → 桌面应用');
  console.log('   3. 下载 JSON，把 client_id 和 client_secret 填入配置文件');
  process.exit(1);
}

const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

// Build auth URL
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', config.client_id);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/adwords');
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

console.log('🔐 打开浏览器进行 Google Ads 授权...\n');
console.log(`如果浏览器没自动打开，请手动访问:\n${authUrl.toString()}\n`);

open(authUrl.toString());

// Local server to catch redirect
const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');

  if (!code) {
    res.end('未收到授权码，请重试。');
    return;
  }

  // Exchange code for refresh token
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.client_id,
        client_secret: config.client_secret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const data = await tokenRes.json();

    if (data.error) {
      res.end(`❌ 授权失败: ${data.error_description || data.error}`);
      server.close();
      process.exit(1);
    }

    config.refresh_token = data.refresh_token;
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

    res.end('✅ 授权成功！可以关闭此页面，回到终端继续。');
    console.log('✅ OAuth 授权完成，refresh token 已保存到 google-ads.json\n');
    console.log('接下来请编辑 google-ads/config/google-ads.json，填入:\n');
    console.log('  - developer_token: Google Ads API Center 获取');
    console.log('  - login_customer_id: MCC 账号的 10 位 ID（可选，填了不用每次输）\n');
    console.log('然后运行 node google-ads/diagnose.js <客户ID> 测试');
    server.close();
    process.exit(0);
  } catch (e) {
    res.end(`❌ 错误: ${e.message}`);
    server.close();
    process.exit(1);
  }
});

server.listen(REDIRECT_PORT, () => {
  console.log(`⏳ 等待授权回调 (端口 ${REDIRECT_PORT})...\n`);
});
