import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { TerminalManager } from './terminal-manager.js';
import { configManager } from './config-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Web Interface 服务器 - 使用 Fastify 框架
 * Web Interface Server - Using Fastify framework
 * 提供Web界面、静态文件服务、REST API 和 WebSocket 实时推送
 * Provides web interface, static file service, REST API and WebSocket real-time push
 */
export class WebInterfaceServer {
  private fastify: FastifyInstance;
  private wss: WebSocketServer | null = null;
  private terminalManager: TerminalManager;
  private clients: Set<any> = new Set();

  constructor(terminalManager: TerminalManager) {
    this.terminalManager = terminalManager;
    this.fastify = Fastify({ logger: false });
    this.setupMiddleware();
  }

  /**
   * 设置中间件
   * Setup middleware
   */
  private setupMiddleware(): void {
    // 请求日志 / Request logging
    this.fastify.addHook('preHandler', async (request, reply) => {
      process.stderr.write(`[WEB-UI] ${request.method} ${request.url}\n`);
    });

    // 静态文件服务 - 直接使用编译后的前端文件
    // Static file service - directly use compiled frontend files
    // 使用硬编码的绝对路径确保正确找到前端文件
    // Use hardcoded absolute path to ensure correct frontend files are found
    const frontendDistPath = 'D:/CodeRelated/cheestard-terminal-interactive/frontend/dist';
    this.fastify.register(import('@fastify/static'), {
      root: frontendDistPath,
      prefix: '/'
    });
    console.log('使用编译后的前端文件，路径:', frontendDistPath);
    console.log('当前工作目录:', process.cwd());
    console.log('__dirname:', __dirname);
    
    // 同时提供public目录的静态文件
    // Also provide static files from public directory
    const publicPath = path.resolve(__dirname, '..', 'public');
    this.fastify.register(import('@fastify/static'), {
      root: publicPath,
      prefix: '/public',
      decorateReply: false
    });
    
    // 后设置路由，确保静态文件服务优先
    // Set routes later to ensure static file service takes priority
    this.setupRoutes();
  }

  /**
   * 设置路由
   * Setup routes
   */
  private setupRoutes(): void {
    // REST API 端点 - 必须在通配符路由之前
    // REST API endpoints - must be before wildcard routes
    this.setupApiRoutes();

    // 终端详情页 - 旧的HTML处理
    // Terminal details page - old HTML handling
    this.fastify.get('/terminal/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const indexPath = 'D:/CodeRelated/cheestard-terminal-interactive/frontend/dist/index.html';
      return reply.sendFile(indexPath);
    });

