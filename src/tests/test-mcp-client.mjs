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
            waitForOutput: 0
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
            waitForOutput: 0
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
            wait: { mode: 'idle', timeoutMs: 3000, idleMs: 400 }
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
    } else if (!waitInfo || typeof waitInfo.mode !== 'string' || typeof waitInfo.timeoutMs !== 'number') {
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


// 运行所有测试 / Run all tests
async function runTests() {
  console.log('=== MCP Client Connectivity Tests ===');
  
  await testBackendConnectivity();
  await testInteractiveTerminalNotice();
  await testWaitIdleDeltaEchoHello();

  
  console.log('=== Tests completed ===');
}

// 执行测试 / Execute tests
runTests().catch(console.error);
