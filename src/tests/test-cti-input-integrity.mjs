/**
 * CTI input integrity regression test (PowerShell / Windows focused)
 * CTI 输入完整性回归测试（以 PowerShell / Windows 为主）
 *
 * Why / 背景：
 * - In some environments ConPTY may drop characters when writes are too bursty.
 *   某些环境下 ConPTY 在“突发写入”时可能会丢字符。
 * - This can look like: long/complex commands being truncated, `--` parameters missing,
 *   and prompt/echo being confusing when replaying logs.
 *   表现可能是：复杂命令被截断、`--` 参数丢失、回显与提示符混淆。
 *
 * This test validates that the full input reaches PowerShell and produces expected markers.
 * 本测试验证：完整输入能到达 PowerShell 并产出预期标记。
 */

import { TerminalManager } from '../../dist/terminal-manager.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cleanupStarted = false;
// On Windows, node-pty/ConPTY sometimes emits an EPIPE from an internal Worker during teardown.
// We treat it as a best-effort cleanup issue after assertions have passed.
// 在 Windows 上，node-pty/ConPTY 在退出清理阶段偶发从内部 Worker 抛出 EPIPE；
// 若断言已通过，则把它视为“清理阶段的非致命问题”。
process.on('uncaughtException', (err) => {
  if (cleanupStarted && err && err.code === 'EPIPE') {
    console.warn('[WARN] Ignoring EPIPE during terminal teardown.');
    process.exit(0);
  }
  throw err;
});

const assertIncludes = (haystack, needle, label) => {
  if (!String(haystack || '').includes(needle)) {
    const error = new Error(`Assertion failed: expected output to include "${needle}" (${label})`);
    error.output = haystack;
    throw error;
  }
};

const assertIncludesCaseInsensitive = (haystack, needle, label) => {
  const h = String(haystack || '').toLowerCase();
  const n = String(needle || '').toLowerCase();
  if (!h.includes(n)) {
    const error = new Error(`Assertion failed: expected output to include "${needle}" (case-insensitive) (${label})`);
    error.output = haystack;
    throw error;
  }
};

async function main() {
  if (process.platform !== 'win32') {
    console.log('SKIP: test-cti-input-integrity is Windows-focused (ConPTY).');
    return;
  }

  const repoRoot = process.cwd();

  const tm = new TerminalManager({
    maxBufferSize: 4000,
    sessionTimeout: 60_000
  });

  let terminalId = null;
  try {
    terminalId = await tm.createTerminal({
      shell: 'pwsh.exe',
      cwd: repoRoot
    });

    // Give PowerShell time to be ready.
    // 给 PowerShell 一点启动时间。
    await sleep(800);

    // A single call containing: semicolons, pipeline, loop, and a literal `--` marker.
    // 单次输入同时包含：分号、管道、循环、以及字面量 `--` 标记。
    const marker = `cti-integrity-${Date.now()}`;
    const cmd =
      `Write-Output '${marker}-A'; ` +
      `Write-Output 'ARG=--show-toplevel'; ` +
      `Write-Output (\"${marker}-CWD=\" + (Get-Location).Path); ` +
      `1..5 | ForEach-Object { Write-Output \"${marker}-N=$($_)\" }; ` +
      `for ($i = 0; $i -lt 3; $i++) { Write-Output \"${marker}-I=$i\" }; ` +
      // Optional external CLI checks (only if installed).
      // 可选外部命令检查（仅当已安装时执行）。
      `if (Get-Command git -ErrorAction SilentlyContinue) { git rev-parse --show-toplevel } else { Write-Output '${marker}-GIT-MISSING' }; ` +
      `if (Get-Command pnpm -ErrorAction SilentlyContinue) { pnpm --version } else { Write-Output '${marker}-PNPM-MISSING' }; ` +
      `Write-Output '${marker}-DONE'`;

    await tm.writeToTerminal({ terminalName: terminalId, input: cmd, appendNewline: true });
    await sleep(1200);

    const result = await tm.readFromTerminal({
      terminalName: terminalId,
      mode: 'tail',
      tailLines: 200,
      maxLines: 2000
    });

    const out = result.output || '';
    assertIncludes(out, `${marker}-A`, 'marker A');
    assertIncludes(out, 'ARG=--show-toplevel', 'double-dash marker');
    assertIncludesCaseInsensitive(out, `${marker}-CWD=${repoRoot}`, 'Get-Location cwd');
    assertIncludes(out, `${marker}-N=5`, 'pipeline output');
    assertIncludes(out, `${marker}-I=2`, 'for-loop output');

    // If git exists, validate that `--show-toplevel` survived and returned repoRoot.
    // 若 git 存在，则验证 `--show-toplevel` 未丢失并返回 repoRoot。
    if (!out.includes(`${marker}-GIT-MISSING`)) {
      assertIncludesCaseInsensitive(out, repoRoot, 'git rev-parse --show-toplevel');
    }

    // If pnpm exists, ensure it returned some version text instead of being mis-parsed.
    // 若 pnpm 存在，则确保能返回版本文本而不是被误解析。
    if (!out.includes(`${marker}-PNPM-MISSING`)) {
      const versionLine = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => /^[0-9]+\.[0-9]+(\.[0-9]+)?/.test(line));
      if (!versionLine) {
        const error = new Error('Assertion failed: expected a pnpm version-like line when pnpm exists');
        error.output = out;
        throw error;
      }
    }

    assertIncludes(out, `${marker}-DONE`, 'done marker');

    console.log('OK: CTI input integrity markers found.');
  } finally {
    if (terminalId) {
      cleanupStarted = true;
      await tm.killTerminal(terminalId, 'SIGTERM');
    }
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  if (err && err.output) {
    console.error('--- output ---');
    console.error(String(err.output));
    console.error('--- end output ---');
  }
  process.exit(1);
});
