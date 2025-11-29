import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { TerminalManager } from './terminal-manager.js';
import { configManager } from './config-manager.js';
import {
  CreateTerminalInput,
  WriteTerminalInput,
  ReadTerminalInput,
  KillTerminalInput
} from './types.js';

/**
 * REST API 服务器 - 使用 Fastify 框架
 * REST API Server - Using Fastify framework
 * 提供 HTTP 接口来管理终端会话
 * Provides HTTP interfaces to manage terminal sessions
 */
export class TerminalApiRoutes {
  private fastify: FastifyInstance;
  private terminalManager: TerminalManager;

  constructor(terminalManager: TerminalManager) {
    this.fastify = Fastify({ logger: false });
    this.terminalManager = terminalManager;
    this.setupRoutes();
  }

  /**
   * 设置路由
   * Setup routes
   */
  private setupRoutes(): void {
    // 这个方法现在只设置内部实例的路由
    // This method now only sets up routes for the internal instance
    // 实际路由注册在 setupRoutesOnInstance 中进行
    // Actual route registration happens in setupRoutesOnInstance
  }

  /**
   * 注册路由到 Fastify 实例
   * Register routes to Fastify instance
   */
  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // Fastify doesn't expose routes directly, so we need to re-register the routes
    // Fastify不直接暴露routes，所以我们需要重新注册路由
    this.setupRoutesOnInstance(fastify);
  }

  /**
   * 在指定的Fastify实例上设置路由
   * Setup routes on specified Fastify instance
   */
  private setupRoutesOnInstance(fastify: FastifyInstance): void {
    // 健康检查 / Health check
    fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
      const stats = this.terminalManager.getStats();
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        stats
      };
    });

    // 创建终端 / Create terminal
    fastify.post('/api/terminals', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const input: CreateTerminalInput = request.body as CreateTerminalInput;
        // 确保 terminalName 存在，如果不存在则使用 undefined
        // Ensure terminalName exists, use undefined if it doesn't
        const createOptions: any = {
          ...input,
          terminalName: input.terminalName || undefined
        };
        const terminalId = await this.terminalManager.createTerminal(createOptions);
        const session = this.terminalManager.getTerminalInfo(terminalId);

        if (!session) {
          reply.status(500).send({
            error: 'Failed to retrieve session info'
          });
          return;
        }

        reply.status(201).send({
          terminalId,
          status: session.status,
          pid: session.pid,
          shell: session.shell,
          cwd: session.cwd,
          created: session.created.toISOString()
        });
      } catch (error) {
        reply.status(400).send({
          error: 'Failed to create terminal',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // 列出所有终端 / List all terminals
    fastify.get('/api/terminals', async (request: FastifyRequest, reply: FastifyReply) => {
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

    // 获取特定终端信息 / Get specific terminal info
    fastify.get('/api/terminals/:terminalId', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { terminalId } = request.params as { terminalId: string };
        
        if (!terminalId) {
          reply.status(400).send({ error: 'Terminal ID is required' });
          return;
        }

        const session = this.terminalManager.getTerminalInfo(terminalId);

        if (!session) {
          reply.status(404).send({
            error: 'Terminal not found'
          });
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

    // 向终端写入数据 / Write data to terminal
    fastify.post('/api/terminals/:terminalId/input', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { terminalId } = request.params as { terminalId: string };
        const { input, appendNewline } = request.body as WriteTerminalInput;

        if (!terminalId) {
          reply.status(400).send({ error: 'Terminal ID is required' });
          return;
        }

        if (!input) {
          reply.status(400).send({
            error: 'Input is required'
          });
          return;
        }

        const writeOptions: any = {
          terminalName: terminalId,
          input
        };
        if (appendNewline !== undefined) {
          writeOptions.appendNewline = appendNewline;
        }
        await this.terminalManager.writeToTerminal(writeOptions);

        return {
          success: true,
          message: 'Input sent successfully'
        };
      } catch (error) {
        reply.status(400).send({
          error: 'Failed to write to terminal',
          message: error instanceof Error ? error.message : String(error)
        });
        return;
      }
    });

    // 读取终端输出（增强版）/ Read terminal output (enhanced version)
    fastify.get('/api/terminals/:terminalId/output', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { terminalId } = request.params as { terminalId: string };
        const query = request.query as any;
        const since = query.since ? parseInt(query.since) : undefined;
        const maxLines = query.maxLines ? parseInt(query.maxLines) : undefined;
        const mode = query.mode || undefined;
        const headLines = query.headLines ? parseInt(query.headLines) : undefined;
        const tailLines = query.tailLines ? parseInt(query.tailLines) : undefined;

        const result = await this.terminalManager.readFromTerminal({
          terminalName: terminalId!,
          since: since || undefined,
          maxLines: maxLines || undefined,
          mode: mode as any || undefined,
          headLines: headLines || undefined,
          tailLines: tailLines || undefined
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

    // 获取终端统计信息 / Get terminal statistics
    fastify.get('/api/terminals/:terminalId/stats', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { terminalId } = request.params as { terminalId: string };

        if (!terminalId) {
          reply.status(400).send({ error: 'Terminal ID is required' });
          return;
        }

        const result = await this.terminalManager.getTerminalStats(terminalId);
        return result;
      } catch (error) {
        reply.status(400).send({
          error: 'Failed to get terminal stats',
          message: error instanceof Error ? error.message : String(error)
        });
        return;
      }
    });

    // 终止终端 / Terminate terminal
    fastify.delete('/api/terminals/:terminalId', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { terminalId } = request.params as { terminalId: string };
        const query = request.query as any;
        const signal = query.signal || 'SIGTERM';

        await this.terminalManager.killTerminal(terminalId!, signal);

        return {
          success: true,
          message: 'Terminal terminated successfully'
        };
      } catch (error) {
        reply.status(400).send({
          error: 'Failed to terminate terminal',
          message: error instanceof Error ? error.message : String(error)
        });
        return;
      }
    });

    // 调整终端大小 / Resize terminal
    fastify.put('/api/terminals/:terminalId/resize', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { terminalId } = request.params as { terminalId: string };
        const { cols, rows } = request.body as any;

        if (!cols || !rows) {
          reply.status(400).send({
            error: 'Both cols and rows are required'
          });
          return;
        }

        await this.terminalManager.resizeTerminal(terminalId!, cols, rows);

        return {
          success: true,
          message: 'Terminal resized successfully'
        };
      } catch (error) {
        reply.status(400).send({
          error: 'Failed to resize terminal',
          message: error instanceof Error ? error.message : String(error)
        });
        return;
      }
    });

    // 获取管理器统计信息 / Get manager statistics
    fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const stats = this.terminalManager.getStats();
        return stats;
      } catch (error) {
        reply.status(500).send({
          error: 'Failed to get stats',
          message: error instanceof Error ? error.message : String(error)
        });
        return;
      }
    });

    // 设置相关API - 获取配置 / Settings API - Get configuration
    fastify.get('/api/settings', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const config = configManager.getAll();
        return config;
      } catch (error) {
        console.error('Error reading config:', error);
        reply.status(500).send({
          error: 'Failed to read configuration',
          message: error instanceof Error ? error.message : String(error)
        });
        return;
      }
    });

    // 设置相关API - 保存配置 / Settings API - Save configuration
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

        // 读取现有配置以保留其他设置 / Read existing config to preserve other settings
        const existingConfig = configManager.getAll();

        // 合并配置，只更新提供的字段 / Merge config, only update provided fields
        const mergedConfig = {
          ...existingConfig,
          ...newConfig
        };

        // 保存配置 / Save configuration
        for (const [key, value] of Object.entries(newConfig)) {
          await configManager.set(key, value);
        }

        return {
          success: true,
          message: 'Configuration saved successfully',
          config: mergedConfig
        };
      } catch (error) {
        console.error('Error saving config:', error);
        reply.status(500).send({
          error: 'Failed to save configuration',
          message: error instanceof Error ? error.message : String(error)
        });
        return;
      }
    });

    // 设置相关API - 重置配置 / Settings API - Reset configuration
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
        console.error('Error resetting config:', error);
        reply.status(500).send({
          error: 'Failed to reset configuration',
          message: error instanceof Error ? error.message : String(error)
        });
        return;
      }
    });

    // API 文档 / API documentation
    fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
      return {
        name: 'Cheestard Terminal Interactive REST API',
        version: '1.0.0',
        description: 'REST API for managing Cheestard Terminal Interactive sessions',
        endpoints: {
          'GET /health': 'Health check and stats',
          'POST /api/terminals': 'Create a new terminal session',
          'GET /api/terminals': 'List all terminal sessions',
          'GET /api/terminals/:id': 'Get terminal session info',
          'POST /api/terminals/:id/input': 'Send input to terminal',
          'GET /api/terminals/:id/output': 'Read terminal output',
          'DELETE /api/terminals/:id': 'Terminate terminal session',
          'PUT /api/terminals/:id/resize': 'Resize terminal',
          'GET /stats': 'Get manager statistics',
          'GET /api/settings': 'Get application configuration',
          'POST /api/settings': 'Save application configuration',
          'POST /api/settings/reset': 'Reset configuration to defaults'
        },
        documentation: 'See README.md for detailed usage instructions'
      };
    });
  }

  /**
   * 获取 Fastify 实例
   * Get Fastify instance
   */
  getFastifyInstance(): FastifyInstance {
    return this.fastify;
  }
}