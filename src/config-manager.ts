import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

/**
 * 配置管理器 - 集中管理config.yml文件
 * Configuration Manager - Centrally manage config.yml file
 */
export class ConfigManager {
  private configPath: string;
  private config: any = {};
  private defaultConfig: any;

  constructor() {
    this.configPath = path.join(process.cwd(), 'config.yml');
    this.defaultConfig = {
      // 应用配置 / Application configuration
      app: {
        language: 'zh',
        // 是否显示顶部标题 / Whether to show top title
        showTitle: true
      },
      
      // 服务器配置 / Server configuration
      server: {
        host: '127.0.0.1',
        port: 1106,
        cors: {
          origin: ['http://localhost:1107', 'http://127.0.0.1:1107'],
          credentials: true
        }
      },
      
      // 终端配置 / Terminal configuration
      terminal: {
        defaultShell: 'pwsh.exe',
        fontSize: 14,
        fontFamily: 'Consolas, "Courier New", monospace',
        maxBufferSize: 10000,
        sessionTimeout: 86400000, // 24 hours
        defaultEnv: {},
        // 是否允许前端控制终端（实验性）/ Whether to allow frontend to control terminals (experimental)
        enableUserControl: false
      },
      
      // MCP配置 / MCP configuration
      mcp: {
        enableDnsRebindingProtection: false,
        // 是否启用 MCP 服务器选择工具 / Whether to enable MCP server selection tool
        enableServerSelectionTool: true,
        // 通过配置禁用指定的 MCP 工具（对应 DISABLED_TOOLS 环境变量）
        // Disable specific MCP tools via config (mapped to DISABLED_TOOLS environment variable)
        disabledTools: [] as string[],
        // 命令黑名单：当 MCP 客户端发送匹配命令时，后端将拒绝执行并返回提示
        // Command blacklist: when MCP client sends a matching command, backend will refuse and return a message
        commandBlacklist: {
          // 是否不区分命令大小写 / Whether to ignore command case when matching
          caseInsensitive: true,
          // 被禁用的命令列表 / Disabled command list
          // message 为空或未提供时，将返回默认提示 / When message is empty or missing, default message will be returned
          rules: [] as Array<{ command: string; message?: string }>
        },
        allowedHosts: ['127.0.0.1', 'localhost', 'localhost:1106']
      },
      
      // 日志配置 / Logging configuration
      logging: {
        level: 'info',
        enableConsole: true,
        enableFile: false,
        filePath: './logs/app.log'
      }
    };
    
    this.initializeConfig();
  }

  /**
   * 初始化配置文件
   * Initialize configuration file
   */
  private async initializeConfig(): Promise<void> {
    try {
      // 检查配置文件是否存在 / Check if config file exists
      if (!fs.existsSync(this.configPath)) {
        await this.createDefaultConfig();
      } else {
        await this.loadConfig();
        await this.validateAndMergeConfig();
      }
    } catch (error) {
      console.error('[CONFIG-ERROR] Failed to initialize config:', error);
      // 如果初始化失败，使用默认配置 / If initialization fails, use default config
      this.config = { ...this.defaultConfig };
    }
  }

  /**
   * 创建默认配置文件
   * Create default configuration file
   */
  private async createDefaultConfig(): Promise<void> {
    try {
      const yamlContent = yaml.dump(this.defaultConfig, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false
      });
      
      fs.writeFileSync(this.configPath, yamlContent, 'utf8');
      this.config = { ...this.defaultConfig };
      console.log('[CONFIG-INFO] Created default configuration file');
    } catch (error) {
      console.error('[CONFIG-ERROR] Failed to create default config:', error);
      throw error;
    }
  }

  /**
   * 加载配置文件
   * Load configuration file
   */
  private async loadConfig(): Promise<void> {
    try {
      const fileContent = fs.readFileSync(this.configPath, 'utf8');
      this.config = yaml.load(fileContent) || {};
    } catch (error) {
      console.error('[CONFIG-ERROR] Failed to load config:', error);
      throw error;
    }
  }

  /**
   * 验证并合并配置
   * Validate and merge configuration
   */
  private async validateAndMergeConfig(): Promise<void> {
    try {
      // 深度合并配置，确保所有必需字段都存在
      this.config = this.deepMerge(this.defaultConfig, this.config);
      
      // 保存更新后的配置
      await this.saveConfig();
    } catch (error) {
      console.error('[CONFIG-ERROR] Failed to validate and merge config:', error);
      throw error;
    }
  }

  /**
   * 深度合并对象
   * Deep merge objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(target[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }

  /**
   * 保存配置文件
   * Save configuration file
   */
  private async saveConfig(): Promise<void> {
    try {
      const yamlContent = yaml.dump(this.config, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false
      });
      
      fs.writeFileSync(this.configPath, yamlContent, 'utf8');
    } catch (error) {
      console.error('[CONFIG-ERROR] Failed to save config:', error);
      throw error;
    }
  }

  /**
   * 获取配置值
   * Get configuration value
   */
  public get(key: string): any {
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * 设置配置值
   * Set configuration value
   */
  public async set(key: string, value: any): Promise<void> {
    const keys = key.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i] as string;
      if (!current[k] || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }
    
    current[keys[keys.length - 1] as string] = value;
    await this.saveConfig();
  }

  /**
   * 获取完整配置
   * Get complete configuration
   */
  public getAll(): any {
    // 始终将当前配置与默认配置深度合并，确保结构完整
    // Always deep-merge current config with default config to ensure full structure
    const mergedConfig = this.deepMerge(this.defaultConfig, this.config || {});
    return { ...mergedConfig };
  }

  /**
   * 重置配置为默认值
   * Reset configuration to default values
   */
  public async reset(): Promise<void> {
    this.config = { ...this.defaultConfig };
    await this.saveConfig();
  }

  /**
   * 获取服务器配置
   * Get server configuration
   */
  public getServerConfig(): any {
    return this.get('server');
  }

  /**
   * 获取终端配置
   * Get terminal configuration
   */
  public getTerminalConfig(): any {
    return this.get('terminal');
  }

  /**
   * 获取应用配置
   * Get application configuration
   */
  public getAppConfig(): any {
    return this.get('app');
  }

  /**
   * 获取MCP配置
   * Get MCP configuration
   */
  public getMcpConfig(): any {
    return this.get('mcp');
  }

  /**
   * 获取日志配置
   * Get logging configuration
   */
  public getLoggingConfig(): any {
    return this.get('logging');
  }
}

// 导出单例实例 / Export singleton instance
export const configManager = new ConfigManager();
