// MCP客户端连通性测试 / MCP Client Connectivity Test
import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';

// 测试后端API连通性 / Test backend API connectivity
async function testBackendConnectivity() {
  console.log('Testing backend connectivity...');
  
  try {
    // 使用curl测试后端API / Use curl to test backend API
    const curl = spawn('curl', ['-s', 'http://localhost:1106/api/terminals']);
    
    let data = '';
    curl.stdout.on('data', (chunk) => {
      data += chunk;
    });
    
    curl.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Backend API is accessible');
        console.log('Response:', data);
      } else {
        console.log('❌ Backend API is not accessible');
      }
    });
    
    curl.stderr.on('data', (data) => {
      console.error('Error:', data.toString());
    });
  } catch (error) {
    console.error('Error testing backend:', error);
  }
}

// 注意：禁止在测试里触发“命令黑名单”相关逻辑，因为黑名单命令可能具有危险性。
// Note: Do NOT test command blacklist behavior here because blacklisted commands may be dangerous.

// 测试交互式终端提示：不应作为 Error 返回 / Test interactive-terminal notice: must NOT be returned as Error
async function testInteractiveTerminalNotice() {
  console.log('Testing interactive terminal notice...');

  const baseUrl = 'http://localhost:1106';
  const mcpUrl = new URL(`${baseUrl}/mcp`);

  const terminalId = `interactive-test-${Date.now()}`;

  try {
    const client = new Client({ name: 'cti-test-client', version: '1.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(mcpUrl);
    await client.connect(transport);

    // 先启动一个短暂的长任务，让终端处于“正在运行”状态 / Start a short long-running task to put terminal in "running" state
    await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'interact_with_terminal',
          arguments: {
            terminalId,
            input: 'Start-Sleep -Seconds 5',
            appendNewline: true,
            wait: { mode: 'none', maxWaitMs: 0 }
          }
        }
      },
      CallToolResultSchema
    );

    // 紧接着发送“新命令执行”，应返回提示而不是 error / Immediately send a "new command execution", should return a notice (not error)
    const result = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'interact_with_terminal',
          arguments: {
            terminalId,
            input: 'Get-Date',
            appendNewline: true,
            wait: { mode: 'none', maxWaitMs: 0 }
          }
        }
      },
      CallToolResultSchema
    );

    const textBlock = (result.content || []).find((c) => c.type === 'text');
    const text = textBlock && typeof textBlock.text === 'string' ? textBlock.text : '';
    const expected = '该终端进入了交互式终端，请根据终端内容做出合理行动';
    const warnings = result.structuredContent && Array.isArray(result.structuredContent.warnings) ? result.structuredContent.warnings : [];
    const inputEcho = result.structuredContent && typeof result.structuredContent.input === 'string' ? result.structuredContent.input : '';

    if (result.isError === true) {
      console.log('❌ Interactive notice incorrectly returned as error');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else if (!text.includes(expected)) {
      console.log('❌ Interactive notice message missing from text response');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else if (!warnings.includes(expected)) {
      console.log('❌ Interactive notice missing from structured warnings');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else if (!inputEcho.includes('Get-Date')) {
      console.log('❌ Interactive notice returned but input was not processed');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('✅ Interactive notice attached and input processed (expected)');
    }

    // Cleanup: terminate the test terminal / 清理：终止测试终端
    await client
      .request(
        {
          method: 'tools/call',
          params: {
            name: 'interact_with_terminal',
            arguments: { killTerminal: true, terminalId }
          }
        },
        CallToolResultSchema
      )
      .catch(() => {});

    await transport.close();
  } catch (error) {
    console.log(`⚠️ Interactive notice test skipped/failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 测试 wait=idle + delta：新建终端执行 echo hello 应能稳定捕获输出
// Test wait=idle + delta: new terminal running echo hello should reliably capture output
async function testWaitIdleDeltaEchoHello() {
  console.log('Testing wait=idle + delta (echo hello)...');

  const baseUrl = 'http://localhost:1106';
  const mcpUrl = new URL(`${baseUrl}/mcp`);
  const terminalId = `wait-delta-test-${Date.now()}`;

  try {
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
            input: 'echo hello',
            appendNewline: true,
            wait: { mode: 'idle', maxWaitMs: 3000, idleMs: 400 }
          }
        }
      },
      CallToolResultSchema
    );

    const structured = result.structuredContent || {};
    const output = typeof structured.commandOutput === 'string' ? structured.commandOutput : '';
    const delta = structured.delta && typeof structured.delta.text === 'string' ? structured.delta.text : '';
    const waitInfo = structured.wait || {};

    if (result.isError === true) {
      console.log('❌ wait/delta echo test returned error');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else if (!output.toLowerCase().includes('hello') && !delta.toLowerCase().includes('hello')) {
      console.log('❌ echo output missing (expected to capture "hello")');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else if (!waitInfo || typeof waitInfo.mode !== 'string' || typeof waitInfo.maxWaitMs !== 'number') {
      console.log('❌ wait info missing from structuredContent');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('✅ wait=idle returned with delta/output (expected)');
    }

    // Cleanup: terminate the test terminal / 清理：终止测试终端
    await client
      .request(
        {
          method: 'tools/call',
          params: {
            name: 'interact_with_terminal',
            arguments: { killTerminal: true, terminalId }
          }
        },
        CallToolResultSchema
      )
      .catch(() => {});

    await transport.close();
  } catch (error) {
    console.log(`⚠️ wait/delta echo test skipped/failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 测试 wait 超时：必须按模式返回结果，而不是报错 / Test wait timeout: must return mode-shaped result, not an error
async function testWaitTimeoutReturnsResult() {
  console.log('Testing wait timeout returns structured result...');

  const baseUrl = 'http://localhost:1106';
  const mcpUrl = new URL(`${baseUrl}/mcp`);
  const terminalId = `wait-timeout-test-${Date.now()}`;

  try {
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
            input: 'echo timeout-test',
            appendNewline: true,
            wait: { mode: 'pattern', maxWaitMs: 300, pattern: 'THIS_WILL_NOT_MATCH', patternRegex: false, includeIntermediateOutput: true }
          }
        }
      },
      CallToolResultSchema
    );

    const structured = result.structuredContent || {};
    const kind = structured.kind;
    const waitInfo = structured.wait || {};

    if (result.isError === true) {
      console.log('❌ wait timeout incorrectly returned as error');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else if (kind !== 'wait_timeout') {
      console.log('❌ expected kind=wait_timeout when reaching maxWaitMs');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else if (waitInfo.reason !== 'timeout') {
      console.log('❌ expected wait.reason=timeout');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('✅ wait timeout returned structured result (expected)');
    }

    // Cleanup: terminate the test terminal / 清理：终止测试终端
    await client
      .request(
        {
          method: 'tools/call',
          params: {
            name: 'interact_with_terminal',
            arguments: { killTerminal: true, terminalId }
          }
        },
        CallToolResultSchema
      )
      .catch(() => {});

    await transport.close();
  } catch (error) {
    console.log(`⚠️ wait timeout test skipped/failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 测试渐进式 maxWaitMs：首次禁止直接 >60s；8 次 <=60s 后允许 / Test progressive maxWaitMs: block >60s initially; allow after 8 <=60s attempts
async function testProgressiveMaxWaitPolicy() {
  console.log('Testing progressive maxWaitMs policy...');

  const baseUrl = 'http://localhost:1106';
  const mcpUrl = new URL(`${baseUrl}/mcp`);
  const terminalId = `progressive-wait-test-${Date.now()}`;
  const marker = `progressive-marker-${Date.now()}`;

  try {
    const client = new Client({ name: 'cti-test-client', version: '1.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(mcpUrl);
    await client.connect(transport);

    // 1) 首次直接请求 >60s：应被拒绝且不执行写入 / First >60s request should be rejected and must not execute write
    const blocked = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'interact_with_terminal',
          arguments: {
            terminalId,
            input: `echo ${marker}`,
            appendNewline: true,
            wait: { mode: 'idle', maxWaitMs: 120000, idleMs: 200 }
          }
        }
      },
      CallToolResultSchema
    );

    const blockedStructured = blocked.structuredContent || {};
    if (blocked.isError === true) {
      console.log('❌ progressive policy incorrectly returned as error');
      console.log('Result:', JSON.stringify(blocked, null, 2));
    } else if (blockedStructured.kind !== 'progressive_wait_required') {
      console.log('❌ expected kind=progressive_wait_required for initial >60s request');
      console.log('Result:', JSON.stringify(blocked, null, 2));
    } else {
      // 读一下输出，确认 marker 没被执行（best-effort） / Read output to ensure marker wasn't executed (best-effort)
      const readBack = await client.request(
        {
          method: 'tools/call',
          params: { name: 'interact_with_terminal', arguments: { terminalId, wait: { mode: 'idle', maxWaitMs: 1500 } } }
        },
        CallToolResultSchema
      );
      const readStructured = readBack.structuredContent || {};
      const out = typeof readStructured.commandOutput === 'string' ? readStructured.commandOutput : '';
      if (out.includes(marker)) {
        console.log('❌ marker appeared in output; write may have executed unexpectedly');
        console.log('Result:', JSON.stringify(readBack, null, 2));
      } else {
        console.log('✅ initial >60s request blocked (expected)');
      }
    }

    // 2) 连续 8 次 <=60s 的等待尝试（含写入），之后应允许 >60s / Do 8 <=60s attempts (with writes), then >60s should be allowed
    for (let i = 0; i < 8; i++) {
      await client.request(
        {
          method: 'tools/call',
          params: {
            name: 'interact_with_terminal',
            arguments: {
              terminalId,
              input: `echo short-attempt-${i}`,
              appendNewline: true,
              wait: { mode: 'idle', maxWaitMs: 500, idleMs: 200 }
            }
          }
        },
        CallToolResultSchema
      );
    }

    const allowed = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'interact_with_terminal',
          arguments: {
            terminalId,
            input: 'echo long-wait-allowed',
            appendNewline: true,
            wait: { mode: 'idle', maxWaitMs: 120000, idleMs: 200 }
          }
        }
      },
      CallToolResultSchema
    );

    const allowedStructured = allowed.structuredContent || {};
    if (allowed.isError === true) {
      console.log('❌ long-wait allowed case returned error');
      console.log('Result:', JSON.stringify(allowed, null, 2));
    } else if (allowedStructured.kind === 'progressive_wait_required') {
      console.log('❌ expected long-wait to be allowed after 8 short attempts');
      console.log('Result:', JSON.stringify(allowed, null, 2));
    } else {
      console.log('✅ long-wait allowed after progressive attempts (expected)');
    }

    // Cleanup: terminate the test terminal / 清理：终止测试终端
    await client
      .request(
        {
          method: 'tools/call',
          params: {
            name: 'interact_with_terminal',
            arguments: { killTerminal: true, terminalId }
          }
        },
        CallToolResultSchema
      )
      .catch(() => {});

    await transport.close();
  } catch (error) {
    console.log(`⚠️ progressive wait policy test skipped/failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}


// 运行所有测试 / Run all tests
async function runTests() {
  console.log('=== MCP Client Connectivity Tests ===');
  
  await testBackendConnectivity();
  await testInteractiveTerminalNotice();
  await testWaitIdleDeltaEchoHello();
  await testWaitTimeoutReturnsResult();
  await testProgressiveMaxWaitPolicy();

  
  console.log('=== Tests completed ===');
}

// 执行测试 / Execute tests
runTests().catch(console.error);
