import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

type NewlineStyle = '\n' | '\r\n';

function detectNewlineStyle(text: string): NewlineStyle {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

function formatYamlScalar(value: any): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') {
    const escaped = value.replace(/'/g, "''");
    return `'${escaped}'`;
  }
  return yaml.dump(value, { indent: 2, lineWidth: 120, noRefs: true, sortKeys: false }).trimEnd();
}

function splitInlineComment(line: string): { before: string; comment: string } {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? '';
    const prev = i > 0 ? (line[i - 1] ?? '') : '';
    if (!inDouble && ch === "'" && prev !== '\\') {
      // YAML single-quote escaping uses doubled quotes, treat '' as literal and don't toggle.
      // YAML 单引号转义使用两个单引号，遇到 '' 视为字面量，不切换状态。
      if (i + 1 < line.length && (line[i + 1] ?? '') === "'") {
        i++;
        continue;
      }
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && ch === '"' && prev !== '\\') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && ch === '#') {
      return { before: line.slice(0, i).trimEnd(), comment: line.slice(i) };
    }
  }
  return { before: line.trimEnd(), comment: '' };
}

function indentOfLine(line: string): string {
  const match = line.match(/^(\s*)/);
  return match ? (match[1] ?? '') : '';
}

function isBlankOrComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length === 0 || trimmed.startsWith('#');
}

function findBlockEnd(lines: string[], startIndex: number, parentIndentLen: number): number {
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i] as string;
    if (isBlankOrComment(line)) continue;
    const indentLen = indentOfLine(line).length;
    if (indentLen <= parentIndentLen) return i;
  }
  return lines.length;
}

function findMappingKeyLineIndex(
  lines: string[],
  startIndex: number,
  endIndex: number,
  indent: string,
  key: string
): number {
  const keyRe = new RegExp(`^${escapeRegExp(indent)}${escapeRegExp(key)}\\s*:\\s*(.*)$`);
  for (let i = startIndex; i < endIndex; i++) {
    const line = lines[i] as string;
    if (isBlankOrComment(line)) continue;
    if (keyRe.test(line)) return i;
  }
  return -1;
}

