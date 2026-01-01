#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CheezmilTerminalInteractiveServer } from './mcp-server.js';
import { fileURLToPath } from 'url';
import { realpathSync } from 'fs';

export { CheezmilTerminalInteractiveServer } from './mcp-server.js';
export { TerminalManager } from './terminal-manager.js';
export { WebUIManager } from './web-ui-manager.js';
export { WebUIServer } from './web-ui-server.js';
export { RestApiServer } from './rest-api.js';
export type {
  TerminalManagerConfig,
  TerminalReadOptions,
  TerminalReadResult,
  TerminalWriteOptions,
  TerminalCreateOptions,
  TerminalStatsResult,
  TerminalStatsInput,
  TerminalReadStatus,
  TerminalListResult,
  TerminalSession,
  TerminalError,
  CommandRuntimeInfo,
  CommandSummary,
  OutputBufferEntry,
  BufferReadOptions,
  BufferReadResult,
  WriteTerminalResult,
  ReadTerminalInput,
  KillTerminalInput,
  KillTerminalResult,
  CreateTerminalInput,
  CreateTerminalResult,
  WriteTerminalInput,
  ListTerminalsResult
} from './types.js';

/**
 * 日志输出函数 - 始终输出到 stderr
 * MCP 使用 stdio 进行 JSON-RPC 通信，所以日志必须输出到 stderr
 */
function log(message: string) {
  // 使用 stderr 避免污染 stdio JSON-RPC 通道
  process.stderr.write(`[MCP-INFO] ${message}\n`);
}

/**
 * 持久化终端 MCP 服务器主入口
 */
async function main() {
  log('Starting Cheezmil Terminal Interactive MCP Server...');

  // 创建 MCP 服务器实例
  const mcpServer = new CheezmilTerminalInteractiveServer();
  const server = mcpServer.getServer();

  // 创建 stdio 传输层
  const transport = new StdioServerTransport();

  // 连接服务器和传输层
  await server.connect(transport);

  log('Cheezmil Terminal Interactive MCP Server started successfully');
  log('Server capabilities:');
  log('- create_terminal: Create new Cheezmil Terminal Interactive sessions');
  log('- write_terminal: Send input to terminal sessions');
  log('- read_terminal: Read output from terminal sessions');
  log('- list_terminals: List all active terminal sessions');
  log('- kill_terminal: Terminate terminal sessions');
  log('');
  log('Resources available:');
  log('- terminal://list: List of all terminals');
  log('- terminal://output/{terminalId}: Terminal output');
  log('- terminal://stats: Manager statistics');
  log('');
  log('Prompts available:');
  log('- terminal-usage-guide: Usage guide');
  log('- terminal-troubleshooting: Troubleshooting guide');

  // 处理优雅关闭
  const shutdown = async () => {
    log('Received shutdown signal, cleaning up...');
    try {
      await mcpServer.shutdown();
      await transport.close();
      process.exit(0);
    } catch (error) {
      // 错误信息输出到 stderr，避免污染 stdio
      process.stderr.write(`[MCP-ERROR] Error during shutdown: ${error}\n`);
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);

  // 处理未捕获的异常
  process.on('uncaughtException', (error) => {
    process.stderr.write(`[MCP-ERROR] Uncaught exception: ${error}\n`);
    shutdown();
  });

  process.on('unhandledRejection', (reason, promise) => {
    process.stderr.write(`[MCP-ERROR] Unhandled rejection at: ${promise}, reason: ${reason}\n`);
    shutdown();
  });
  // 创建一个不会阻止进程正常退出的定时器，以确保事件循环不会变空
  const keepAliveInterval = setInterval(() => {
    // 这个函数体可以是空的，它的存在本身就足以让进程保持运行
  }, 1000 * 60 * 60); // 每小时执行一次，避免性能影响

  // 允许进程在没有其他活动句柄时正常退出
  keepAliveInterval.unref();
}

// 启动服务器
const scriptPath = fileURLToPath(import.meta.url);
const entryArg = process.argv[1];

if (entryArg) {
  let entryPath = entryArg;
  try {
    entryPath = realpathSync(entryArg);
  } catch {
    // 保留原始路径用于比较（例如当文件已经被删除时）
  }

  if (entryPath === scriptPath) {
    main().catch((error) => {
      process.stderr.write(`[MCP-ERROR] Failed to start server: ${error}\n`);
      process.exit(1);
    });
  }
}