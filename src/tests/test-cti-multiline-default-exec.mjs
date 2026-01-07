/**
 * CTI multi-line default execution regression test (PowerShell / Windows focused)
 * CTI 多行输入默认执行回归测试（以 PowerShell / Windows 为主）
 *
 * Why / 背景：
 * - When sending multi-line input into a PTY, if the final line is not terminated by Enter,
 *   the last line may never execute (common when the caller omits appendNewline).
 * - We want a safer default: for normal shells, auto-append a final Enter for multi-line input;
 *   but for interactive TUIs/fullscreen apps we avoid auto-append.
 *
 * 本测试验证：
 * - 未显式传 appendNewline 时，多行输入在普通 PowerShell 场景下也能完整执行（至少最后一行能执行）。
 */

import { TerminalManager } from '../../dist/terminal-manager.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cleanupStarted = false;
// On Windows, node-pty/ConPTY sometimes emits an EPIPE from an internal Worker during teardown.
// We treat it as a best-effort cleanup issue after assertions have passed.
// 在 Windows 上，node-pty/ConPTY 在退出清理阶段偶发从内部 Worker 抛出 EPIPE；
// 若断言已通过，则把它视为“清理阶段的非致命问题”。
process.on('uncaughtException', (err) => {
  const msg = String(err?.message || '');
  if (cleanupStarted && err && (err.code === 'EPIPE' || msg.includes('AttachConsole failed'))) {
    console.warn('[WARN] Ignoring known teardown error:', msg || err.code);
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

async function main() {
  if (process.platform !== 'win32') {
    console.log('SKIP: test-cti-multiline-default-exec is Windows-focused.');
    return;
  }

  const repoRoot = process.cwd();

  const tm = new TerminalManager({
    maxBufferSize: 6000,
    sessionTimeout: 60_000
  });

  let terminalId = null;
  const totalTimeout = setTimeout(() => {
    console.error('FAIL: test timeout (30s).');
    process.exit(2);
  }, 30_000);

  try {
    terminalId = await tm.createTerminal({
      shell: 'pwsh.exe',
      cwd: repoRoot
    });

    // Give PowerShell time to be ready. / 给 PowerShell 一点启动时间。
    await sleep(800);

    const marker = `cti-multiline-${Date.now()}`;

    // Multi-line input WITHOUT final newline (no trailing Enter).
    // 多行输入：末尾没有换行（不带最终回车）。
    const cmd =
      `Write-Output '${marker}-L1'\n` +
      `Write-Output '${marker}-L2'\n` +
      `Write-Output '${marker}-DONE'`;

    // Intentionally omit appendNewline to validate the default behavior.
    // 故意不传 appendNewline，验证默认行为是否会补最终回车。
    await tm.writeToTerminal({ terminalName: terminalId, input: cmd });

    await sleep(1200);

    const result = await tm.readFromTerminal({
      terminalName: terminalId,
      mode: 'tail',
      tailLines: 120,
      maxLines: 1200
    });

    const out = result.output || '';
    assertIncludes(out, `${marker}-L1`, 'line 1 executed');
    assertIncludes(out, `${marker}-L2`, 'line 2 executed');
    assertIncludes(out, `${marker}-DONE`, 'final line executed (auto-append Enter)');

    console.log('OK: multi-line default execution marker found.');
  } finally {
    clearTimeout(totalTimeout);

    // Cleanup should be best-effort and MUST NOT hang CI/manual runs on Windows.
    // 清理阶段尽力而为，且绝不能在 Windows 上导致测试卡死。
    const cleanupTimeout = setTimeout(() => {
      console.warn('[WARN] Cleanup timeout, force exit 0.');
      process.exit(0);
    }, 8000);

    if (terminalId) {
      cleanupStarted = true;
      // Prefer graceful exit to avoid noisy ConPTY process-list agent failures on some setups.
      // 优先使用 exit 进行“自然退出”，避免部分环境下 ConPTY 进程列表探测产生 AttachConsole failed 噪音。
      try {
        await tm.writeToTerminal({ terminalName: terminalId, input: 'exit', appendNewline: true });
      } catch {
        // ignore
      }

      // Wait briefly for PTY to exit / 等待 PTY 退出
      const waitStart = Date.now();
      while (Date.now() - waitStart < 7000) {
        let info = null;
        try {
          info = tm.getTerminalInfo(terminalId);
        } catch {
          info = null;
        }
        if (!info || info.status !== 'active') {
          break;
        }
        await sleep(150);
      }

      // NOTE: do NOT call killTerminal here; killing ConPTY may spawn a helper process that can be noisy on some Windows setups.
      // 注意：这里不要调用 killTerminal；ConPTY 的 kill 可能会拉起辅助进程并在部分 Windows 环境产生噪音。
    }

    clearTimeout(cleanupTimeout);
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
