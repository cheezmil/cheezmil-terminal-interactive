import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { TerminalManager } from './terminal-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Web UI 服务器
 * 提供静态文件服务、REST API 和 WebSocket 实时推送
 */
export class WebUIServer {
  private app: express.Application;
  private httpServer: HttpServer | null = null;
  private wss: WebSocketServer | null = null;
  private terminalManager: TerminalManager;
  private clients: Set<WebSocket> = new Set();

  constructor(terminalManager: TerminalManager) {
    this.terminalManager = terminalManager;
    this.app = express();
    this.setupMiddleware();
  }

  /**
   * 设置中间件
   */
  private setupMiddleware(): void {
    // JSON 解析
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // 请求日志
    this.app.use((req, res, next) => {
      process.stderr.write(`[WEB-UI] ${req.method} ${req.path}\n`);
      next();
    });

    // 静态文件服务 - 直接使用编译后的前端文件
    // 使用硬编码的绝对路径确保正确找到前端文件
    const frontendDistPath = 'D:/CodeRelated/cheestard-terminal-interactive/frontend/dist';
    this.app.use(express.static(frontendDistPath));
    console.log('使用编译后的前端文件，路径:', frontendDistPath);
    console.log('当前工作目录:', process.cwd());
    console.log('__dirname:', __dirname);
    
    // 同时提供public目录的静态文件
    const publicPath = path.resolve(__dirname, '..', 'public');
    this.app.use('/public', express.static(publicPath));
    
    // 后设置路由，确保静态文件服务优先
    this.setupRoutes();
  }

  /**
   * 设置路由
   */
  private setupRoutes(): void {
    // REST API 端点 - 必须在通配符路由之前
    this.setupApiRoutes();

    // 终端详情页 - 旧的HTML处理
    this.app.get('/terminal/:id', (req: Request, res: Response) => {
      const indexPath = 'D:/CodeRelated/cheestard-terminal-interactive/frontend/dist/index.html';
      res.sendFile(indexPath);
    });

    // 其他路径 - 支持SPA和静态文件，但不包括API路径
    this.app.get('*', (req: Request, res: Response) => {
      // 所有非API路径都返回编译后的Vue应用
      const indexPath = 'D:/CodeRelated/cheestard-terminal-interactive/frontend/dist/index.html';
      res.sendFile(indexPath);
    });
  }

  /**
   * 设置 API 路由
   */
  private setupApiRoutes(): void {
    // 获取所有终端
    this.app.get('/api/terminals', async (req: Request, res: Response) => {
      try {
        const result = await this.terminalManager.listTerminals();
        res.json(result);
      } catch (error) {
        res.status(500).json({
          error: 'Failed to list terminals',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // 获取终端详情
    this.app.get('/api/terminals/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        if (!id) {
          res.status(400).json({ error: 'Terminal ID is required' });
          return;
        }
        const session = this.terminalManager.getTerminalInfo(id);
        
        if (!session) {
          res.status(404).json({ error: 'Terminal not found' });
          return;
        }

        res.json({
          id: session.id,
          pid: session.pid,
          shell: session.shell,
          cwd: session.cwd,
          created: session.created.toISOString(),
          lastActivity: session.lastActivity.toISOString(),
          status: session.status
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to get terminal info',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // 创建终端
    this.app.post('/api/terminals', async (req: Request, res: Response) => {
      try {
        const { shell, cwd, env } = req.body;
        const terminalId = await this.terminalManager.createTerminal({
          shell,
          cwd,
          env
        });

        const session = this.terminalManager.getTerminalInfo(terminalId);
        
        res.status(201).json({
          terminalId,
          status: session?.status,
          pid: session?.pid,
          shell: session?.shell,
          cwd: session?.cwd
        });

        // 广播新终端创建事件
        this.broadcast({
          type: 'terminal_created',
          terminalId
        });
      } catch (error) {
        res.status(400).json({
          error: 'Failed to create terminal',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // 读取终端输出
    this.app.get('/api/terminals/:id/output', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        if (!id) {
          res.status(400).json({ error: 'Terminal ID is required' });
          return;
        }
        const { since, maxLines, mode } = req.query;

        const result = await this.terminalManager.readFromTerminal({
          terminalName: id,
          since: since ? parseInt(since as string) : undefined,
          maxLines: maxLines ? parseInt(maxLines as string) : undefined,
          mode: mode as any
        });

        res.json(result);
      } catch (error) {
        res.status(400).json({
          error: 'Failed to read terminal output',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // 写入终端输入
    this.app.post('/api/terminals/:id/input', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        if (!id) {
          res.status(400).json({ error: 'Terminal ID is required' });
          return;
        }
        const { input, appendNewline } = req.body;

        await this.terminalManager.writeToTerminal({
          terminalName: id,
          input,
          appendNewline
        });

        res.json({ success: true });
      } catch (error) {
        res.status(400).json({
          error: 'Failed to write to terminal',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // 终止终端
    this.app.delete('/api/terminals/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        if (!id) {
          res.status(400).json({ error: 'Terminal ID is required' });
          return;
        }
        const { signal } = req.query;

        await this.terminalManager.killTerminal(id, signal as string);

        res.json({ success: true });

        // 广播终端终止事件
        this.broadcast({
          type: 'terminal_killed',
          terminalId: id
        });
      } catch (error) {
        res.status(400).json({
          error: 'Failed to kill terminal',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // 获取终端统计
    this.app.get('/api/terminals/:id/stats', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        if (!id) {
          res.status(400).json({ error: 'Terminal ID is required' });
          return;
        }
        const result = await this.terminalManager.getTerminalStats(id);
        res.json(result);
      } catch (error) {
        res.status(400).json({
          error: 'Failed to get terminal stats',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  /**
   * 设置 WebSocket
   */
  private setupWebSocket(): void {
    if (!this.httpServer) return;

    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);

      process.stderr.write('[WEB-UI] WebSocket client connected\n');

      ws.on('close', () => {
        this.clients.delete(ws);
        process.stderr.write('[WEB-UI] WebSocket client disconnected\n');
      });

      ws.on('error', (error) => {
        process.stderr.write(`[WEB-UI] WebSocket error: ${error}\n`);
      });
    });

    // 监听终端事件并广播
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
   */
  private broadcast(message: any): void {
    const payload = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  /**
   * 启动服务器
   */
  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = createServer(this.app);
      
      this.httpServer.listen(port, '127.0.0.1', () => {
        process.stderr.write(`[WEB-UI] Server started on http://localhost:${port}\n`);
        
        // 启动 WebSocket
        this.setupWebSocket();
        
        resolve();
      });

      this.httpServer.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // 关闭所有 WebSocket 连接
      this.clients.forEach((client) => {
        client.close();
      });
      this.clients.clear();

      // 关闭 WebSocket 服务器
      if (this.wss) {
        this.wss.close();
        this.wss = null;
      }

      // 关闭 HTTP 服务器
      if (this.httpServer) {
        this.httpServer.close(() => {
          process.stderr.write('[WEB-UI] Server stopped\n');
          resolve();
        });
        this.httpServer = null;
      } else {
        resolve();
      }
    });
  }
}

