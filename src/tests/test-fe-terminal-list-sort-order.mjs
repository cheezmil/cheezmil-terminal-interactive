import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Lightweight static checks for the frontend terminal list sort-order feature /
// 前端“终端列表排序方式”功能的轻量静态校验（不依赖浏览器环境）

const repoRoot = path.resolve(process.cwd());

const mustInclude = (filePath, needles) => {
  const abs = path.resolve(repoRoot, filePath);
  const content = fs.readFileSync(abs, 'utf8');
  const missing = needles.filter((n) => !content.includes(n));
  if (missing.length > 0) {
    throw new Error(`Missing in ${filePath}: ${missing.join(', ')}`);
  }
};

const mustJsonHave = (filePath, jsonPath) => {
  const abs = path.resolve(repoRoot, filePath);
  const obj = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const parts = jsonPath.split('.');
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object' || !(p in cur)) {
      throw new Error(`Missing JSON path ${jsonPath} in ${filePath}`);
    }
    cur = cur[p];
  }
};

const mustYamlInclude = (filePath, needles) => {
  const abs = path.resolve(repoRoot, filePath);
  const content = fs.readFileSync(abs, 'utf8');
  const missing = needles.filter((n) => !content.includes(n));
  if (missing.length > 0) {
    throw new Error(`Missing in ${filePath}: ${missing.join(', ')}`);
  }
};

try {
  mustInclude('frontend/src/views/HomeView.vue', [
    'terminalListSortOrder',
    'getTerminalCreatedTime',
    "terminalListSortOrder.value === 'oldest'",
  ]);

  mustInclude('frontend/src/views/SettingsView.vue', [
    'terminalListSortOrder',
    "v-model=\"configData.terminal.terminalListSortOrder\"",
    "'newest'",
    "'oldest'",
  ]);

  mustJsonHave('frontend/src/i18n/locales/en.json', 'settings.terminalListSortOrder');
  mustJsonHave('frontend/src/i18n/locales/en.json', 'settings.terminalListSortOrderDescription');
  mustJsonHave('frontend/src/i18n/locales/en.json', 'settings.terminalListSortOrderNewest');
  mustJsonHave('frontend/src/i18n/locales/en.json', 'settings.terminalListSortOrderOldest');

  mustJsonHave('frontend/src/i18n/locales/zh.json', 'settings.terminalListSortOrder');
  mustJsonHave('frontend/src/i18n/locales/zh.json', 'settings.terminalListSortOrderDescription');
  mustJsonHave('frontend/src/i18n/locales/zh.json', 'settings.terminalListSortOrderNewest');
  mustJsonHave('frontend/src/i18n/locales/zh.json', 'settings.terminalListSortOrderOldest');

  mustYamlInclude('config.yml', ['terminalListSortOrder']);
  mustYamlInclude('config.example.yml', ['terminalListSortOrder']);

  console.log('[OK] frontend terminal list sort-order static checks passed');
  process.exit(0);
} catch (error) {
  console.error('[FAIL] frontend terminal list sort-order static checks failed');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
}

