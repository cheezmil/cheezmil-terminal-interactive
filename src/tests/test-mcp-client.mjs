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

// 测试命令黑名单是否生效（MCP工具层拦截）/ Test command blacklist enforcement (blocked at MCP tool layer)
async function testCommandBlacklist() {
  console.log('Testing MCP command blacklist...');

  const baseUrl = 'http://localhost:1106';
  const settingsUrl = `${baseUrl}/api/settings`;
  const mcpUrl = new URL(`${baseUrl}/mcp`);

  let originalConfig = null;
  const terminalId = `blacklist-test-${Date.now()}`;
  const customMessage = 'XXXXX';

  try {
    const getRes = await fetch(settingsUrl, { method: 'GET' });
    if (!getRes.ok) {
      throw new Error(`Failed to GET settings: ${getRes.status}`);
    }
    originalConfig = await getRes.json();

    const testConfig = JSON.parse(JSON.stringify(originalConfig || {}));
    testConfig.mcp = testConfig.mcp || {};
    testConfig.mcp.commandBlacklist = {
      ...(testConfig.mcp.commandBlacklist || {}),
      caseInsensitive: true,
      rules: [{ command: 'write-host', message: customMessage }]
    };

    const saveRes = await fetch(settingsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testConfig)
    });
    if (!saveRes.ok) {
      throw new Error(`Failed to POST settings: ${saveRes.status}`);
    }

    const client = new Client({ name: 'cti-test-client', version: '1.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(mcpUrl);
    await client.connect(transport);

    const tools = await client.request({ method: 'tools/list', params: {} }, ListToolsResultSchema);
    const hasInteractTool = tools.tools.some((t) => t.name === 'interact_with_terminal');
    if (!hasInteractTool) {
      throw new Error('Tool interact_with_terminal not found on server');
    }

    const result = await client.request({
      method: 'tools/call',
      params: {
        name: 'interact_with_terminal',
        arguments: {
          terminalId,
          input: 'Write-Host hello',
          appendNewline: true,
          waitForOutput: 0
        }
      }
    }, CallToolResultSchema);

    const textBlock = (result.content || []).find((c) => c.type === 'text');
    const text = textBlock && typeof textBlock.text === 'string' ? textBlock.text : '';

    if (result.isError && text.includes(customMessage)) {
      console.log('✅ Command blacklist enforced (blocked as expected)');
    } else {
      console.log('❌ Command blacklist NOT enforced');
      console.log('Result:', JSON.stringify(result, null, 2));
    }

    // Cleanup: terminate the test terminal if it was created / 清理：如果创建了测试终端则终止
    await client.request({
      method: 'tools/call',
      params: {
        name: 'interact_with_terminal',
        arguments: { killTerminal: true, terminalId }
      }
    }, CallToolResultSchema).catch(() => {});

    await transport.close();
  } catch (error) {
    console.log(`⚠️ Command blacklist test skipped/failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    // Restore original config / 恢复原始配置
    if (originalConfig) {
      try {
        await fetch(settingsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(originalConfig)
        });
      } catch (error) {
        console.log(`⚠️ Failed to restore settings: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

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


// 运行所有测试 / Run all tests
async function runTests() {
  console.log('=== MCP Client Connectivity Tests ===');
  
  await testBackendConnectivity();
  await testCommandBlacklist();
  await testInteractiveTerminalNotice();

  
  console.log('=== Tests completed ===');
}

// 执行测试 / Execute tests
runTests().catch(console.error);
