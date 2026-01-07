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
            cwd: process.cwd(),
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
            cwd: process.cwd(),
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
    const expected = 'Terminal is in an interactive state; inspect the terminal output and respond accordingly.';
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
            cwd: process.cwd(),
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
            cwd: process.cwd(),
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

// 测试 ssh one-shot 提示：ssh host "cmd" 不应作为 error 返回，且应给出引导提示 /
// Test ssh one-shot suggestion: ssh host "cmd" must NOT be returned as error and should provide guidance
async function testSshOneShotSuggestion() {
  console.log('Testing ssh one-shot suggestion...');

  const baseUrl = 'http://localhost:1106';
  const mcpUrl = new URL(`${baseUrl}/mcp`);
  const terminalId = `ssh-one-shot-test-${Date.now()}`;

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
            cwd: process.cwd(),
            input: 'ssh 1.2.3.4 \"echo hi\"',
            appendNewline: true,
            wait: { mode: 'none', maxWaitMs: 0 }
          }
        }
      },
      CallToolResultSchema
    );

    const structured = result.structuredContent || {};
    if (result.isError === true) {
      console.log('❌ ssh one-shot incorrectly returned as error');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else if (structured.kind !== 'ssh_one_shot_suggestion') {
      console.log('❌ expected kind=ssh_one_shot_suggestion');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('✅ ssh one-shot suggestion returned (expected)');
    }

    await client
      .request(
        { method: 'tools/call', params: { name: 'interact_with_terminal', arguments: { killTerminal: true, terminalId } } },
        CallToolResultSchema
      )
      .catch(() => {});

    await transport.close();
  } catch (error) {
    console.log(`⚠️ ssh one-shot suggestion test skipped/failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 测试 ip "cmd" 提示：不应作为 error 返回，且应提示用 ssh ip 进入远端 shell /
// Test ip "cmd" suggestion: must NOT be returned as error and should suggest using ssh ip remote shell mode
async function testIpOneShotSuggestion() {
  console.log('Testing ip one-shot suggestion...');

  const baseUrl = 'http://localhost:1106';
  const mcpUrl = new URL(`${baseUrl}/mcp`);
  const terminalId = `ip-one-shot-test-${Date.now()}`;

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
            cwd: process.cwd(),
            input: '1.2.3.4 \"uname -a\"',
            appendNewline: true,
            wait: { mode: 'none', maxWaitMs: 0 }
          }
        }
      },
      CallToolResultSchema
    );

    const structured = result.structuredContent || {};
    if (result.isError === true) {
      console.log('❌ ip one-shot incorrectly returned as error');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else if (structured.kind !== 'ip_one_shot_suggestion') {
      console.log('❌ expected kind=ip_one_shot_suggestion');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('✅ ip one-shot suggestion returned (expected)');
    }

    await client
      .request(
        { method: 'tools/call', params: { name: 'interact_with_terminal', arguments: { killTerminal: true, terminalId } } },
        CallToolResultSchema
      )
      .catch(() => {});

    await transport.close();
  } catch (error) {
    console.log(`⚠️ ip one-shot suggestion test skipped/failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 测试 1000+ 行输出不丢尾部：node 打印 1500 行，返回应包含 line 1500 /
// Test 1000+ lines output keeps tail: node prints 1500 lines; result should include line 1500
async function testLargeOutputKeepsTail() {
  console.log('Testing large output keeps tail...');

  const baseUrl = 'http://localhost:1106';
  const mcpUrl = new URL(`${baseUrl}/mcp`);
  const terminalId = `large-output-test-${Date.now()}`;

  try {
    const client = new Client({ name: 'cti-test-client', version: '1.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(mcpUrl);
    await client.connect(transport);

    const cmd = `node -e \"for (let i=1;i<=1500;i++) console.log('line '+i)\"`;

    const result = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'interact_with_terminal',
          arguments: {
            terminalId,
            cwd: process.cwd(),
            input: cmd,
            appendNewline: true,
            // prompt 等待更符合“命令结束”语义 / prompt wait better matches "command finished"
            wait: { mode: 'prompt', maxWaitMs: 20000 }
          }
        }
      },
      CallToolResultSchema
    );

    const structured = result.structuredContent || {};
    const output = typeof structured.commandOutput === 'string' ? structured.commandOutput : '';
    const delta = structured.delta && typeof structured.delta.text === 'string' ? structured.delta.text : '';
    const combined = `${output}\n${delta}`;

    if (result.isError === true) {
      console.log('❌ large output test returned error');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else if (!combined.includes('line 1500')) {
      console.log('❌ expected tail line missing (line 1500)');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('✅ large output includes tail (expected)');
    }

    await client
      .request(
        { method: 'tools/call', params: { name: 'interact_with_terminal', arguments: { killTerminal: true, terminalId } } },
        CallToolResultSchema
      )
      .catch(() => {});

    await transport.close();
  } catch (error) {
    console.log(`⚠️ large output test skipped/failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 测试 longTask 机制：不再用 progressive_wait_required 阻断；服务端单次调用仍会 cap 到 ~50s
// Test longTask: do NOT block with progressive_wait_required; server still caps per-call wait to ~50s
async function testLongTaskWaitNotBlocked() {
  console.log('Testing longTask wait (no progressive gate)...');

  const baseUrl = 'http://localhost:1106';
  const mcpUrl = new URL(`${baseUrl}/mcp`);
  const terminalId = `longtask-wait-test-${Date.now()}`;
  const marker = `longtask-marker-${Date.now()}`;

  try {
    const client = new Client({ name: 'cti-test-client', version: '1.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(mcpUrl);
    await client.connect(transport);

    // 1) 直接请求 >60s：不应被 progressive_required 阻断 / Direct >60s request must NOT be blocked by progressive_required
    const longWait = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'interact_with_terminal',
          arguments: {
            terminalId,
            cwd: process.cwd(),
            input: `echo ${marker}`,
            appendNewline: true,
            longTask: true,
            wait: { mode: 'idle', maxWaitMs: 120000, idleMs: 200 }
          }
        }
      },
      CallToolResultSchema
    );

    const longWaitStructured = longWait.structuredContent || {};
    if (longWait.isError === true) {
      console.log('❌ longTask wait returned error');
      console.log('Result:', JSON.stringify(longWait, null, 2));
    } else if (longWaitStructured.kind === 'progressive_wait_required') {
      console.log('❌ progressive_wait_required should not be returned anymore');
      console.log('Result:', JSON.stringify(longWait, null, 2));
    } else if (longWaitStructured.blocked === true || longWaitStructured.blockedReason === 'long_task_guidance') {
      console.log('❌ long_task_guidance should be guidance-only (not blocked)');
      console.log('Result:', JSON.stringify(longWait, null, 2));
    } else if (!longWaitStructured.resultStatus || !['finished', 'timeout', 'running'].includes(longWaitStructured.resultStatus.state)) {
      console.log('❌ missing/invalid resultStatus on longTask call');
      console.log('Result:', JSON.stringify(longWait, null, 2));
    } else {
      console.log('✅ longTask wait returned structured status (expected)');
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
    console.log(`⚠️ longTask wait test skipped/failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 测试 read_CTI：读取输出/关键字上下文/元数据 + resetSession + interrupt
// Test read_CTI: output reading / keyword context / metadata + resetSession + interrupt
async function testReadCtiAndResetAndInterrupt() {
  console.log('Testing read_CTI + resetSession + interrupt...');

  const baseUrl = 'http://localhost:1106';
  const mcpUrl = new URL(`${baseUrl}/mcp`);
  const terminalId = `read-cti-test-${Date.now()}`;
  const marker = `read-cti-marker-${Date.now()}`;

  try {
    const client = new Client({ name: 'cti-test-client', version: '1.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(mcpUrl);
    await client.connect(transport);

    // 1) Create + execute, then read via read_CTI
    await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'interact_with_terminal',
          arguments: {
            terminalId,
            cwd: process.cwd(),
            input: `echo ${marker}`,
            appendNewline: true,
            wait: { mode: 'prompt', maxWaitMs: 5000 }
          }
        }
      },
      CallToolResultSchema
    );

    const read1 = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'read_CTI',
          arguments: { terminalId, tailLines: 50, keywords: [marker], contextLines: 1, includeMetadata: true }
        }
      },
      CallToolResultSchema
    );

    const s1 = read1.structuredContent || {};
    if (read1.isError === true) {
      console.log('❌ read_CTI returned error');
      console.log('Result:', JSON.stringify(read1, null, 2));
    } else if (typeof s1.output === 'string' && s1.output.includes('__CTI_BOUNDARY_')) {
      console.log('❌ read_CTI output leaked __CTI_BOUNDARY_ markers');
      console.log('Result:', JSON.stringify(read1, null, 2));
    } else if (!s1.keywordContext || s1.keywordContext.matchCount < 1) {
      console.log('❌ read_CTI keywordContext missing or no matches');
      console.log('Result:', JSON.stringify(read1, null, 2));
    } else if (!s1.session || !s1.session.readStatus) {
      console.log('❌ read_CTI metadata missing');
      console.log('Result:', JSON.stringify(read1, null, 2));
    } else {
      console.log('✅ read_CTI keywordContext + metadata returned (expected)');
    }

    // 2) Reset session, then run a command without passing cwd again (should not require cwd now)
    await client.request(
      {
        method: 'tools/call',
        params: { name: 'read_CTI', arguments: { terminalId, resetSession: true, cwd: process.cwd() } }
      },
      CallToolResultSchema
    );

    const afterReset = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'interact_with_terminal',
          arguments: {
            terminalId,
            input: 'Get-Date',
            appendNewline: true,
            wait: { mode: 'prompt', maxWaitMs: 5000 }
          }
        }
      },
      CallToolResultSchema
    );

    if (afterReset.isError === true) {
      console.log('❌ interact_with_terminal after reset returned error');
      console.log('Result:', JSON.stringify(afterReset, null, 2));
    } else {
      console.log('✅ resetSession succeeded and subsequent interact worked without cwd (expected)');
    }

    // 3) Interrupt: start a long sleep, then interrupt it (best-effort)
    await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'interact_with_terminal',
          arguments: {
            terminalId,
            input: 'Start-Sleep -Seconds 30',
            appendNewline: true,
            wait: { mode: 'none', maxWaitMs: 0 }
          }
        }
      },
      CallToolResultSchema
    );

    const intr = await client.request(
      {
        method: 'tools/call',
        params: { name: 'interact_with_terminal', arguments: { terminalId, interrupt: true, interruptSignal: 'SIGINT' } }
      },
      CallToolResultSchema
    );

    if (intr.isError === true) {
      console.log('❌ interrupt returned error');
      console.log('Result:', JSON.stringify(intr, null, 2));
    } else {
      console.log('✅ interrupt call returned success (best-effort)');
    }

    // Cleanup
    await client
      .request(
        {
          method: 'tools/call',
          params: { name: 'interact_with_terminal', arguments: { killTerminal: true, terminalId } }
        },
        CallToolResultSchema
      )
      .catch(() => {});

    await transport.close();
  } catch (error) {
    console.log(`⚠️ read_CTI test skipped/failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}


// 运行所有测试 / Run all tests
async function runTests() {
  console.log('=== MCP Client Connectivity Tests ===');
  
  await testBackendConnectivity();
  await testInteractiveTerminalNotice();
  await testWaitIdleDeltaEchoHello();
  await testWaitTimeoutReturnsResult();
  await testSshOneShotSuggestion();
  await testIpOneShotSuggestion();
  await testLargeOutputKeepsTail();
  await testLongTaskWaitNotBlocked();
  await testReadCtiAndResetAndInterrupt();

  
  console.log('=== Tests completed ===');
}

// 执行测试 / Execute tests
runTests().catch(console.error);
