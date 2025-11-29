#!/usr/bin/env node

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { CheestardTerminalInteractiveServer } from './mcp-server.js';
import { TerminalManager } from './terminal-manager.js';
import { TerminalApiRoutes } from './terminal-api-routes.js';
import { configManager } from './config-manager.js';
import { apiDocsGenerator } from './api-docs-generator.js';
import { fileURLToPath } from 'url';
import { realpathSync } from 'fs';

export { CheestardTerminalInteractiveServer } from './mcp-server.js';
export { TerminalManager } from './terminal-manager.js';
export { WebUIManager } from './web-ui-manager.js';
export { WebInterfaceServer } from './web-interface.js';
export { TerminalApiRoutes } from './terminal-api-routes.js';
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
 * Log output function - always output to stderr
 * HTTP server uses stderr to avoid polluting response output
 */
function log(message: string) {
  process.stderr.write(`[HTTP-MCP-INFO] ${message}\n`);
}

/**
 * Streamable HTTP MCP 服务器主入口
 * Streamable HTTP MCP server main entry point
 */
async function main() {
  log('Starting Cheestard Terminal Interactive Streamable HTTP MCP Server...');

  // 获取服务器配置 / Get server configuration
  const serverConfig = configManager.getServerConfig();
  const terminalConfig = configManager.getTerminalConfig();
  const mcpConfig = configManager.getMcpConfig();

  // 创建 Fastify 实例 / Create Fastify instance
  const fastify: FastifyInstance = Fastify({
    logger: false, // 使用自定义日志记录器 / Use custom logger
    trustProxy: true
  });

  // 注册 CORS 插件 / Register CORS plugin
  await fastify.register(import('@fastify/cors'), {
    origin: serverConfig.cors.origin,
    credentials: serverConfig.cors.credentials,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'PUT'],
    allowedHeaders: ['Content-Type', 'mcp-session-id', 'Accept', 'Authorization'],
    exposedHeaders: ['mcp-session-id']
  });

  // 创建终端管理器实例 / Create terminal manager instance
  const terminalManager = new TerminalManager({
    maxBufferSize: terminalConfig.maxBufferSize,
    sessionTimeout: terminalConfig.sessionTimeout,
  });

  // 创建终端API路由实例 / Create terminal API routes instance
  const terminalApiRoutes = new TerminalApiRoutes(terminalManager);

  // 将TerminalManager实例存储到全局变量，以便MCP服务器可以访问
  // Store TerminalManager instance in global variable for MCP server access
  (global as any).sharedTerminalManager = terminalManager;

  // 将终端API路由集成到主应用中 / Integrate terminal API routes into main application
  await fastify.register(async (fastifyInstance: FastifyInstance) => {
    await terminalApiRoutes.registerRoutes(fastifyInstance);
  });

  // 注册API文档路由 / Register API documentation routes
  await apiDocsGenerator.registerRoutes(fastify);

  // Map to store transports by session ID
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
  const mcpServers: { [sessionId: string]: CheestardTerminalInteractiveServer } = {};

  // Handle POST requests for client-to-server communication
  fastify.post('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check for existing session ID
      const sessionId = request.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;
      let mcpServer: CheestardTerminalInteractiveServer;

      if (sessionId && transports[sessionId] && mcpServers[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
        mcpServer = mcpServers[sessionId];
        log(`Reusing existing session: ${sessionId}`);
      } else if (!sessionId && isInitializeRequest(request.body)) {
        // New initialization request
        log('Creating new session and MCP server');
        
        // Create MCP server instance first
        mcpServer = new CheestardTerminalInteractiveServer();
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
          enableDnsRebindingProtection: mcpConfig.enableDnsRebindingProtection,
          allowedHosts: mcpConfig.allowedHosts,
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
        reply.status(400).send({
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
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      reply.status(500).send({
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
  const handleSessionRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      reply.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    await transport.handleRequest(request.raw, reply.raw);
  };

  // Handle GET requests for server-to-client notifications via SSE
  fastify.get('/mcp', handleSessionRequest);

  // Handle DELETE requests for session termination
  fastify.delete('/mcp', handleSessionRequest);

  // Health check endpoint is now handled by TerminalApiRoutes
  // 健康检查端点现在由 TerminalApiRoutes 处理

  // Start the HTTP server
  const port = serverConfig.port;
  const host = serverConfig.host;

  try {
    await fastify.listen({ port, host });
    log(`Cheestard Terminal Interactive Streamable HTTP MCP Server started successfully`);
    log(`Server listening on http://${host}:${port}/mcp`);
    log('Server capabilities:');
    log('- create_terminal: Create new Cheestard Terminal Interactive sessions');
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
    log('No prompts available');
    log('');
    log(`Health check available at: http://${host}:${port}/health`);
  } catch (error) {
    log(`Failed to start server: ${error}`);
    process.exit(1);
  }

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
      
      // Close Fastify server
      await fastify.close();
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

// 启动服务器 / Start server
const scriptPath = fileURLToPath(import.meta.url);
const entryArg = process.argv[1];

if (entryArg) {
  let entryPath = entryArg;
  try {
    entryPath = realpathSync(entryArg);
  } catch {
    // 保留原始路径用于比较（例如当文件已经被删除时）
    // Keep original path for comparison (e.g., when file has been deleted)
  }

  if (entryPath === scriptPath) {
    main().catch((error) => {
      console.error('[HTTP-MCP-ERROR] Failed to start server:', error);
      process.exit(1);
    });
  }
}