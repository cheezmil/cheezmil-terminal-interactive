import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Lightweight static checks for the frontend auto-scroll feature /
// 前端“自动滚动到底部”功能的轻量静态校验（不依赖浏览器环境）

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

try {
  mustInclude('frontend/src/stores/terminal.ts', [
    'terminalAutoScroll',
    'getTerminalAutoScroll',
    'setTerminalAutoScroll',
    'ensureTerminalAutoScroll',
  ]);

  mustInclude('frontend/src/views/HomeView.vue', [
    'writeToXterm',
    'activeTerminalAutoScroll',
    "t('home.autoScrollToBottom')",
  ]);

  mustInclude('frontend/src/views/SettingsView.vue', [
    'autoScrollToBottomByDefault',
    "t('settings.autoScrollToBottomDefault')",
  ]);

  mustJsonHave('frontend/src/i18n/locales/en.json', 'home.autoScrollToBottom');
  mustJsonHave('frontend/src/i18n/locales/zh.json', 'home.autoScrollToBottom');
  mustJsonHave('frontend/src/i18n/locales/en.json', 'settings.autoScrollToBottomDefault');
  mustJsonHave('frontend/src/i18n/locales/zh.json', 'settings.autoScrollToBottomDefault');

  console.log('[OK] frontend auto-scroll feature static checks passed');
  process.exit(0);
} catch (error) {
  console.error('[FAIL] frontend auto-scroll feature static checks failed');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
}

