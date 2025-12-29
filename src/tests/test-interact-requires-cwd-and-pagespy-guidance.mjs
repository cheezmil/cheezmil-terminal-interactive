// interact_with_terminal 参数校验与长任务指导提示测试
// Tests: interact_with_terminal cwd requirement and long-task guidance prompt
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

async function testCwdRequired() {
  console.log('Testing: cwd is required...');
  const baseUrl = 'http://localhost:1106';
  const mcpUrl = new URL(`${baseUrl}/mcp`);
  const terminalId = `cwd-required-test-${Date.now()}`;

  const client = new Client({ name: 'cti-test-client', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(mcpUrl);
  await client.connect(transport);

  let sawExpected = false;
  try {
    const result = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'interact_with_terminal',
          arguments: {
            terminalId,
            input: 'echo hi',
            appendNewline: true,
            wait: { mode: 'idle', maxWaitMs: 1000 }
          }
        }
      },
      CallToolResultSchema
    );

    const text = (result.content || [])
      .filter((c) => c && c.type === 'text')
      .map((c) => c.text)
      .join('\n');
    if (result.isError && text.toLowerCase().includes('must provide cwd')) {
      sawExpected = true;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('must provide cwd')) {
      sawExpected = true;
    }
  } finally {
    await client.close();
  }

  if (!sawExpected) {
    throw new Error('Expected error message containing: must provide cwd');
  }
  console.log('OK: cwd required.');
}

async function testLongTaskGuidancePrompt() {
  console.log('Testing: long task guidance prompt...');
  const baseUrl = 'http://localhost:1106';
  const mcpUrl = new URL(`${baseUrl}/mcp`);
  const terminalId = `long-task-guidance-test-${Date.now()}`;

  const client = new Client({ name: 'cti-test-client', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(mcpUrl);
  await client.connect(transport);

  const result = await client.request(
    {
      method: 'tools/call',
      params: {
        name: 'interact_with_terminal',
        arguments: {
          terminalId,
          cwd: process.cwd(),
          input: 'python -m pip install -U some-package',
          appendNewline: true,
          wait: { mode: 'idle', maxWaitMs: 1500, includeIntermediateOutput: true }
        }
      }
    },
    CallToolResultSchema
  );

  const text = (result.content || [])
    .filter((c) => c && c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  if (!result.isError) {
    throw new Error('Expected isError=true for guidance blocking');
  }
  if (!text.includes('Detected a likely long-running command')) {
    throw new Error('Expected guidance prompt text for long-running command');
  }

  // Cleanup best-effort
  try {
    await client.request(
      {
        method: 'tools/call',
        params: { name: 'interact_with_terminal', arguments: { killTerminal: true, terminalId } }
      },
      CallToolResultSchema
    );
  } catch {
    // ignore
  }
  await client.close();

  console.log('OK: guidance prompt returned.');
}

async function run() {
  console.log('=== interact_with_terminal validation tests ===');
  await testCwdRequired();
  await testLongTaskGuidancePrompt();
  console.log('All validation tests passed.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
