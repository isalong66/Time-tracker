/**
 * 客户档案管理 — 创建、读取、更新
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DIR = join(homedir(), 'time-tracker');
const REGISTRY_PATH = join(DIR, 'profiles', 'registry.json');
const PROFILES_DIR = join(DIR, 'profiles');

export function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return {};
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
}

function saveRegistry(reg) {
  mkdirSync(PROFILES_DIR, { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

export function createProfile({ key, name, customerId, aliases = [], notes = '' }) {
  const reg = loadRegistry();
  if (reg[key]) throw new Error(`客户 "${key}" 已存在`);

  reg[key] = { name, customerId, aliases, notes, createdAt: new Date().toISOString().slice(0, 10) };
  saveRegistry(reg);

  // Scaffold directories
  const dir = join(PROFILES_DIR, key);
  for (const sub of ['snapshots', 'analyses', 'actions']) {
    mkdirSync(join(dir, sub), { recursive: true });
  }

  // Create profile.json
  writeFileSync(join(dir, 'profile.json'), JSON.stringify({
    ...reg[key],
    snapshots: [],
    analyses: [],
    openActions: [],
  }, null, 2));

  console.log(`✅ 客户档案已创建: profiles/${key}/`);
  return reg[key];
}

export function getProfile(key) {
  const reg = loadRegistry();
  if (!reg[key]) return null;
  const profilePath = join(PROFILES_DIR, key, 'profile.json');
  if (!existsSync(profilePath)) return reg[key];
  return JSON.parse(readFileSync(profilePath, 'utf-8'));
}

export function listProfiles() {
  const reg = loadRegistry();
  return Object.entries(reg).map(([key, info]) => {
    const profile = getProfile(key);
    const dir = join(PROFILES_DIR, key, 'analyses');
    const analysisFiles = existsSync(dir) ? readdirSync(dir).filter(f => f.startsWith('data-')) : [];
    return {
      key,
      name: info.name,
      customerId: info.customerId,
      lastAnalyzed: analysisFiles.length > 0 ? analysisFiles.sort().reverse()[0].replace('data-', '').replace('.json', '') : null,
      analysisCount: analysisFiles.length,
      createdAt: info.createdAt,
    };
  });
}

export function loadTimeTrackerAliases(key) {
  const profile = getProfile(key);
  return profile?.aliases || [profile?.name] || [];
}
