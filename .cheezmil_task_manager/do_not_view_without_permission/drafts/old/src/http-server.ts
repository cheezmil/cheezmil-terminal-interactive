#!/usr/bin/env node

import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { CheezmilTerminalInteractiveServer } from './mcp-server.js';
import { TerminalManager } from './terminal-manager.js';
import { RestApiServer } from './rest-api.js';
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
 * HTTP 服务器使用 stderr 避免污染响应输出
 */
function log(message: string) {
  process.stderr.write(`[HTTP-MCP-INFO] ${message}\n`);
}

/**
 * Streamable HTTP MCP 服务器主入口
 */
async function main() {
  log('Starting Cheezmil Terminal Interactive Streamable HTTP MCP Server...');

  const app = express();
  
  // 添加 CORS 支持以允许跨域请求
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Accept');
    res.header('Access-Control-Expose-Headers', 'mcp-session-id');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });
  
  app.use(express.json());

  // 创建终端管理器实例
  const terminalManager = new TerminalManager({
    maxBufferSize: parseInt(process.env.MAX_BUFFER_SIZE || '10000'),
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '86400000'), // 24 hours
  });

  // 创建 REST API 服务器实例
  const restApiServer = new RestApiServer(terminalManager);
  
  // 将 REST API 路由集成到主应用中
  app.use('/', restApiServer.getApp());

  // Map to store transports by session ID
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
  const mcpServers: { [sessionId: string]: CheezmilTerminalInteractiveServer } = {};

  // Handle POST requests for client-to-server communication
  app.post('/mcp', async (req, res) => {
    try {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;
      let mcpServer: CheezmilTerminalInteractiveServer;

      if (sessionId && transports[sessionId] && mcpServers[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
        mcpServer = mcpServers[sessionId];
        log(`Reusing existing session: ${sessionId}`);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        log('Creating new session and MCP server');
        
        // Create MCP server instance first
        mcpServer = new CheezmilTerminalInteractiveServer();
        const server = mcpServer.getServer();
        
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            // Store the transport and MCP server by session ID
            transports[newSessionId] = transport;
            mcpServers[newSessionId] = mcpServer;
            log(`Session initialized: ${newSessionId}`);
          },
          // Disable DNS rebinding protection to allow localhost connections
          enableDnsRebindingProtection: false,
          allowedHosts: ['127.0.0.1', 'localhost', 'localhost:1106'],
        });

        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
            delete mcpServers[transport.sessionId];
            log(`Session closed: ${transport.sessionId}`);
          }
        };

        // Connect to the MCP server
        await server.connect(transport);
        log('MCP server connected to transport');
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      // Handle the request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  });

  // Reusable handler for GET and DELETE requests
  const handleSessionRequest = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };

  // Handle GET requests for server-to-client notifications via SSE
  app.get('/mcp', handleSessionRequest);

  // Handle DELETE requests for session termination
  app.delete('/mcp', handleSessionRequest);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      activeSessions: Object.keys(transports).length
    });
  });

  // Start the HTTP server
  const port = parseInt(process.env.MCP_PORT || '1106');
  const host = process.env.MCP_HOST || '127.0.0.1';

  app.listen(port, host, () => {
    log(`Cheezmil Terminal Interactive Streamable HTTP MCP Server started successfully`);
    log(`Server listening on http://${host}:${port}/mcp`);
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
    log('');
    log('Health check available at: http://${host}:${port}/health');
  });

  // Handle graceful shutdown
  const shutdown = async () => {
    log('Received shutdown signal, cleaning up...');
    try {
      // Close all transports and servers
      for (const [sessionId, transport] of Object.entries(transports)) {
        await transport.close();
        if (mcpServers[sessionId]) {
          await mcpServers[sessionId].shutdown();
        }
      }
      process.exit(0);
    } catch (error) {
      console.error('[HTTP-MCP-ERROR] Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('[HTTP-MCP-ERROR] Uncaught exception:', error);
    shutdown();
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[HTTP-MCP-ERROR] Unhandled rejection at:', promise, 'reason:', reason);
    shutdown();
  });
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
      console.error('[HTTP-MCP-ERROR] Failed to start server:', error);
      process.exit(1);
    });
  }
}