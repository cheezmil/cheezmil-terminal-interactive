/**
 * Validate PowerShell continuation prompt detection.
 * 验证 PowerShell 续行提示符（>>）检测逻辑。
 *
 * Why: When a command is truncated or has unclosed quotes/braces, PowerShell enters continuation mode
 * and shows ">>", which looks like a hang. The backend should detect this as "awaiting input".
 *
 * 原因：当命令被截断或引号/括号未闭合时，PowerShell 会进入续行模式并显示 ">>"，
 * 这在表象上类似“卡死”。后端需要将其识别为“正在等待输入”。
 */

import { TerminalManager } from '../../dist/terminal-manager.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cleanupStarted = false;

// On Windows, node-pty/ConPTY sometimes emits an EPIPE from an internal Worker during teardown.
// We treat it as a best-effort cleanup issue after the assertion has passed.
// 在 Windows 上，node-pty/ConPTY 在退出清理阶段偶发从内部 Worker 抛出 EPIPE；
// 若断言已通过，则把它视为“清理阶段的非致命问题”。
process.on('uncaughtException', (err) => {
  if (cleanupStarted && err && err.code === 'EPIPE') {
    console.warn('[WARN] Ignoring EPIPE during terminal teardown.');
    process.exit(0);
  }
  throw err;
});

async function main() {
  if (process.platform !== 'win32') {
    console.log('[SKIP] This test is Windows-only (PowerShell continuation prompt).');
    return;
  }

  const tm = new TerminalManager({
    maxBufferSize: 2000,
    sessionTimeout: 60_000
  });

  let terminalId = null;
  try {
    terminalId = await tm.createTerminal({
      shell: 'pwsh.exe'
      // terminalName intentionally omitted: should auto-generate a readable unique name.
      // 故意不传 terminalName：应自动生成可读且唯一的名称。
    });
    if (/^[0-9a-f]{8}-/i.test(terminalId) || !terminalId.startsWith('term-')) {
      throw new Error(`Expected a readable non-UUID terminalName (startsWith "term-"), got "${terminalId}".`);
    }

    // Intentionally send an unterminated string to trigger the continuation prompt (>>).
    // 故意发送未闭合的字符串，引发续行提示符（>>）。
    await tm.writeToTerminal({
      terminalName: terminalId,
      input: 'Write-Output "hello',
      appendNewline: true
    });

    await sleep(600);

    const awaiting = tm.isTerminalAwaitingInput(terminalId);
    if (!awaiting) {
      throw new Error(`Expected awaitingInput=true after PowerShell continuation prompt, got false (terminalId=${terminalId}).`);
    }

    console.log('[OK] PowerShell continuation prompt detected as awaiting input.');
  } finally {
    cleanupStarted = true;
    try {
      if (terminalId) await tm.killTerminal(terminalId, 'SIGTERM');
    } catch {
      // Best-effort cleanup.
      // 尽力清理即可。
    }
    await sleep(300);
    await tm.shutdown();
  }
}

main().catch((err) => {
  console.error('[FAIL]', err && err.stack ? err.stack : String(err));
  process.exit(1);
});
