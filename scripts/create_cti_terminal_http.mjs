/**
 * Create CTI terminal via backend HTTP API / 通过后端HTTP API创建CTI终端
 *
 * Why / 为什么：
 * - Project rule forbids using CTI tool to run commands/scripts (this repo is CTI itself).
 *   本项目禁止用CTI工具执行脚本/命令（会自冲突），因此用HTTP API创建终端等价替代。
 *
 * Usage / 用法：
 * - node scripts/create_cti_terminal_http.mjs --name codex-style-check --cwd "D:\\CodeRelated\\cheezmil-terminal-interactive" --shell pwsh.exe
 */

import process from 'node:process';

function getArgValue(flag, defaultValue) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return defaultValue;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith('--')) return defaultValue;
  return value;
}

function formatTimestampForName(date = new Date()) {
  const pad2 = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function main() {
  const name =
    getArgValue('--name', '') ||
    `cti-style-check-${formatTimestampForName()}`;

  const cwd = getArgValue('--cwd', process.cwd());
  const shell = getArgValue('--shell', 'pwsh.exe');
  const apiBase = getArgValue('--api', 'http://localhost:1106');

  const url = new URL('/api/terminals', apiBase).toString();
  const payload = { terminalName: name, cwd, shell };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    // Terminal output should be English only / 终端输出仅英文
    process.stderr.write(`Failed to create terminal (${response.status}): ${text}\n`);
    process.exit(1);
  }

  process.stdout.write(`${text}\n`);
}

main().catch((error) => {
  process.stderr.write(`Unexpected error: ${error?.stack || error}\n`);
  process.exit(1);
});