function setYamlValueByPathInText(yamlText: string, pathSegments: string[], value: any): string {
  const newline = detectNewlineStyle(yamlText);
  const hadTrailingNewline = yamlText.endsWith('\n');
  const normalized = hadTrailingNewline ? yamlText.replace(/\r?\n$/, '') : yamlText;
  const lines = normalized.split(/\r?\n/);

  const ensurePath = (): { parentStart: number; parentEnd: number; parentIndent: string } => {
    let parentStart = 0;
    let parentEnd = lines.length;
    let parentIndent = '';

    for (let depth = 0; depth < pathSegments.length - 1; depth++) {
      const segment = pathSegments[depth] as string;
      const parentLineIndex = findMappingKeyLineIndex(lines, parentStart, parentEnd, parentIndent, segment);
      if (parentLineIndex === -1) {
        // Create missing parent mapping key.
        // 创建缺失的父级映射键。
        const insertAt = parentEnd;
        lines.splice(insertAt, 0, `${parentIndent}${segment}:`);
        parentStart = insertAt + 1;
        parentEnd = lines.length;
        parentIndent = `${parentIndent}  `;
        continue;
      }

      const { before, comment } = splitInlineComment(lines[parentLineIndex] as string);
      // If parent was written as scalar, normalize to mapping header (keep inline comment).
      // 如果父级被写成了标量，规范化为映射头（保留行内注释）。
      if (before.includes(':') && before.trimEnd().match(/:\s*.+$/)) {
        lines[parentLineIndex] = `${before.replace(/:\s*.+$/, ':')}${comment ? ` ${comment}` : ''}`.trimEnd();
      }

      const blockStart = parentLineIndex + 1;
      const blockEnd = findBlockEnd(lines, blockStart, parentIndent.length);
      const detectedChildIndent = (() => {
        for (let i = blockStart; i < blockEnd; i++) {
          const line = lines[i] as string;
          if (isBlankOrComment(line)) continue;
          const indent = indentOfLine(line);
          if (indent.length > parentIndent.length) return indent;
          break;
        }
        return `${parentIndent}  `;
      })();

      parentStart = blockStart;
      parentEnd = blockEnd;
      parentIndent = detectedChildIndent;
    }

    return { parentStart, parentEnd, parentIndent };
  };

  const leafKey = pathSegments[pathSegments.length - 1] as string;
  const { parentStart, parentEnd, parentIndent } = ensurePath();
  const leafLineIndex = findMappingKeyLineIndex(lines, parentStart, parentEnd, parentIndent, leafKey);

  const replaceKeyBlock = (keyLineIndex: number, keyIndent: string, newBlockLines: string[]): void => {
    const blockStart = keyLineIndex + 1;
    const blockEnd = findBlockEnd(lines, blockStart, keyIndent.length);
    lines.splice(keyLineIndex, blockEnd - keyLineIndex, ...newBlockLines);
  };

  const makeArrayBlockLines = (keyIndent: string, key: string, arr: any[]): string[] => {
    const existingLine = leafLineIndex >= 0 ? (lines[leafLineIndex] as string) : '';
    const { comment } = existingLine ? splitInlineComment(existingLine) : { comment: '' };
    if (!arr || arr.length === 0) {
      return [`${keyIndent}${key}: []${comment ? ` ${comment}` : ''}`.trimEnd()];
    }
    const dumped = yaml
      .dump(arr, { indent: 2, lineWidth: 120, noRefs: true, sortKeys: false })
      .trimEnd()
      .split(/\r?\n/);
    const valueIndent = `${keyIndent}  `;
    const valueLines = dumped.map((l) => `${valueIndent}${l}`.trimEnd());
    return [`${keyIndent}${key}:${comment ? ` ${comment}` : ''}`.trimEnd(), ...valueLines];
  };

  if (Array.isArray(value)) {
    if (leafLineIndex === -1) {
      const insertAt = parentEnd;
      const blockLines = makeArrayBlockLines(parentIndent, leafKey, value);
      lines.splice(insertAt, 0, ...blockLines);
    } else {
      const keyIndent = indentOfLine(lines[leafLineIndex] as string);
      replaceKeyBlock(leafLineIndex, keyIndent, makeArrayBlockLines(keyIndent, leafKey, value));
    }
  } else {
    const formatted = formatYamlScalar(value);
    if (leafLineIndex === -1) {
      const insertAt = parentEnd;
      lines.splice(insertAt, 0, `${parentIndent}${leafKey}: ${formatted}`);
    } else {
      const original = lines[leafLineIndex] as string;
      const { before, comment } = splitInlineComment(original);
      const keyIndent = indentOfLine(original);
      const keyOnly = before.replace(/:\s*.*$/, ':').trimEnd();
      lines[leafLineIndex] = `${keyOnly} ${formatted}${comment ? ` ${comment}` : ''}`.trimEnd();

      const blockStart = leafLineIndex + 1;
      const blockEnd = findBlockEnd(lines, blockStart, keyIndent.length);
      if (blockEnd > blockStart) {
        let nextMeaningful = -1;
        for (let i = blockStart; i < blockEnd; i++) {
          if (!isBlankOrComment(lines[i] as string)) {
            nextMeaningful = i;
            break;
          }
        }
        if (nextMeaningful !== -1 && indentOfLine(lines[nextMeaningful] as string).length > keyIndent.length) {
          // If this key used to have a nested block, remove it (we now store a scalar).
          // 如果该键原本有子块，移除它（现在存储为标量）。
          lines.splice(blockStart, blockEnd - blockStart);
        }
      }
    }
  }

  const out = lines.join(newline);
  return hadTrailingNewline ? `${out}${newline}` : out;
}

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
      const examplePath = path.join(process.cwd(), 'config.example.yml');
      if (fs.existsSync(examplePath)) {
        // 优先使用带注释的示例配置，避免丢失中英文注释 / Prefer the commented example to avoid losing bilingual comments
        const exampleContent = fs.readFileSync(examplePath, 'utf8');
        fs.writeFileSync(this.configPath, exampleContent, 'utf8');
        await this.loadConfig();
        await this.validateAndMergeConfig();
        console.log('[CONFIG-INFO] Created configuration file from config.example.yml');
        return;
      }

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
    } catch (error) {
      console.error('[CONFIG-ERROR] Failed to validate and merge config:', error);
      throw error;
    }
  }

  /**
   * 从磁盘重新加载 config.yml（仅更新内存，不主动写回磁盘）
   * Reload config.yml from disk (update in-memory only, do not write back by default)
   */
  public async reloadFromDisk(): Promise<void> {
    try {
      if (!fs.existsSync(this.configPath)) {
        // 配置文件不存在时创建默认配置 / Create default config if missing
        await this.createDefaultConfig();
        return;
      }

      const fileContent = fs.readFileSync(this.configPath, 'utf8');
      const loaded = yaml.load(fileContent) || {};
      this.config = this.deepMerge(this.defaultConfig, loaded);
    } catch (error) {
      console.error('[CONFIG-ERROR] Failed to reload config from disk:', error);
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
   * 将配置更新写回到磁盘（尽量保留原 YAML 注释与格式）
   * Persist config updates to disk (best-effort preserving YAML comments and formatting)
   */
  private async persistUpdatesPreservingComments(updates: Array<{ path: string; value: any }>): Promise<void> {
    if (!updates || updates.length === 0) return;

    if (!fs.existsSync(this.configPath)) {
      await this.createDefaultConfig();
    }

    const raw = fs.readFileSync(this.configPath, 'utf8');
    let patched = raw;

    for (const update of updates) {
      const segments = update.path.split('.').filter(Boolean);
      if (segments.length === 0) continue;
      patched = setYamlValueByPathInText(patched, segments, update.value);
    }

    if (patched !== raw) {
      fs.writeFileSync(this.configPath, patched, 'utf8');
    }
  }

  /**
   * 批量应用部分配置（递归展开到叶子节点），并尽量保留 YAML 注释
   * Apply a partial config (flatten to leaf nodes) and preserve YAML comments when possible
   */
  public async applyPartialConfig(partial: any): Promise<void> {
    const updates: Array<{ path: string; value: any }> = [];

    const collect = (value: any, prefix: string[]) => {
      if (value === undefined) return;
      if (Array.isArray(value)) {
        updates.push({ path: prefix.join('.'), value });
        return;
      }
      if (isPlainObject(value)) {
        for (const [k, v] of Object.entries(value)) {
          collect(v, [...prefix, k]);
        }
        return;
      }
      updates.push({ path: prefix.join('.'), value });
    };

    if (isPlainObject(partial)) {
      for (const [k, v] of Object.entries(partial)) {
        collect(v, [k]);
      }
    } else {
      return;
    }

    const changed: Array<{ path: string; value: any }> = [];
    for (const u of updates) {
      const current = this.get(u.path);
      if (!deepEqual(current, u.value)) {
        changed.push(u);
      }
    }

    if (changed.length === 0) return;

    // Update in-memory config first.
    // 先更新内存配置。
    for (const u of changed) {
      const keys = u.path.split('.').filter(Boolean);
      let current = this.config;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i] as string;
        if (!current[k] || typeof current[k] !== 'object') current[k] = {};
        current = current[k];
      }
      current[keys[keys.length - 1] as string] = u.value;
    }

    await this.persistUpdatesPreservingComments(changed);
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
    // 保持兼容：允许 value 为对象/数组；统一走 applyPartialConfig，避免整段重写导致注释丢失
    // Backwards-compatible: allow object/array values; use applyPartialConfig to avoid overwriting blocks and losing comments
    await this.applyPartialConfig({ [key]: value });
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
    const examplePath = path.join(process.cwd(), 'config.example.yml');
    if (fs.existsSync(examplePath)) {
      // 重置时尽量恢复带注释的模板 / On reset, restore the commented template when available
      const exampleContent = fs.readFileSync(examplePath, 'utf8');
      fs.writeFileSync(this.configPath, exampleContent, 'utf8');
      await this.loadConfig();
      await this.validateAndMergeConfig();
      return;
    }

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
