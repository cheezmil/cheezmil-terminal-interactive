import { FastifyInstance } from 'fastify';
import { configManager } from './config-manager.js';

/**
 * API 文档生成器 - 动态生成API文档供前端使用
 * API Documentation Generator - Dynamically generate API documentation for frontend use
 */
export class ApiDocsGenerator {
  private apiEndpoints: Map<string, any> = new Map();

  constructor() {
    this.initializeApiEndpoints();
  }

  /**
   * 初始化API端点定义
   * Initialize API endpoint definitions
   */
  private initializeApiEndpoints(): void {
    // 终端管理相关API / Terminal management related APIs
    this.apiEndpoints.set('terminals', {
      list: {
        method: 'GET',
        path: '/api/terminals',
        description: '获取所有终端列表 / Get all terminals list',
        parameters: {},
        response: {
          type: 'object',
          properties: {
            terminals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string' },
                  pid: { type: 'number' },
                  shell: { type: 'string' },
                  cwd: { type: 'string' },
                  created: { type: 'string' }
                }
              }
            }
          }
        }
      },
      killAll: {
        method: 'POST',
        path: '/api/terminals/kill-all',
        description: '终结所有终端 / Terminate all terminals',
        parameters: {},
        response: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            total: { type: 'number' },
            killed: { type: 'number' },
            failed: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      },
      create: {
        method: 'POST',
        path: '/api/terminals',
        description: '创建新终端 / Create new terminal',
        parameters: {
          shell: { type: 'string', optional: true },
          cwd: { type: 'string', optional: true },
          env: { type: 'object', optional: true },
          terminalName: { type: 'string', optional: true }
        },
        response: {
          type: 'object',
          properties: {
            terminalId: { type: 'string' },
            status: { type: 'string' },
            pid: { type: 'number' },
            shell: { type: 'string' },
            cwd: { type: 'string' },
            created: { type: 'string' }
          }
        }
      },
      get: {
        method: 'GET',
        path: '/api/terminals/:id',
        description: '获取特定终端信息 / Get specific terminal info',
        parameters: {
          id: { type: 'string', required: true }
        },
        response: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            pid: { type: 'number' },
            shell: { type: 'string' },
            cwd: { type: 'string' },
            created: { type: 'string' },
            lastActivity: { type: 'string' },
            status: { type: 'string' }
          }
        }
      },
      write: {
        method: 'POST',
        path: '/api/terminals/:id/input',
        description: '向终端写入输入 / Write input to terminal',
        parameters: {
          id: { type: 'string', required: true },
          input: { type: 'string', required: true },
          appendNewline: { type: 'boolean', optional: true }
        },
        response: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      },
      read: {
        method: 'GET',
        path: '/api/terminals/:id/output',
        description: '读取终端输出 / Read terminal output',
        parameters: {
          id: { type: 'string', required: true },
          since: { type: 'number', optional: true },
          maxLines: { type: 'number', optional: true },
          mode: { type: 'string', optional: true },
          headLines: { type: 'number', optional: true },
          tailLines: { type: 'number', optional: true }
        },
        response: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            lineCount: { type: 'number' },
            hasMore: { type: 'boolean' }
          }
        }
      },
      stats: {
        method: 'GET',
        path: '/api/terminals/:id/stats',
        description: '获取终端统计信息 / Get terminal statistics',
        parameters: {
          id: { type: 'string', required: true }
        },
        response: {
          type: 'object',
          properties: {
            bufferStats: { type: 'object' },
            sessionStats: { type: 'object' }
          }
        }
      },
      kill: {
        method: 'DELETE',
        path: '/api/terminals/:id',
        description: '终止终端 / Terminate terminal',
        parameters: {
          id: { type: 'string', required: true },
          signal: { type: 'string', optional: true }
        },
        response: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      },
      resize: {
        method: 'PUT',
        path: '/api/terminals/:id/resize',
        description: '调整终端大小 / Resize terminal',
        parameters: {
          id: { type: 'string', required: true },
          cols: { type: 'number', required: true },
          rows: { type: 'number', required: true }
        },
        response: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    });

    // 系统信息相关 API / System info related APIs
    this.apiEndpoints.set('system', {
      version: {
        method: 'GET',
        path: '/api/version',
        description: '获取版本信息（含更新提示） / Get version info (with update hint)',
        parameters: {},
        response: {
          type: 'object',
          properties: {
            currentVersion: { type: 'string' },
            latestVersion: { type: 'string' },
            updateAvailable: { type: 'boolean' },
            lastCheckedAt: { type: 'string' },
            remoteVersionUrl: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    });

    // 设置相关API / Settings related APIs
    this.apiEndpoints.set('settings', {
      reload: {
        method: 'GET',
        path: '/api/settings/reload',
        description: '从磁盘重新加载配置 / Reload configuration from disk',
        parameters: {},
        response: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            config: { type: 'object' }
          }
        }
      },
      get: {
        method: 'GET',
        path: '/api/settings',
        description: '获取应用设置 / Get application settings',
        parameters: {},
        response: {
          type: 'object',
          properties: {
            app: { type: 'object' },
            server: { type: 'object' },
            terminal: { type: 'object' },
            mcp: { type: 'object' },
            logging: { type: 'object' }
          }
        }
      },
      save: {
        method: 'POST',
        path: '/api/settings',
        description: '保存应用设置 / Save application settings',
        parameters: {
          // 动态参数，可以是任何配置项
          // Dynamic parameters, can be any configuration item
        },
        response: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            config: { type: 'object' }
          }
        }
      },
      reset: {
        method: 'POST',
        path: '/api/settings/reset',
        description: '重置应用设置 / Reset application settings',
        parameters: {},
        response: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            config: { type: 'object' }
          }
        }
      }
    });

    // 系统相关API / System related APIs
    this.apiEndpoints.set('system', {
      health: {
        method: 'GET',
        path: '/health',
        description: '健康检查 / Health check',
        parameters: {},
        response: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            activeSessions: { type: 'number' }
          }
        }
      },
      stats: {
        method: 'GET',
        path: '/stats',
        description: '获取系统统计信息 / Get system statistics',
        parameters: {},
        response: {
          type: 'object',
          properties: {
            totalTerminals: { type: 'number' },
            activeTerminals: { type: 'number' },
            totalBufferUsage: { type: 'number' }
          }
        }
      }
    });
  }

  /**
   * 生成完整的API文档
   * Generate complete API documentation
   */
  public generateApiDocs(): any {
    const serverConfig = configManager.getServerConfig();
    const baseUrl = `http://${serverConfig.host}:${serverConfig.port}`;

    const docs: any = {
      name: 'Cheezmil Terminal Interactive API',
      version: '1.0.0',
      baseUrl,
      description: 'RESTful API for managing terminal sessions and application settings',
      endpoints: {},
      generatedAt: new Date().toISOString()
    };

    // 转换API端点为文档格式 / Convert API endpoints to documentation format
    for (const [category, endpoints] of this.apiEndpoints) {
      docs.endpoints[category] = {};
      
      for (const [action, endpoint] of Object.entries(endpoints)) {
        const endpointObj = endpoint as any;
        docs.endpoints[category][action] = {
          ...endpointObj,
          fullUrl: `${baseUrl}${endpointObj.path}`
        };
      }
    }

    return docs;
  }

  /**
   * 获取特定API端点信息
   * Get specific API endpoint information
   */
  public getEndpoint(category: string, action: string): any {
    const endpoints = this.apiEndpoints.get(category);
    if (!endpoints) {
      return null;
    }

    const endpoint = endpoints[action];
    if (!endpoint) {
      return null;
    }

    const serverConfig = configManager.getServerConfig();
    const baseUrl = `http://${serverConfig.host}:${serverConfig.port}`;

    return {
      ...endpoint,
      fullUrl: `${baseUrl}${endpoint.path}`
    };
  }

  /**
   * 注册API文档路由到Fastify实例
   * Register API documentation routes to Fastify instance
   */
  public async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // 获取完整API文档 / Get complete API documentation
    fastify.get('/api/docs', async (request: any, reply: any) => {
      return this.generateApiDocs();
    });

    // 获取特定类别的API文档 / Get API documentation for specific category
    fastify.get('/api/docs/:category', async (request: any, reply: any) => {
      const { category } = request.params;
      const endpoints = this.apiEndpoints.get(category);
      
      if (!endpoints) {
        reply.status(404).send({
          error: 'Category not found',
          availableCategories: Array.from(this.apiEndpoints.keys())
        });
        return;
      }

      const serverConfig = configManager.getServerConfig();
      const baseUrl = `http://${serverConfig.host}:${serverConfig.port}`;

      const categoryDocs: any = {
        category,
        endpoints: {}
      };

      for (const [action, endpoint] of Object.entries(endpoints)) {
        const endpointObj = endpoint as any;
        categoryDocs.endpoints[action] = {
          ...endpointObj,
          fullUrl: `${baseUrl}${endpointObj.path}`
        };
      }

      return categoryDocs;
    });

    // 获取特定API端点信息 / Get specific API endpoint information
    fastify.get('/api/docs/:category/:action', async (request: any, reply: any) => {
      const { category, action } = request.params;
      const endpoint = this.getEndpoint(category, action);
      
      if (!endpoint) {
        reply.status(404).send({
          error: 'Endpoint not found',
          availableCategories: Array.from(this.apiEndpoints.keys())
        });
        return;
      }

      return endpoint;
    });

    // 获取API基础URL / Get API base URL
    fastify.get('/api/base-url', async (request: any, reply: any) => {
      const serverConfig = configManager.getServerConfig();
      return {
        baseUrl: `http://${serverConfig.host}:${serverConfig.port}`,
        apiPrefix: '/api'
      };
    });
  }
}

// 导出单例实例 / Export singleton instance
export const apiDocsGenerator = new ApiDocsGenerator();
