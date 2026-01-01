import { WebUIServer } from './web-ui-server.js';
import { WebUIStartOptions, WebUIStartResult } from './types.js';
import { exec } from 'child_process';
import { createServer } from 'net';

/**
 * Web UI 管理器
 * 负责管理 Web 服务器的生命周期、端口分配和浏览器打开
 */
export class WebUIManager {
  private server: WebUIServer | null = null;
  private currentPort: number | null = null;

  /**
   * 启动 Web UI
   */
  async start(options: WebUIStartOptions): Promise<WebUIStartResult> {
    // 如果已经启动，先停止现有服务器
    if (this.server && this.currentPort) {
      await this.server.stop();
      this.server = null;
      this.currentPort = null;
    }

    // 查找可用端口
    const port = await this.findAvailablePort(options.port || 1107);

    // 启动 Web 服务器
    this.server = new WebUIServer(options.terminalManager);
    await this.server.start(port);
    this.currentPort = port;

    const url = `http://localhost:${port}`;

    // 自动打开浏览器
    let autoOpened = false;
    if (options.autoOpen !== false) {
      try {
        await this.openBrowser(url);
        autoOpened = true;
      } catch (error) {
        // 打开失败不影响功能，只记录日志
        if (process.env.MCP_DEBUG === 'true') {
          process.stderr.write(`[MCP-DEBUG] Failed to open browser: ${error}\n`);
        }
      }
    }

    return {
      url,
      port,
      mode: 'new',
      autoOpened
    };
  }

  /**
   * 停止 Web UI
   */
  async stop(): Promise<void> {
    if (this.server) {
      await this.server.stop();
      this.server = null;
      this.currentPort = null;
    }
  }

  /**
   * 查找可用端口
   */
  private async findAvailablePort(startPort: number): Promise<number> {
    // 首先检查默认端口1107是否可用
    const defaultPortAvailable = await this.isPortAvailable(startPort);
    if (defaultPortAvailable) {
      return startPort;
    }
    
    // 如果1107端口被占用，强制结束占用该端口的进程
    if (startPort === 1107) {
      try {
        await this.killPortProcess(startPort);
        // 等待一段时间让进程完全结束
        await new Promise(resolve => setTimeout(resolve, 1000));
        // 再次检查端口是否可用
        const nowAvailable = await this.isPortAvailable(startPort);
        if (nowAvailable) {
          return startPort;
        }
      } catch (error) {
        // 如果结束进程失败，记录错误但继续尝试其他端口
        if (process.env.MCP_DEBUG === 'true') {
          process.stderr.write(`[MCP-DEBUG] Failed to kill process on port ${startPort}: ${error}\n`);
        }
      }
    }
    
    // 如果仍然无法使用1107端口，尝试其他端口
    for (let port = startPort + 1; port < startPort + 100; port++) {
      const available = await this.isPortAvailable(port);
      if (available) {
        return port;
      }
    }
    throw new Error(`No available ports found in range ${startPort}-${startPort + 99}`);
  }

  /**
   * 检查端口是否可用
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();

      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(true);
      });

      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * 强制结束占用指定端口的进程
   */
  private async killPortProcess(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let command: string;
      
      if (process.platform === 'win32') {
        // Windows系统
        command = `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port}') do taskkill /f /pid %a`;
      } else {
        // Linux/macOS系统
        command = `lsof -ti:${port} | xargs kill -9`;
      }

      exec(command, (error) => {
        // 即使命令执行失败（可能是因为没有进程占用该端口），也认为操作成功
        resolve();
      });
    });
  }

  /**
   * 打开浏览器
   */
  private async openBrowser(url: string): Promise<void> {
    const commands: Record<string, string> = {
      darwin: `open "${url}"`,
      win32: `start "" "${url}"`,
      linux: `xdg-open "${url}"`
    };

    const command = commands[process.platform as keyof typeof commands];

    if (!command) {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }

    return new Promise((resolve, reject) => {
      exec(command, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 获取当前状态
   */
  getStatus(): { running: boolean; port: number | null; url: string | null } {
    return {
      running: this.server !== null,
      port: this.currentPort,
      url: this.currentPort ? `http://localhost:${this.currentPort}` : null
    };
  }
}

