#!/usr/bin/env node

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { cheezmilTerminalInteractiveServer } from './mcp-server.js';
import { TerminalManager } from './terminal-manager.js';
import { TerminalApiRoutes } from './terminal-api-routes.js';
import { configManager } from './config-manager.js';
import { apiDocsGenerator } from './api-docs-generator.js';
import { VersionService } from './version-service.js';
import { fileURLToPath } from 'url';
import { realpathSync } from 'fs';
import path from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export { cheezmilTerminalInteractiveServer } from './mcp-server.js';
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
  log('Starting Cheezmil Terminal Interactive Streamable HTTP MCP Server...');

  // 获取服务器配置 / Get server configuration
  const serverConfig = configManager.getServerConfig();
  const terminalConfig = configManager.getTerminalConfig();
  const mcpConfig = configManager.getMcpConfig();

  // 根据配置设置 MCP 工具禁用列表（映射到 DISABLED_TOOLS 环境变量）
  // Configure MCP disabled tools from config (mapped to DISABLED_TOOLS environment variable)
  if (mcpConfig?.disabledTools && Array.isArray(mcpConfig.disabledTools) && mcpConfig.disabledTools.length > 0) {
    process.env.DISABLED_TOOLS = mcpConfig.disabledTools.join(',');
    log(`Disabled MCP tools via config: ${process.env.DISABLED_TOOLS}`);
  } else {
    // 如果配置中未指定，则清空该环境变量，使用默认行为
    // If not specified in config, clear the env var and use default behavior
    delete process.env.DISABLED_TOOLS;
    log('No MCP tools disabled via config');
  }

  // 创建 Fastify 实例 / Create Fastify instance
  const fastify: FastifyInstance = Fastify({
    logger: false, // 使用自定义日志记录器 / Use custom logger
    trustProxy: true
  });

  // 版本检查服务（启动时检查 GitHub 最新版本）
  // Version check service (check GitHub latest version on startup)
  const versionService = new VersionService();
  // 将版本服务挂到 fastify，便于路由中复用
  // Attach version service to fastify for reuse in routes
  (fastify as any).versionService = versionService;
  // 启动时进行一次远端版本检查（失败不影响启动）
  // Do one remote version check on startup (do not block startup on failure)
  versionService.refreshRemoteVersion({ timeoutMs: 4000 }).catch((error) => {
    process.stderr.write(`[VERSION] Remote version check failed: ${error instanceof Error ? error.message : String(error)}\n`);
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

  // WebSocket客户端集合 / WebSocket clients collection
  const wsClients: Set<any> = new Set();

  // 将TerminalManager实例存储到全局变量，以便MCP服务器可以访问
  // Store TerminalManager instance in global variable for MCP server access
  (global as any).sharedTerminalManager = terminalManager;

  // 设置静态文件服务和前端路由 / Setup static file service and frontend routes
  await setupStaticFilesAndRoutes(fastify);

  // 将终端API路由集成到主应用中 / Integrate terminal API routes into main application
  // 注意：前端API路由已经在 setupFrontendApiRoutes 中定义，这里不需要重复注册
  // Note: Frontend API routes are already defined in setupFrontendApiRoutes, no need to register again

  // 注册API文档路由 / Register API documentation routes
  await apiDocsGenerator.registerRoutes(fastify);

  // 设置WebSocket / Setup WebSocket
  await setupWebSocket(fastify, terminalManager, wsClients);

  // Map to store transports by session ID
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
  const mcpServers: { [sessionId: string]: cheezmilTerminalInteractiveServer } = {};

  // Handle POST requests for client-to-server communication
  fastify.post('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check for existing session ID
      const sessionId = request.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;
      let mcpServer: cheezmilTerminalInteractiveServer;

      if (sessionId && transports[sessionId] && mcpServers[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
        mcpServer = mcpServers[sessionId];
        log(`Reusing existing session: ${sessionId}`);
      } else if (!sessionId && isInitializeRequest(request.body)) {
        // New initialization request
        log('Creating new session and MCP server');
        
        // Create MCP server instance first
        mcpServer = new cheezmilTerminalInteractiveServer();
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
    // node-pty 在 Windows 上终止终端时，偶尔会触发 EPIPE 或 AttachConsole failed 等底层错误
    // 这些错误通常表示管道或控制台已关闭，不应导致整个 MCP 服务器退出
    // node-pty on Windows sometimes throws low-level EPIPE or "AttachConsole failed" errors when killing a terminal.
    // These usually mean the pipe/console is already closed and should not bring down the MCP server.
    const anyError = error as any;
    const messageText = String(anyError && (anyError.message || anyError.toString() || ''));

    if (
      anyError &&
      (
        anyError.code === 'EPIPE' ||
        messageText.includes('EPIPE') ||
        messageText.includes('AttachConsole failed') ||
        messageText.includes('conpty_console_list_agent')
      )
    ) {
      log('Ignoring benign uncaughtException from PTY (EPIPE / AttachConsole failed) after terminal kill.');
      return;
    }

    console.error('[HTTP-MCP-ERROR] Uncaught exception:', error);
    shutdown();
  });

  process.on('unhandledRejection', (reason, promise) => {
    // node-pty 在 Windows 上终止终端时也可能产生未处理的 Promise 拒绝
    // 这些拒绝一般与 EPIPE / AttachConsole failed 等控制台关闭有关，不应触发服务器退出
    // node-pty on Windows may also emit unhandled Promise rejections during terminal kill.
    // These are usually benign (EPIPE / AttachConsole failed) and should not shutdown the server.
    const anyReason = reason as any;
    const messageText = String(anyReason && (anyReason.message || anyReason.toString() || ''));

    if (
      anyReason &&
      (
        anyReason.code === 'EPIPE' ||
        messageText.includes('EPIPE') ||
        messageText.includes('AttachConsole failed') ||
        messageText.includes('conpty_console_list_agent')
      )
    ) {
      log('Ignoring benign unhandledRejection from PTY (EPIPE / AttachConsole failed) after terminal kill.');
      return;
    }

    console.error('[HTTP-MCP-ERROR] Unhandled rejection at:', promise, 'reason:', reason);
    shutdown();
  });
}

/**
 * 设置静态文件服务和前端路由
 * Setup static file service and frontend routes
 */
async function setupStaticFilesAndRoutes(fastify: FastifyInstance): Promise<void> {
  // 请求日志 / Request logging
  fastify.addHook('preHandler', async (request, reply) => {
    // 只记录非API和静态文件的请求
    if (!request.url.startsWith('/api') && !request.url.startsWith('/mcp') && !request.url.startsWith('/ws')) {
      process.stderr.write(`[WEB-UI] ${request.method} ${request.url}\n`);
    }
  });

  // 静态文件服务 - 直接使用编译后的前端文件
  // Static file service - directly use compiled frontend files
  // 使用硬编码的绝对路径确保正确找到前端文件
  // Use hardcoded absolute path to ensure correct frontend files are found
  const frontendDistPath = 'D:/CodeRelated/cheezmil-terminal-interactive/frontend/dist';
  fastify.register(import('@fastify/static'), {
    root: frontendDistPath,
    prefix: '/',
    // 避免路由冲突 / Avoid route conflicts
    decorateReply: false
  });
  console.log('使用编译后的前端文件，路径:', frontendDistPath);
  console.log('当前工作目录:', process.cwd());
  console.log('__dirname:', __dirname);
  
  // 同时提供public目录的静态文件
  // Also provide static files from public directory
  const publicPath = path.resolve(__dirname, '..', 'public');
  fastify.register(import('@fastify/static'), {
    root: publicPath,
    prefix: '/public',
    decorateReply: false
  });
  
  // 设置前端API路由 / Setup frontend API routes
  await setupFrontendApiRoutes(fastify);
  
  // 终端详情页 - 旧的HTML处理
  // Terminal details page - old HTML handling
  fastify.get('/terminal/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const indexPath = 'D:/CodeRelated/cheezmil-terminal-interactive/frontend/dist/index.html';
    return reply.sendFile(indexPath);
  });
}

/**
 * 设置前端API路由
 * Setup frontend API routes
 */
async function setupFrontendApiRoutes(fastify: FastifyInstance): Promise<void> {
  const terminalManager = (global as any).sharedTerminalManager;
  const versionService: VersionService | undefined = (fastify as any).versionService as any;

  // 版本信息 / Version info
  fastify.get('/api/version', async () => {
    // 每次请求时若之前没检查过，则补一次（不阻塞太久）
    // If never checked yet, do a quick refresh (with short timeout)
    if (versionService && !versionService.getInfo().lastCheckedAt) {
      await versionService.refreshRemoteVersion({ timeoutMs: 2000 });
    }
    return versionService ? versionService.getInfo() : { currentVersion: '0.0.0', latestVersion: null, updateAvailable: false };
  });
  
  // 获取所有终端 / Get all terminals
  fastify.get('/api/terminals', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await terminalManager.listTerminals();
      return result;
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to list terminals',
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  });

  // 获取终端详情 / Get terminal details
  fastify.get('/api/terminals/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      if (!id) {
        reply.status(400).send({ error: 'Terminal ID is required' });
        return;
      }
      const session = terminalManager.getTerminalInfo(id);
      
      if (!session) {
        reply.status(404).send({ error: 'Terminal not found' });
        return;
      }

      return {
        id: session.id,
        pid: session.pid,
        shell: session.shell,
        cwd: session.cwd,
        created: session.created.toISOString(),
        lastActivity: session.lastActivity.toISOString(),
        status: session.status
      };
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to get terminal info',
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  });

  // 创建终端（前端使用的简化接口）/ Create terminal (simplified endpoint for frontend)
  fastify.post('/api/terminals', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { shell, cwd, env, terminalName } = request.body as any;

      // 前端必须显式提供终端名称，避免使用 UUID / Frontend must provide explicit terminal name, avoid using UUID
      if (!terminalName || typeof terminalName !== 'string' || !terminalName.trim()) {
        reply.status(400).send({
          error: 'Terminal name is required',
          message: 'terminalName is required and must be a non-empty string'
        });
        return;
      }

      const createdName = await terminalManager.createTerminal({
        terminalName: terminalName.trim(),
        shell,
        cwd,
        env
      });

      const session = terminalManager.getTerminalInfo(createdName);
      
      reply.status(201).send({
        terminalId: createdName,
        status: session?.status,
        pid: session?.pid,
        shell: session?.shell,
        cwd: session?.cwd
      });
    } catch (error) {
      reply.status(400).send({
        error: 'Failed to create terminal',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 读取终端输出 / Read terminal output
  fastify.get('/api/terminals/:id/output', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      if (!id) {
        reply.status(400).send({ error: 'Terminal ID is required' });
        return;
      }
      const query = request.query as any;
      const { since, maxLines, mode } = query;

      const result = await terminalManager.readFromTerminal({
        terminalName: id,
        since: since ? parseInt(since) : undefined,
        maxLines: maxLines ? parseInt(maxLines) : undefined,
        mode: mode as any
      });

      return result;
    } catch (error) {
      reply.status(400).send({
        error: 'Failed to read terminal output',
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  });

  // 写入终端输入 / Write terminal input
  fastify.post('/api/terminals/:id/input', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      if (!id) {
        reply.status(400).send({ error: 'Terminal ID is required' });
        return;
      }
      const { input, appendNewline } = request.body as any;

      await terminalManager.writeToTerminal({
        terminalName: id,
        input,
        appendNewline
      });

      return { success: true };
    } catch (error) {
      reply.status(400).send({
        error: 'Failed to write to terminal',
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  });

  // 终止终端 / Terminate terminal
  fastify.delete('/api/terminals/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      if (!id) {
        reply.status(400).send({ error: 'Terminal ID is required' });
        return;
      }
      const query = request.query as any;
      const { signal } = query;

      await terminalManager.killTerminal(id, signal as string);

      return { success: true };
    } catch (error) {
      reply.status(400).send({
        error: 'Failed to kill terminal',
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  });

  // 获取终端统计 / Get terminal statistics
  fastify.get('/api/terminals/:id/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      if (!id) {
        reply.status(400).send({ error: 'Terminal ID is required' });
        return;
      }
      const result = await terminalManager.getTerminalStats(id);
      return result;
    } catch (error) {
      reply.status(400).send({
        error: 'Failed to get terminal stats',
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  });

  // 终结所有终端 / Terminate all terminals
  fastify.post('/api/terminals/kill-all', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const list = await terminalManager.listTerminals();
      const terminalIds: string[] = (list?.terminals || []).map((t: any) => t.id).filter(Boolean);

      let killed = 0;
      const failed: Array<{ id: string; message: string }> = [];

      for (const id of terminalIds) {
        try {
          await terminalManager.killTerminal(id, 'SIGTERM');
          killed++;
        } catch (error) {
          failed.push({
            id,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }

      return {
        success: failed.length === 0,
        total: terminalIds.length,
        killed,
        failed
      };
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to kill all terminals',
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  });

  // 设置相关API / Settings related API
  await setupSettingsRoutes(fastify);
}

/**
 * 设置设置相关的API路由
 * Setup settings related API routes
 */
async function setupSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // 重新从磁盘加载配置 / Reload config from disk
  fastify.get('/api/settings/reload', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await configManager.reloadFromDisk();

      // 根据配置更新禁用工具环境变量（影响 MCP 工具启用/禁用判断）
      // Update disabled tools env var from config (affects MCP tool enable/disable)
      const mcpConfig = configManager.getMcpConfig();
      if (mcpConfig?.disabledTools && Array.isArray(mcpConfig.disabledTools) && mcpConfig.disabledTools.length > 0) {
        process.env.DISABLED_TOOLS = mcpConfig.disabledTools.join(',');
      } else {
        delete process.env.DISABLED_TOOLS;
      }

      return {
        success: true,
        message: 'Configuration reloaded from disk',
        config: configManager.getAll()
      };
    } catch (error) {
      console.error('Failed to reload settings:', error);
      reply.status(500).send({
        error: 'Failed to reload settings',
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  });

  // 获取设置 / Get settings
  fastify.get('/api/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 使用配置管理器返回完整配置 / Use config manager to return full configuration
      const config = configManager.getAll();
      return config;
    } catch (error) {
      console.error('Failed to read settings:', error);
      reply.status(500).send({
        error: 'Failed to read settings',
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  });

  // 保存设置 / Save settings
  fastify.post('/api/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const newConfig = request.body as any;

      // 验证配置数据 / Validate configuration data
      if (!newConfig || typeof newConfig !== 'object') {
        reply.status(400).send({
          error: 'Invalid configuration data'
        });
        return;
      }

      // 保存配置（尽量保留 config.yml 的注释与格式）/ Save config (best-effort preserving comments & formatting in config.yml)
      await configManager.applyPartialConfig(newConfig);

      return {
        success: true,
        message: 'Configuration saved successfully',
        config: configManager.getAll()
      };
    } catch (error) {
      console.error('Failed to save settings:', error);
      reply.status(500).send({
        error: 'Failed to save settings',
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  });

  // 重置设置（兼容 API 文档和前端约定，使用 POST /api/settings/reset）
  // Reset settings (compatible with API docs and frontend contract, using POST /api/settings/reset)
  fastify.post('/api/settings/reset', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await configManager.reset();
      const defaultConfig = configManager.getAll();

      return {
        success: true,
        message: 'Configuration reset to defaults successfully',
        config: defaultConfig
      };
    } catch (error) {
      console.error('Failed to reset settings:', error);
      reply.status(500).send({
        error: 'Failed to reset settings',
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  });

  // 兼容旧的 DELETE /api/settings 重置行为 / Backwards-compatible DELETE /api/settings reset behavior
  fastify.delete('/api/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await configManager.reset();
      const defaultConfig = configManager.getAll();

      return {
        success: true,
        message: 'Configuration reset to defaults successfully',
        config: defaultConfig
      };
    } catch (error) {
      console.error('Failed to reset settings:', error);
      reply.status(500).send({
        error: 'Failed to reset settings',
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  });

}

/**
 * 设置 WebSocket
 * Setup WebSocket
 */
async function setupWebSocket(fastify: FastifyInstance, terminalManager: TerminalManager, wsClients: Set<any>): Promise<void> {
  // 注册 Fastify WebSocket 插件
  // Register Fastify WebSocket plugin
  await fastify.register(import('@fastify/websocket'));

  // 设置 WebSocket 路由
  // Setup WebSocket route
  fastify.get('/ws', { websocket: true }, (connection /* WebSocket */, req /* FastifyRequest */) => {
    wsClients.add(connection);

    process.stderr.write('[WEB-UI] WebSocket client connected\n');

    connection.on('close', () => {
      wsClients.delete(connection);
      process.stderr.write('[WEB-UI] WebSocket client disconnected\n');
    });

    connection.on('error', (error: any) => {
      process.stderr.write(`[WEB-UI] WebSocket error: ${error}\n`);
    });
  });

  // 监听终端事件并广播 / Listen to terminal events and broadcast
  terminalManager.on('terminalOutput', (terminalId: string, data: string) => {
    broadcast(wsClients, {
      type: 'output',
      terminalId,
      data
    });
  });

  terminalManager.on('terminalExit', (terminalId: string) => {
    broadcast(wsClients, {
      type: 'exit',
      terminalId
    });
  });
}

/**
 * 广播消息给所有客户端
 * Broadcast message to all clients
 */
function broadcast(wsClients: Set<any>, message: any): void {
  const payload = JSON.stringify(message);
  wsClients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(payload);
      } catch (error) {
        // 发送失败通常表示客户端已关闭，不应影响主进程
        // Send failure usually means the client is gone; do not crash the MCP server
        wsClients.delete(client);
        process.stderr.write(`[WEB-UI] WebSocket send failed, removed client: ${error}\n`);
      }
    }
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