    // 其他路径 - 支持SPA和静态文件，但不包括API路径
    // Other paths - support SPA and static files, but exclude API paths
    this.fastify.get('*', async (request: FastifyRequest, reply: FastifyReply) => {
      // 所有非API路径都返回编译后的Vue应用
      // All non-API paths return the compiled Vue application
      const indexPath = 'D:/CodeRelated/cheestard-terminal-interactive/frontend/dist/index.html';
      return reply.sendFile(indexPath);
    });
  }

  /**
   * 设置 API 路由
   * Setup API routes
   */
  private setupApiRoutes(): void {
    // 获取所有终端 / Get all terminals
    this.fastify.get('/api/terminals', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await this.terminalManager.listTerminals();
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
    this.fastify.get('/api/terminals/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        if (!id) {
          reply.status(400).send({ error: 'Terminal ID is required' });
          return;
        }
        const session = this.terminalManager.getTerminalInfo(id);
        
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

    // 创建终端 / Create terminal
    this.fastify.post('/api/terminals', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { shell, cwd, env } = request.body as any;
        const terminalId = await this.terminalManager.createTerminal({
          shell,
          cwd,
          env
        });

        const session = this.terminalManager.getTerminalInfo(terminalId);
        
        reply.status(201).send({
          terminalId,
          status: session?.status,
          pid: session?.pid,
          shell: session?.shell,
          cwd: session?.cwd
        });

        // 广播新终端创建事件 / Broadcast new terminal creation event
        this.broadcast({
          type: 'terminal_created',
          terminalId
        });
      } catch (error) {
        reply.status(400).send({
          error: 'Failed to create terminal',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // 读取终端输出 / Read terminal output
    this.fastify.get('/api/terminals/:id/output', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        if (!id) {
          reply.status(400).send({ error: 'Terminal ID is required' });
          return;
        }
        const query = request.query as any;
        const { since, maxLines, mode } = query;

        const result = await this.terminalManager.readFromTerminal({
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
    this.fastify.post('/api/terminals/:id/input', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        if (!id) {
          reply.status(400).send({ error: 'Terminal ID is required' });
          return;
        }
        const { input, appendNewline } = request.body as any;

        await this.terminalManager.writeToTerminal({
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
    this.fastify.delete('/api/terminals/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        if (!id) {
          reply.status(400).send({ error: 'Terminal ID is required' });
          return;
        }
        const query = request.query as any;
        const { signal } = query;

        await this.terminalManager.killTerminal(id, signal as string);

        // 广播终端终止事件 / Broadcast terminal termination event
        this.broadcast({
          type: 'terminal_killed',
          terminalId: id
        });

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
    this.fastify.get('/api/terminals/:id/stats', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        if (!id) {
          reply.status(400).send({ error: 'Terminal ID is required' });
          return;
        }
        const result = await this.terminalManager.getTerminalStats(id);
        return result;
      } catch (error) {
        reply.status(400).send({
          error: 'Failed to get terminal stats',
          message: error instanceof Error ? error.message : String(error)
        });
        return;
      }
    });

    // 设置相关API / Settings related API
    this.setupSettingsRoutes();
  }

  /**
   * 设置设置相关的API路由
   * Setup settings related API routes
   */
  private setupSettingsRoutes(): void {
    const configPath = path.resolve(process.cwd(), 'config.yml');

    // 获取设置 / Get settings
    this.fastify.get('/api/settings', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 检查配置文件是否存在 / Check if config file exists
        try {
          await fs.access(configPath);
        } catch {
          // 文件不存在，返回默认设置 / File doesn't exist, return default settings
          return {
            language: 'zh'
          };
        }

        // 读取配置文件 / Read config file
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = yaml.load(configContent) as any;
        
        return {
          language: config.language || 'zh'
        };
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
    this.fastify.post('/api/settings', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { language } = request.body as any;

        if (!language || (language !== 'zh' && language !== 'en')) {
          reply.status(400).send({
            error: 'Invalid language setting'
          });
          return;
        }

        // 读取现有配置 / Read existing configuration
        let config: any = {};
        try {
          const configContent = await fs.readFile(configPath, 'utf8');
          config = yaml.load(configContent) as any || {};
        } catch {
          // 文件不存在或读取失败，使用空配置
          // File doesn't exist or read failed, use empty config
        }

        // 更新语言设置 / Update language setting
        config.language = language;

        // 写入配置文件 / Write config file
        const yamlContent = yaml.dump(config, {
          indent: 2,
          lineWidth: 120
        });
        
        await fs.writeFile(configPath, yamlContent, 'utf8');

        return {
          success: true,
          message: 'Settings saved successfully',
          language
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

    // 重置设置 / Reset settings
    this.fastify.delete('/api/settings', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 删除配置文件 / Delete config file
        try {
          await fs.unlink(configPath);
        } catch {
          // 文件不存在，忽略错误 / File doesn't exist, ignore error
        }

        return {
          success: true,
          message: 'Settings reset successfully'
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
  private async setupWebSocket(): Promise<void> {
    // 注册 Fastify WebSocket 插件
    // Register Fastify WebSocket plugin
    await this.fastify.register(import('@fastify/websocket'));

    // 设置 WebSocket 路由
    // Setup WebSocket route
    this.fastify.get('/ws', { websocket: true }, (connection /* WebSocket */, req /* FastifyRequest */) => {
      this.clients.add(connection);

      process.stderr.write('[WEB-UI] WebSocket client connected\n');

      connection.on('close', () => {
        this.clients.delete(connection);
        process.stderr.write('[WEB-UI] WebSocket client disconnected\n');
      });

      connection.on('error', (error: any) => {
        process.stderr.write(`[WEB-UI] WebSocket error: ${error}\n`);
      });
    });

    // 监听终端事件并广播 / Listen to terminal events and broadcast
    this.terminalManager.on('terminalOutput', (terminalId: string, data: string) => {
      this.broadcast({
        type: 'output',
        terminalId,
        data
      });
    });

    this.terminalManager.on('terminalExit', (terminalId: string) => {
      this.broadcast({
        type: 'exit',
        terminalId
      });
    });
  }

  /**
   * 广播消息给所有客户端
   * Broadcast message to all clients
   */
  private broadcast(message: any): void {
    const payload = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(payload);
      }
    });
  }
/**
 * 启动服务器
 * Start server
 */
async start(port: number): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      // 先设置 WebSocket
      // Setup WebSocket first
      await this.setupWebSocket();
      
      // 启动 Fastify 服务器
      // Start Fastify server
      await this.fastify.listen({ port, host: '0.0.0.0' });
      
      process.stderr.write(`[WEB-UI] Server started on http://localhost:${port}\n`);
      process.stderr.write(`[WEB-UI] WebSocket available at ws://localhost:${port}/ws\n`);
      
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 停止服务器
 * Stop server
 */
async stop(): Promise<void> {
  return new Promise(async (resolve) => {
    // 关闭所有 WebSocket 连接 / Close all WebSocket connections
    this.clients.forEach((client) => {
      client.close();
    });
    this.clients.clear();

    // 关闭 Fastify 服务器 / Close Fastify server
    await this.fastify.close();
    process.stderr.write('[WEB-UI] Server stopped\n');
    
    resolve();
  });
}
}