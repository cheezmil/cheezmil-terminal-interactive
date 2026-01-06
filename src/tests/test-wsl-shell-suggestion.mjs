// wsl 前缀命令提示测试：应非报错地附加“建议用 wsl.exe 作为 shell”的英文提示
// Tests: WSL-prefix command notice should be attached (non-error) and recommend using wsl.exe as shell
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

function getText(result) {
  return (result.content || [])
    .filter((c) => c && c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

function getWarnings(result) {
  const warnings = result.structuredContent && Array.isArray(result.structuredContent.warnings)
    ? result.structuredContent.warnings
    : [];
  return warnings.filter((w) => typeof w === 'string');
}

async function callInteract(client, args) {
  return client.request(
    { method: 'tools/call', params: { name: 'interact_with_terminal', arguments: args } },
    CallToolResultSchema
  );
}

async function run() {
  console.log('=== WSL shell suggestion tests ===');
  const baseUrl = 'http://localhost:1106';
  const mcpUrl = new URL(`${baseUrl}/mcp`);
  const client = new Client({ name: 'cti-test-client', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(mcpUrl);
  await client.connect(transport);

  const terminalId1 = `wsl-suggest-default-${Date.now()}`;
  const terminalId2 = `wsl-suggest-wsl-shell-${Date.now()}`;
  const expectedTip =
    'Tip: Detected a command starting with "wsl". Strongly recommended: set `shell: "wsl.exe"` when creating the terminal (instead of prefixing every command with `wsl ...`).';

  try {
    console.log('Case 1: default shell + wsl-prefixed input => tip should appear');
    const r1 = await callInteract(client, {
      terminalId: terminalId1,
      cwd: process.cwd(),
      input: 'wsl --help',
      appendNewline: true,
      wait: { mode: 'idle', maxWaitMs: 800, includeIntermediateOutput: true }
    });
    const text1 = getText(r1);
    const warnings1 = getWarnings(r1);
    if (r1.isError === true) {
      throw new Error('Expected isError=false when attaching WSL suggestion tip.');
    }
    if (!text1.includes(expectedTip)) {
      throw new Error('Expected WSL suggestion tip to appear in text response.');
    }
    if (!warnings1.includes(expectedTip)) {
      throw new Error('Expected WSL suggestion tip to appear in structured warnings.');
    }
    console.log('OK: tip attached for wsl-prefixed input on non-wsl.exe shell.');

    console.log('Case 2: shell=wsl.exe + wsl-prefixed input => tip should NOT appear');
    const r2 = await callInteract(client, {
      terminalId: terminalId2,
      cwd: process.cwd(),
      shell: 'wsl.exe',
      input: 'wsl --help',
      appendNewline: true,
      wait: { mode: 'idle', maxWaitMs: 800, includeIntermediateOutput: true }
    });
    const text2 = getText(r2);
    const warnings2 = getWarnings(r2);
    if (text2.includes(expectedTip) || warnings2.includes(expectedTip)) {
      throw new Error('Expected no WSL suggestion tip when the terminal shell is already wsl.exe.');
    }
    console.log('OK: tip suppressed when shell is wsl.exe.');
  } finally {
    // Cleanup best-effort / 清理（尽力而为）
    for (const terminalId of [terminalId1, terminalId2]) {
      try {
        await callInteract(client, { killTerminal: true, terminalId });
      } catch {
        // ignore
      }
    }
    await client.close();
  }

  console.log('All WSL suggestion tests passed.');
}

run().catch((e) => {
  console.error('WSL suggestion tests failed:', e);
  process.exit(1);
});

