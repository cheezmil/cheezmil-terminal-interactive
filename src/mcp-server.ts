import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  CallToolResult,
  GetPromptResult,
  ReadResourceResult
} from '@modelcontextprotocol/sdk/types.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TerminalManager } from './terminal-manager.js';
import { WebUIManager } from './web-ui-manager.js';
import { configManager } from './config-manager.js';
import {
  CreateTerminalInput,
  CreateTerminalResult,
  WriteTerminalInput,
  WriteTerminalResult,
  ReadTerminalInput,
  ListTerminalsResult,
  KillTerminalInput,
  KillTerminalResult,
  TerminalStatsInput,
  TerminalStatsResult,
  TerminalCreateOptions
} from './types.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * MCP 服务器实现
 * 将终端管理功能暴露为 MCP 工具和资源
 */
export class cheezmilTerminalInteractiveServer {
  private server: McpServer;
  private terminalManager: TerminalManager;
  private webUiManager: WebUIManager;
  private backendProcess: any;
  private frontendProcess: any;
  // NOTE: Tool-level wait behavior should be explicit and structured.
  // 注意：工具层等待行为应当显式声明并结构化返回。

  private encodeSpecialOperationToInput(op: string): string | null {
    // 特殊按键/操作到终端输入序列的映射
    // Map special operations to terminal input sequences
    const normalized = (op || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/-/g, '+');

    switch (normalized) {
      case 'ctrl_c':
      case 'ctrl+c':
        return '\u0003';
      case 'ctrl_z':
      case 'ctrl+z':
        return '\u001a';
      case 'ctrl_d':
      case 'ctrl+d':
        return '\u0004';
      case 'esc':
      case 'escape':
        return '\u001b';
      case 'enter':
      case 'return':
        return '\r';
      case 'double_esc':
      case 'esc+esc':
        return '\u001b\u001b';
      default:
        return null;
    }
  }

  private encodeKeyTokenToInput(tokenRaw: string): string | null {
    // 支持尽可能多的快捷键/按键名称（大小写不敏感，允许 ctrl_c/ctrl+c/ctrl c 等）
    // Support as many key names as possible (case-insensitive; allows ctrl_c/ctrl+c/ctrl c)
    const token = (tokenRaw || '').trim();
    if (!token) return null;

    const normalized = token
      .toLowerCase()
      .replace(/_/g, '+')
      .replace(/\s+/g, '')
      .replace(/-/g, '+');

    const bySpecial = this.encodeSpecialOperationToInput(normalized);
    if (bySpecial) return bySpecial;

    // 直接字符 / Raw single character
    if (normalized.length === 1) {
      return token;
    }

    // u+001b / 0x1b 形式 / u+001b / 0x1b forms
    const uPlus = normalized.match(/^u\+([0-9a-f]{2,6})$/i);
    if (uPlus && uPlus[1]) {
      const codePoint = Number.parseInt(uPlus[1], 16);
      if (Number.isFinite(codePoint)) return String.fromCodePoint(codePoint);
    }
    const hex = normalized.match(/^0x([0-9a-f]{2,6})$/i);
    if (hex && hex[1]) {
      const code = Number.parseInt(hex[1], 16);
      if (Number.isFinite(code)) return String.fromCharCode(code);
    }

    // 常用控制键 / Common control keys
    switch (normalized) {
      case 'tab':
        return '\t';
      case 'shift+tab':
        return '\u001b[Z';
      case 'backspace':
        return '\u007f';
      case 'delete':
      case 'del':
        return '\u001b[3~';
      case 'insert':
      case 'ins':
        return '\u001b[2~';
      case 'home':
        return '\u001b[H';
      case 'end':
        return '\u001b[F';
      case 'pageup':
      case 'pgup':
        return '\u001b[5~';
      case 'pagedown':
      case 'pgdn':
        return '\u001b[6~';
      case 'up':
      case 'arrowup':
        return '\u001b[A';
      case 'down':
      case 'arrowdown':
        return '\u001b[B';
      case 'right':
      case 'arrowright':
        return '\u001b[C';
      case 'left':
      case 'arrowleft':
        return '\u001b[D';
    }

    // Function keys / 功能键
    const fn = normalized.match(/^f(\d{1,2})$/);
    if (fn && fn[1]) {
      const n = Number.parseInt(fn[1], 10);
      switch (n) {
        case 1: return '\u001bOP';
        case 2: return '\u001bOQ';
        case 3: return '\u001bOR';
        case 4: return '\u001bOS';
        case 5: return '\u001b[15~';
        case 6: return '\u001b[17~';
        case 7: return '\u001b[18~';
        case 8: return '\u001b[19~';
        case 9: return '\u001b[20~';
        case 10: return '\u001b[21~';
        case 11: return '\u001b[23~';
        case 12: return '\u001b[24~';
      }
    }

    // Ctrl+<letter> / Ctrl+<字母>
    const ctrlLetter = normalized.match(/^ctrl\+([a-z])$/);
    if (ctrlLetter && ctrlLetter[1]) {
      const code = ctrlLetter[1].charCodeAt(0) - 96; // a->1 ... z->26
      return String.fromCharCode(code);
    }
    if (normalized === 'ctrl+space') {
      return '\u0000';
    }

    // Alt+<char>：通常为 ESC 前缀 / Alt+<char> usually prefixed by ESC
    const altChar = normalized.match(/^alt\+(.+)$/);
    if (altChar && altChar[1]) {
      const rest = altChar[1];
      if (rest.length === 1) {
        return '\u001b' + rest;
      }
      const altSpecial = this.encodeKeyTokenToInput(rest);
      if (altSpecial) {
        return '\u001b' + altSpecial;
      }
    }

    return null;
  }

  private encodePowerShellToEncodedCommand(script: string): string {
    // PowerShell's -EncodedCommand expects UTF-16LE Base64.
    // PowerShell 的 -EncodedCommand 需要 UTF-16LE Base64。
    return Buffer.from(script ?? '', 'utf16le').toString('base64');
  }

  private buildSearchMatcher(options: { query: string; isRegex: boolean; caseSensitive: boolean }): { test: (line: string) => boolean } | { error: string } {
    const query = options.query ?? '';
    if (!query) {
      return { error: 'Search query is empty.' };
    }

    if (options.isRegex) {
      try {
        const flags = options.caseSensitive ? '' : 'i';
        const re = new RegExp(query, flags);
        return { test: (line: string) => re.test(line) };
      } catch (e) {
        return { error: `Invalid regex: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    if (!options.caseSensitive) {
      const q = query.toLowerCase();
      return { test: (line: string) => (line || '').toLowerCase().includes(q) };
    }

    return { test: (line: string) => (line || '').includes(query) };
  }

  private searchTerminalBuffer(options: {
    terminalId: string;
    query: string;
    isRegex: boolean;
    caseSensitive: boolean;
    contextLines: number;
    maxMatches: number;
    since: number;
  }): { lines: Array<{ lineNumber: number; sequence: number; content: string }>; matchCount: number } | { error: string } {
    const outputBuffer = this.terminalManager.getOutputBuffer(options.terminalId);
    if (!outputBuffer) {
      return { error: `Terminal output buffer not found: ${options.terminalId}` };
    }

    const matcher = this.buildSearchMatcher({
      query: options.query,
      isRegex: options.isRegex,
      caseSensitive: options.caseSensitive
    });
    if ('error' in matcher) {
      return { error: matcher.error };
    }

    const all = outputBuffer.read({ since: options.since ?? 0, maxLines: 0 }).entries;
    const ctx = Math.max(0, Math.floor(options.contextLines ?? 2));
    const maxMatches = Math.max(1, Math.floor(options.maxMatches ?? 50));

    const include = new Set<number>(); // index in all[]
    const matchIndices: number[] = [];

    for (let i = 0; i < all.length; i++) {
      const entry = all[i]!;
      if (matcher.test(entry.content || '')) {
        matchIndices.push(i);
        if (matchIndices.length >= maxMatches) {
          break;
        }
      }
    }

    for (const idx of matchIndices) {
      const start = Math.max(0, idx - ctx);
      const end = Math.min(all.length - 1, idx + ctx);
      for (let j = start; j <= end; j++) {
        include.add(j);
      }
    }

    const indices = Array.from(include).sort((a, b) => a - b);
    const lines = indices.map((i) => {
      const e = all[i]!;
      return { lineNumber: e.lineNumber, sequence: e.sequence, content: e.content };
    });

    return { lines, matchCount: matchIndices.length };
  }

  constructor() {
    // 创建 MCP 服务器
    this.server = new McpServer(
      {
        name: 'cheezmil-terminal-interactive-server',
        version: '1.0.0',
        icons: [
          {
            src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIgNEMyIDIuODk1NDMgMi44OTU0MyAyIDQgMkgyMEMyMS4xMDQ2IDIgMjIgMi44OTU0MyAyMiA0VjIwQzIyIDIxLjEwNDYgMjEuMTA0NiAyMiAyMCAyMkg0QzIuODk1NDMgMjIgMiAyMS4xMDQ2IDIgMjBWNFoiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSIyIi8+CjxwYXRoIGQ9Ik02IDhMMTAgMTJMNiAxNiIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTIgMTZIMTgiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPC9zdmc+',
            sizes: ['24x24'],
            mimeType: 'image/svg+xml'
          }
        ]
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          logging: {}
        }
      }
    );

    // 尝试使用共享的TerminalManager实例，如果没有则创建新的
    // Try to use shared TerminalManager instance, create new if not available
    if ((global as any).sharedTerminalManager) {
      this.terminalManager = (global as any).sharedTerminalManager;
      console.log('[MCP-INFO] Using shared TerminalManager instance');
    } else {
      // 创建终端管理器
      this.terminalManager = new TerminalManager({
        maxBufferSize: parseInt(process.env.MAX_BUFFER_SIZE || '10000'),
        sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '86400000'), // 24 hours
        compactAnimations: process.env.COMPACT_ANIMATIONS !== 'false', // Default true
        animationThrottleMs: parseInt(process.env.ANIMATION_THROTTLE_MS || '100')
      });
      console.log('[MCP-INFO] Created new TerminalManager instance (no shared instance found)');
    }

    // 创建 Web UI 管理器
    this.webUiManager = new WebUIManager();

    this.setupTools();
    this.setupResources();
    this.setupPrompts();
    this.setupEventHandlers();
    this.startServices();
  }

  /**
   * 启动前端和后端服务
   * 注意：禁用自动启动服务以避免递归调用问题
   * MCP 服务器不应该启动自己的后端进程，这会导致无限递归
   */
  private startServices(): void {
    // 不在这里启动后端进程，避免递归调用
    // 后端服务应该通过独立的启动脚本启动
    console.log('[MCP-INFO] Services auto-start disabled to prevent recursion');
    
    // 确保在 MCP 服务器关闭时进行清理
    process.on('exit', () => {
      console.log('[MCP-INFO] MCP server shutting down');
    });
  }

  /**
   * 创建终端并返回统一格式的结果
   */
  private async createTerminalResponse(options: TerminalCreateOptions, source: 'default' | 'basic' = 'default'): Promise<CallToolResult> {
    const terminalId = await this.terminalManager.createTerminal({
      terminalName: (options as any).terminalName,
      shell: options.shell,
      cwd: options.cwd,
      env: options.env,
      cols: options.cols,
      rows: options.rows
    });

    const session = this.terminalManager.getTerminalInfo(terminalId);
    if (!session) {
      throw new Error('Failed to retrieve session info');
    }

    const result: CreateTerminalResult = {
      terminalName: terminalId,
      terminalId: terminalId,
      status: session.status,
      pid: session.pid,
      shell: session.shell,
      cwd: session.cwd
    };

    const header = source === 'basic'
      ? 'Terminal created successfully via basic workflow!'
      : 'Terminal created successfully!';

    const outputLines = [
      `${header}`,
      '',
      `Terminal ID: ${result.terminalId}`,
      `PID: ${result.pid}`,
      `Shell: ${result.shell}`,
      `Working Directory: ${result.cwd}`,
      `Status: ${result.status}`,
      '',
      'Tip: Use a unique terminalId per task/session to avoid cross-session context pollution.',
      'If you see unrelated paths/output, create a new terminalId (or terminate the old terminal) and retry.'
    ];

    return {
      content: [
        {
          type: 'text',
          text: outputLines.join('\n')
        }
      ],
      structuredContent: {
        terminalId: result.terminalId,
        pid: result.pid,
        shell: result.shell,
        cwd: result.cwd,
        status: result.status
      }
    } as CallToolResult;
  }

  /**
   * 使用 Codex 修复 Bug
   */
  private async fixBugWithCodex(params: {
    description: string;
    cwd?: string;
    timeout?: number;
  }): Promise<CallToolResult> {
    const workingDir = params.cwd || process.cwd();
    const timeoutMs = params.timeout || 600000; // 默认 10 分钟
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFileName = `codex-fix-${timestamp}.md`;
    const reportPath = `docs/${reportFileName}`;

    try {
      // 构建我们的固定后缀提示词（纯英文，避免 UTF-8 编码问题）
      const ourSuffix = `

---

REQUIREMENTS AFTER FIX:

1. Create a detailed fix report in docs/ directory: ${reportPath}

2. The report MUST use the following Markdown format:

# Bug Fix Report

## Problem Description
${params.description}

## Fix Time
${new Date().toISOString()}

## Modified Files
List all modified files with their full paths

## Detailed Changes
For each file, provide detailed explanation:

### File: filename
**Changes**: Brief description

**Before**:
\`\`\`language
original code
\`\`\`

**After**:
\`\`\`language
new code
\`\`\`

**Reason**: Why this change was made

## Testing Recommendations
1. Unit test commands
2. Manual testing steps
3. Expected results

## Notes
Important notes about these changes

## Summary
Summarize this fix in 1-2 sentences

---
Report generated: ${new Date().toISOString()}
Fix tool: OpenAI Codex
`;

      // 组合最终提示词：AI 的描述 + 我们的后缀
      const finalPrompt = params.description + ourSuffix;

      // 将问题描述写入 MD 文档，避免 shell 转义问题
      const promptFileName = `codex-bug-description-${timestamp}.md`;
      const promptFile = path.join(workingDir, 'docs', promptFileName);

      // 确保 docs 目录存在
      await fs.mkdir(path.join(workingDir, 'docs'), { recursive: true });

      // 写入问题描述文档
      await fs.writeFile(promptFile, finalPrompt, 'utf-8');

      // 创建专用终端
      const terminalId = await this.terminalManager.createTerminal({
        cwd: workingDir,
        shell: '/bin/bash'
      });

      // 构建 Codex 命令 - 使用非交互模式 exec，从 MD 文档读取问题描述
      // 使用 --dangerously-bypass-approvals-and-sandbox 实现完全自动化
      const codexCmd = `codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check "$(cat docs/${promptFileName})"`;

      // 执行命令
      await this.terminalManager.writeToTerminal({
        terminalName: terminalId,
        input: codexCmd
      });

      // 智能等待完成
      const startTime = Date.now();
      let lastOutputLength = 0;
      let stableCount = 0;
      const stableThreshold = 3; // 连续3次输出不变则认为完成

      while (Date.now() - startTime < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 每5秒检查

        // 只读取最后 50 行来检查状态，避免读取过多数据
        const result = await this.terminalManager.readFromTerminal({
          terminalName: terminalId,
          mode: 'tail',
          tailLines: 50
        });

        // 检查输出是否稳定
        if (result.output.length === lastOutputLength) {
          stableCount++;
          if (stableCount >= stableThreshold) {
            break; // 输出稳定，认为完成
          }
        } else {
          stableCount = 0;
          lastOutputLength = result.output.length;
        }

        // 检查是否有明确的完成标志
        if (result.output.includes('Task completed') ||
            result.output.includes('Fix completed')) {
          break;
        }
      }

      const executionTime = Date.now() - startTime;

      // 读取最终输出（只读取最后 50 行，避免上下文过长）
      const finalResult = await this.terminalManager.readFromTerminal({
        terminalName: terminalId,
        mode: 'tail',
        tailLines: 50
      });

      // 检查报告是否生成
      const fullReportPath = path.join(workingDir, reportPath);

      let reportExists = false;
      let reportContent = '';

      try {
        reportContent = await fs.readFile(fullReportPath, 'utf-8');
        reportExists = true;
      } catch (error) {
        // 报告不存在
      }

      // 构建返回消息
      let resultMessage = `🤖 Codex Bug Fix Execution Completed\n\n`;
      resultMessage += `📊 Execution Details:\n`;
      resultMessage += `- Terminal ID: ${terminalId}\n`;
      resultMessage += `- Working Directory: ${workingDir}\n`;
      resultMessage += `- Execution Time: ${(executionTime / 1000).toFixed(2)} seconds\n`;
      resultMessage += `- Timeout: ${timeoutMs / 1000} seconds\n\n`;

      if (reportExists) {
        resultMessage += `✅ Fix Report Generated Successfully!\n\n`;
        resultMessage += `📄 Report Location: ${reportPath}\n\n`;
        resultMessage += `🔔 IMPORTANT - NEXT STEPS FOR YOU (AI Assistant):\n`;
        resultMessage += `1. Read the report using: view("${reportPath}")\n`;
        resultMessage += `2. Analyze the changes Codex made\n`;
        resultMessage += `3. Summarize the fix to the user in simple terms\n`;
        resultMessage += `4. Provide the testing recommendations from the report\n`;
        resultMessage += `5. Ask the user if they want to review the changes\n\n`;
        resultMessage += `📋 Report Preview (first 500 chars):\n`;
        resultMessage += `${'='.repeat(60)}\n`;
        resultMessage += reportContent.substring(0, 500);
        if (reportContent.length > 500) {
          resultMessage += `\n... (truncated, read full report for details)\n`;
        }
        resultMessage += `\n${'='.repeat(60)}\n`;
      } else {
        resultMessage += `⚠️ Warning: Fix Report Not Found!\n\n`;
        resultMessage += `Expected location: ${reportPath}\n\n`;
        resultMessage += `Possible reasons:\n`;
        resultMessage += `1. Codex encountered an error\n`;
        resultMessage += `2. The fix was too simple and Codex didn't generate a report\n`;
        resultMessage += `3. Codex is still running (check terminal output)\n\n`;
        resultMessage += `📋 Please check the Codex output below for details.\n`;
      }

      resultMessage += `\n${'='.repeat(60)}\n`;
      resultMessage += `📺 Codex Terminal Output:\n`;
      resultMessage += `${'='.repeat(60)}\n`;
      resultMessage += finalResult.output;
      resultMessage += `\n${'='.repeat(60)}\n`;

      // 添加问题描述文档的信息
      resultMessage += `\n📝 Bug Description Document: docs/${promptFileName}\n`;
      resultMessage += `(This document contains the problem description you provided)\n`;

      return {
        content: [
          {
            type: 'text',
            text: resultMessage
          }
        ],
        structuredContent: {
          terminalId,
          reportPath: reportExists ? reportPath : null,
          reportExists,
          workingDir,
          executionTime,
          timedOut: executionTime >= timeoutMs,
          output: finalResult.output,
          reportPreview: reportExists ? reportContent.substring(0, 500) : null
        }
      } as CallToolResult;
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error executing Codex bug fix: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      } as CallToolResult;
    }
  }

  /**
   * 检查工具是否被禁用
   * @param toolName 工具名称
   * @returns 如果工具被禁用则返回true
   */
  private isToolDisabled(toolName: string): boolean {
    const disabledTools = process.env.DISABLED_TOOLS;
    console.log(`[MCP-DEBUG] Checking if tool "${toolName}" is disabled. DISABLED_TOOLS="${disabledTools}"`);
    
    if (!disabledTools) {
      console.log(`[MCP-DEBUG] DISABLED_TOOLS is empty, tool "${toolName}" is enabled`);
      return false;
    }
    
    // 将逗号分隔的工具名称转换为数组，并去除空白字符
    const disabledList = disabledTools.split(',').map(tool => tool.trim().toLowerCase());
    console.log(`[MCP-DEBUG] Disabled tools list:`, disabledList);
    
    // 检查当前工具名称是否在禁用列表中
    const isDisabled = disabledList.includes(toolName.toLowerCase());
    console.log(`[MCP-DEBUG] Tool "${toolName}" is ${isDisabled ? 'DISABLED' : 'ENABLED'}`);
    
    return isDisabled;
  }

  /**
   * 从配置中读取命令黑名单配置
   * Read command blacklist config from config.yml
   */
  private getCommandBlacklistConfig(): {
    caseInsensitive: boolean;
    rules: Array<{ command: string; message?: string }>;
  } {
    const mcpConfig = (configManager.getMcpConfig?.() || {}) as any;
    const raw = (mcpConfig.commandBlacklist || {}) as any;

    const caseInsensitive = raw.caseInsensitive !== false;
    const rules = Array.isArray(raw.rules) ? raw.rules : [];

    const normalizedRules: Array<{ command: string; message?: string }> = [];
    for (const rule of rules) {
      if (!rule || typeof rule !== 'object') continue;
      const command = typeof rule.command === 'string' ? rule.command.trim() : '';
      if (!command) continue;
      const normalizedRule: { command: string; message?: string } = { command };
      if (typeof rule.message === 'string') {
        normalizedRule.message = rule.message;
      }
      normalizedRules.push(normalizedRule);
    }

    return { caseInsensitive, rules: normalizedRules };
  }

  /**
   * 从输入中提取可能的“命令名”Token（支持按行、按 ; 和 | 分段）
   * Extract possible command-name tokens from input (split by lines and by ; / | segments)
   */
  private extractCommandTokens(input: string): string[] {
    const tokens: string[] = [];
    const lines = input.split(/\r?\n/);

    for (const line of lines) {
      const segments = line.split(/[;|]/);
      for (const segment of segments) {
        let text = segment.trimStart();
        if (!text) continue;

        // PowerShell call operator: & <command>
        // PowerShell 调用运算符：& <command>
        if (text.startsWith('&')) {
          text = text.slice(1).trimStart();
        }

        if (!text) continue;

        const first = text.split(/\s+/)[0] || '';
        if (!first) continue;

        // Strip surrounding quotes for simple cases / 简单场景下去掉命令名前后的引号
        const unquoted =
          (first.startsWith('\"') && first.endsWith('\"') && first.length >= 2) ||
          (first.startsWith('\'') && first.endsWith('\'') && first.length >= 2)
            ? first.slice(1, -1)
            : first;

        if (unquoted) tokens.push(unquoted);
      }
    }

    return tokens;
  }

  /**
   * 检测输入是否命中命令黑名单；命中则返回阻止执行的消息
   * Detect whether input hits command blacklist; if so, return a blocking message
   */
  private checkCommandBlacklist(input: string): { blocked: boolean; command?: string; message?: string } {
    // Ignore control sequences / 忽略控制字符（例如 Ctrl+C）
    const trimmed = input.trim();
    if (!trimmed) return { blocked: false };
    if (/^[\u0000-\u001F\u007F]+$/.test(trimmed)) return { blocked: false };

    const { rules } = this.getCommandBlacklistConfig();
    if (!rules.length) return { blocked: false };

    // PowerShell/Windows 命令名通常不区分大小写；为避免“写了黑名单但仍可执行”的困扰，这里始终按不区分大小写匹配
    // PowerShell/Windows command names are typically case-insensitive; to avoid "blacklist not working", always match ignoring case
    const ignoreCase = true;

    const map = new Map<string, { command: string; message?: string }>();
    for (const rule of rules) {
      const key = ignoreCase ? rule.command.toLowerCase() : rule.command;
      if (!map.has(key)) {
        const value: { command: string; message?: string } = { command: rule.command };
        if (typeof rule.message === 'string') {
          value.message = rule.message;
        }
        map.set(key, value);
      }
    }

    const tokens = this.extractCommandTokens(input);
    for (const token of tokens) {
      const key = ignoreCase ? token.toLowerCase() : token;
      const hit = map.get(key);
      if (!hit) continue;

      const message = (hit.message && hit.message.trim())
        ? hit.message
        : `Command "${hit.command}" is disabled by the user and must not be executed.`;

      return { blocked: true, command: hit.command, message };
    }

    return { blocked: false };
  }

  private isLikelyLongRunningCommand(text: string): boolean {
    const s = (text || '').toLowerCase();
    if (!s.trim()) return false;

    // Common package manager installs / 常见包管理器安装
    if (/\bnpm\s+(ci|install|i|add)\b/.test(s)) return true;
    if (/\bpnpm\s+(install|i|add)\b/.test(s)) return true;
    if (/\byarn\s+(install|add)\b/.test(s)) return true;
    if (/\bpip\s+install\b/.test(s)) return true;
    if (/\bpython\s+-m\s+pip\s+install\b/.test(s)) return true;
    if (/\bpipx\s+install\b/.test(s)) return true;

    // Common builds / 常见编译任务
    if (/\bcargo\s+(build|install)\b/.test(s)) return true;
    if (/\bgo\s+build\b/.test(s)) return true;
    if (/\bmvn\s+(install|package)\b/.test(s)) return true;
    if (/\bgradle(w)?\b.*\b(build|assemble)\b/.test(s)) return true;

    // Generic long-running keywords / 通用长任务关键词
    if (s.includes('setup') || s.includes('download') || s.includes('build')) return true;

    return false;
  }

  private buildLongTaskCtiGuidancePrompt(projectCwd: string): string {
    // NOTE: This prompt is meant to be shown to another AI that will call interact_with_terminal.
    // Terminal output only needs English, so keep this in English.
    return [
      'Detected a likely long-running command. Follow these rules when calling `interact_with_terminal`:',
      '',
      '1) Use a clean terminalId: pick a brand-new dedicated terminalId (e.g. `long_task_1`). Do NOT reuse a previously "polluted" session.',
      '2) Pass `cwd` when creating a new terminalId. Once created, the terminal keeps its cwd; omit `cwd` in later calls.',
      `   - Recommended cwd for this project: \`${projectCwd}\``,
      '3) Reduce polling: for long tasks set `longTask=true`, and use `wait.mode=prompt` or `wait.mode=pattern` with a longer `wait.maxWaitMs` (30-50s per call).',
      '   - Prefer `wait.includeIntermediateOutput=false` to only fetch output at the end / when pattern hits.',
      '4) If your workflow has an install/setup step and a run step, split them into two separate commands so each step is easier to validate.',
      '',
      'If your current request does not follow these rules, re-issue the tool call accordingly.'
    ].join('\n');
  }

  /**
   * 设置 MCP 工具
   */
  private setupTools(): void {
    // 读取终端输出/元数据工具（从 interact_with_terminal 拆分）
    // Read terminal output/metadata tool (split from interact_with_terminal)
    if (!this.isToolDisabled('read_CTI')) {
      const readCtiSchema: any = {
        terminalId: z.string().describe('Terminal ID to read from.'),
        resetSession: z.boolean().optional().describe('Reset (kill + recreate) this terminal session. Requires cwd.'),
        // Create options when resetSession is true / reset 时用于创建新会话的参数
        cwd: z.string().optional().describe('Working directory (REQUIRED when resetSession is true).'),
        shell: z.string().optional().describe('Shell to use (only used when resetSession is true).'),
        env: z.record(z.string()).optional().describe('Environment variables (only used when resetSession is true).'),
        cols: z.number().optional().describe('Terminal columns (only used when resetSession is true).'),
        rows: z.number().optional().describe('Terminal rows (only used when resetSession is true).'),
        since: z.number().optional().describe('Line/sequence cursor to start reading from (default: 0).'),
        mode: z.enum(['full', 'head', 'tail', 'head-tail', 'auto', 'smart']).optional().describe('Reading mode (default: smart).'),
        maxLines: z.number().optional().describe('Maximum number of lines to return (default: 1000).'),
        headLines: z.number().optional().describe('Number of lines to show from the beginning for head/head-tail.'),
        tailLines: z.number().optional().describe('Number of lines to show from the end for tail/head-tail.'),
        stripSpinner: z.boolean().optional().describe('Strip common spinner/animation frames (default: true).'),
        // Keyword context extraction / 关键字上下文截取
        keywords: z.array(z.string()).optional().describe('If provided, extract matching lines with context.'),
        contextLines: z.number().optional().describe('Context lines before/after each match (default: 2).'),
        ignoreCase: z.boolean().optional().describe('Whether keyword matching is case-insensitive (default: true).'),
        maxMatches: z.number().optional().describe('Maximum number of keyword matches to return (default: 50).'),
        includeMetadata: z.boolean().optional().describe('Include session metadata/status (default: true).')
      };

      (this.server as any).tool(
        'read_CTI',
        `Read terminal output and session metadata.

Use this tool after \`interact_with_terminal\` to continue reading output, debug truncation, and inspect session state (cwd, prompt, pending command, etc.).`,
        readCtiSchema,
        async (args: any): Promise<CallToolResult> => {
          try {
            const terminalId = String(args.terminalId || '').trim();
            if (!terminalId) {
              throw new Error('terminalId is required');
            }

            if (args.resetSession === true) {
              const cwd = String(args.cwd || '').trim();
              if (!cwd) {
                throw new Error('cwd is required when resetSession is true');
              }
              const shell = args.shell !== undefined ? String(args.shell) : undefined;
              const env = args.env && typeof args.env === 'object' ? args.env : undefined;
              const cols = Number.isFinite(args.cols) ? Math.max(10, Math.round(args.cols)) : undefined;
              const rows = Number.isFinite(args.rows) ? Math.max(5, Math.round(args.rows)) : undefined;

              try {
                await this.terminalManager.killTerminal(terminalId, 'SIGTERM');
              } catch {
                // best-effort / 尽力清理
              }

              await this.terminalManager.createTerminal({
                terminalName: terminalId,
                cwd,
                ...(shell ? { shell } : {}),
                ...(env ? { env } : {}),
                ...(cols ? { cols } : {}),
                ...(rows ? { rows } : {})
              } as any);

              return {
                content: [{ type: 'text', text: `Terminal "${terminalId}" reset and ready.` }],
                structuredContent: { terminalId, resetSession: true }
              } as CallToolResult;
            }

            const since = Number.isFinite(args.since) ? Math.max(0, Math.round(args.since)) : 0;
            const maxLines = Number.isFinite(args.maxLines) ? Math.max(1, Math.round(args.maxLines)) : 1000;
            const mode = (args.mode as any) || 'smart';
            const headLines = Number.isFinite(args.headLines) ? Math.max(0, Math.round(args.headLines)) : undefined;
            const tailLines = Number.isFinite(args.tailLines) ? Math.max(0, Math.round(args.tailLines)) : undefined;
            const stripSpinner = args.stripSpinner !== undefined ? Boolean(args.stripSpinner) : true;
            const includeMetadata = args.includeMetadata !== undefined ? Boolean(args.includeMetadata) : true;

            const readResult = await this.terminalManager.readFromTerminal({
              terminalName: terminalId,
              since,
              maxLines,
              mode,
              headLines,
              tailLines
            } as any);

            const stripSpinnerChars = (text: string): string => {
              if (!text) return text;
              let next = text.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g, '');
              next = next.replace(/[|\/\\-]/g, (match, offset, string) => {
                const prevChar = offset > 0 ? string[offset - 1] : '';
                const nextChar = offset < string.length - 1 ? string[offset + 1] : '';
                if (/[|\/\\-]/.test(prevChar) || /[|\/\\-]/.test(nextChar)) return '';
                return match;
              });
              return next;
            };

            const outputText = stripSpinner ? stripSpinnerChars(readResult.output || '') : (readResult.output || '');

            const structuredContent: any = {
              terminalId,
              output: outputText,
              totalLines: readResult.totalLines,
              hasMore: readResult.hasMore,
              since: readResult.since,
              cursor: readResult.cursor ?? readResult.since ?? null,
              truncated: Boolean(readResult.truncated),
              stats: readResult.stats ?? null,
              status: readResult.status ?? null
            };

            if (includeMetadata) {
              try {
                structuredContent.session = {
                  stats: await this.terminalManager.getTerminalStats(terminalId),
                  readStatus: this.terminalManager.getTerminalReadStatus(terminalId),
                  awaitingInput: this.terminalManager.isTerminalAwaitingInput(terminalId)
                };
              } catch (e) {
                structuredContent.session = { error: e instanceof Error ? e.message : String(e) };
              }
            }

            // Keyword context extraction (stable semantics, independent from read mode)
            const keywordsRaw: string[] = Array.isArray(args.keywords)
              ? args.keywords.map((v: unknown) => String(v)).filter((s: string) => s.trim())
              : [];
            if (keywordsRaw.length > 0) {
              const ignoreCase = args.ignoreCase !== undefined ? Boolean(args.ignoreCase) : true;
              const contextLines = Number.isFinite(args.contextLines) ? Math.max(0, Math.round(args.contextLines)) : 2;
              const maxMatches = Number.isFinite(args.maxMatches) ? Math.max(1, Math.round(args.maxMatches)) : 50;

              const lines = outputText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
              const keywordList = keywordsRaw.map((k: string) => (ignoreCase ? k.toLowerCase() : k));
              const hitLineNumbers: number[] = [];
              for (let idx = 0; idx < lines.length; idx++) {
                const line = lines[idx] ?? '';
                const hay = ignoreCase ? line.toLowerCase() : line;
                for (const k of keywordList) {
                  if (!k) continue;
                  if (hay.includes(k)) {
                    hitLineNumbers.push(idx);
                    break;
                  }
                }
                if (hitLineNumbers.length >= maxMatches) break;
              }

              const ranges: Array<{ start: number; end: number }> = [];
              for (const hit of hitLineNumbers) {
                const start = Math.max(0, hit - contextLines);
                const end = Math.min(lines.length - 1, hit + contextLines);
                const last = ranges[ranges.length - 1];
                if (last && start <= last.end + 1) {
                  last.end = Math.max(last.end, end);
                } else {
                  ranges.push({ start, end });
                }
              }

              const contexts = ranges.map((r) => ({
                startLine: r.start + 1,
                endLine: r.end + 1,
                text: lines.slice(r.start, r.end + 1).join('\n')
              }));

              structuredContent.keywordContext = {
                keywords: keywordsRaw,
                ignoreCase,
                contextLines,
                maxMatches,
                matchCount: hitLineNumbers.length,
                contexts
              };
            }

            return {
              content: [{ type: 'text', text: outputText || '' }],
              structuredContent
            } as CallToolResult;
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error reading terminal: ${error instanceof Error ? error.message : String(error)}`
                }
              ],
              isError: true
            } as CallToolResult;
          }
        }
      );
    } else {
      console.log('[MCP-INFO] Tool "read_CTI" is disabled');
    }

    // 统一终端交互工具
    if (!this.isToolDisabled('interact_with_terminal')) {
      // MCP 客户端/工具层常见默认请求超时为 60s；为避免 tools/call 等不到响应，
      // 这里强制限制本工具“单次等待”的最长时间（等待输出/模式命中/提示符出现等）。
      //
      // Many MCP clients/tool layers have a 60s default request timeout. To prevent
      // timing out while awaiting the tools/call response, we cap the maximum
      // single-call wait duration for this tool.
      const MAX_SINGLE_CALL_WAIT_MS = 50_000;

      // 由于该工具参数较多，完全类型推导会导致 TypeScript 提示“Type instantiation is excessively deep”错误
      // Because this tool has many parameters, full type inference can trigger the TypeScript “Type instantiation is excessively deep” error
      const interactWithTerminalSchema: any = {
        // 列出终端参数 / Parameters for listing terminals
        listTerminals: z.boolean().optional().describe('List all active terminal sessions. When true, ignores other parameters and returns list of all terminals.'),
        
        // 终止终端参数 / Parameters for terminating terminal
        killTerminal: z.boolean().optional().describe('Terminate the specified terminal session. When true, ignores other parameters except terminalId and kills the terminal.'),
        signal: z.string().optional().describe('Signal to send for termination (default: SIGTERM, only used when killTerminal is true)'),
        interrupt: z.boolean().optional().describe('Send SIGINT/Ctrl+C to interrupt the current foreground process without terminating the session.'),
        interruptSignal: z.string().optional().describe('Signal to send for interrupt (default: SIGINT).'),
        
        // 终端创建参数 / Parameters for creating terminal
        terminalId: z.string().optional().describe('Terminal ID for identification. If the terminal does not exist, it will be created automatically.'),
        shell: z.string().optional().describe('Shell to use (only used when creating new terminal)'),
        cwd: z.string().optional().describe('Working directory (REQUIRED when creating a new terminalId). Once created, omit cwd and reuse the session cwd.'),
        env: z.record(z.string()).optional().describe('Environment variables (only used when creating new terminal)'),
        
        // 终端操作参数 / Parameters for writing to terminal
        input: z.string().optional().describe('Input to send to the terminal. Newline will be automatically added if not present to execute the command.'),
        powerShellScript: z.string().optional().describe('Windows/PowerShell helper: if provided, the server executes this script via `pwsh -EncodedCommand ...` to avoid client-side quoting/escaping truncation. When set, it takes precedence over `input`.'),
        appendNewline: z.boolean().optional().describe('Whether to automatically append a newline (default: true). Set to false for raw control sequences.'),
        noEcho: z.boolean().optional().describe('Try to remove echoed input from returned output (default: true).'),
        longTask: z.boolean().optional().describe('Explicitly declare this is a long-running task; server will use gentler exponential-backoff polling within the single-call cap.'),
        // 等待策略（推荐使用） / Wait strategy (recommended)
        wait: z.object({
          mode: z.enum(['none', 'idle', 'prompt', 'pattern', 'exit']).describe('Wait mode: none|idle|prompt|pattern|exit.'),
          // 重要：该工具层/客户端通常有 60s tools/call 超时；服务端会对“单次调用等待”做硬上限，避免拿不到响应。
          // IMPORTANT: many MCP clients/tool layers timeout tools/call at ~60s; server enforces a hard cap per call to ensure a response is returned.
          maxWaitMs: z.number().optional().describe('Maximum wait duration in milliseconds for this single call. Must be finite. Recommended: progressive increase (e.g. 2s -> 5s -> 15s -> 50s).'),
          // Deprecated aliases / 兼容旧字段（不推荐）
          timeoutMs: z.number().optional().describe('[DEPRECATED] Alias of maxWaitMs.'),
          waitMs: z.number().optional().describe('[DEPRECATED] Alias of maxWaitMs.'),
          idleMs: z.number().optional().describe('Idle time window in ms for mode=idle (default: 900).'),
          pattern: z.string().optional().describe('Pattern to wait for when mode=pattern.'),
          patternRegex: z.boolean().optional().describe('Treat pattern as regex (default: false).'),
          patternCaseSensitive: z.boolean().optional().describe('Case sensitive match for pattern (default: false).'),
          includeIntermediateOutput: z.boolean().optional().describe('Accumulate delta output during waiting (default: true).')
        }).partial().passthrough().optional().describe('Advanced wait strategy. If omitted, defaults to a short idle wait to capture command output.'),

        // 一次性按键序列参数 / One-shot key sequence parameters
        // 允许 AI 在一次调用里发送多个按键，并给出每个按键之间的间隔时间
        // Allow sending multiple keys in one call with per-key delays
        keys: z.string().optional().describe('Comma-separated key tokens (e.g., \"esc,esc,enter\" or \"ctrl+u,backspace,enter\").'),
        keyDelayMs: z.number().optional().describe('Default delay in milliseconds between key tokens when using keys/keySequence (default: 30ms).'),
        keySequence: z.array(
          z.object({
            type: z.enum(['key', 'text']).describe('Item type: key or text.'),
            value: z.string().describe('Key token (e.g., enter/esc/up/ctrl+c) or text to type.'),
            delayMsAfter: z.number().optional().describe('Delay after this item (ms). If omitted, uses keyDelayMs.')
          })
        ).optional().describe('Explicit sequence of keys/text with optional per-item delays.'),

        // 特殊操作参数 / Special operation parameters
        specialOperation: z.enum(['ctrl_c', 'ctrl_z', 'ctrl_d', 'esc', 'enter', 'double_esc']).optional().describe('Special operation to send to terminal (e.g., ctrl_c, enter, esc, double_esc). Prefer keys/keySequence for complex combos.'),
        
        // 读取参数 / Parameters for reading from terminal
        since: z.number().optional().describe('Line number to start reading from (default: 0)'),
        maxLines: z.number().optional().describe('Maximum number of lines to read (default: 1000)'),
        // 默认使用 this_command_output：仅返回“本次写入 input 后新增的输出”
        // Default to this_command_output: return only output produced after this call's input is written
        mode: z.enum(['this_command_output', 'full', 'head', 'tail', 'head-tail', 'smart', 'raw']).optional().describe('Reading mode: this_command_output (default, only output produced by current input), full, head, tail, head-tail, smart (auto best), or raw (tail of raw PTY output; useful for vim/fullscreen apps)'),
        headLines: z.number().optional().describe('Number of lines to show from the beginning when using head or head-tail mode (default: 50)'),
        tailLines: z.number().optional().describe('Number of lines to show from the end when using tail or head-tail mode (default: 50)'),
        stripSpinner: z.boolean().optional().describe('Whether to strip spinner/animation frames (uses global setting if not specified)'),

        // 搜索参数 / Search parameters
        search: z.string().optional().describe('Search query (regex or plain text) to find in terminal output buffer.'),
        searchRegex: z.boolean().optional().describe('Treat search as regex (default: false).'),
        caseSensitive: z.boolean().optional().describe('Case sensitive search (default: false).'),
        contextLines: z.number().optional().describe('Context lines before/after each match (default: 2).'),
        maxMatches: z.number().optional().describe('Max number of matches to return (default: 50).'),
        searchSince: z.number().optional().describe('Search start cursor/sequence (default: 0).')
      };

      // 这里将 server 强制为 any，以避免复杂泛型导致的深度类型实例化问题
      // Here we cast server to any to avoid deep generic instantiation issues
      (this.server as any).tool(
        'interact_with_terminal',
        `Execute ONE command in a terminal session and return ONLY this command's output (mode=this_command_output).

For reading more output, tail/head, keyword-context extraction, and session metadata, use \`read_CTI\`.`,
        interactWithTerminalSchema,
      {
        title: 'Interact with Terminal',
        readOnlyHint: false
      },
      async (args: any, extra?: any): Promise<CallToolResult> => {
        const {
          listTerminals, killTerminal, signal, terminalId, shell, cwd, env,
          input, powerShellScript, appendNewline, noEcho, longTask, wait, waitForOutput,
          since, maxLines, mode, headLines, tailLines, stripSpinner,
          specialOperation, keys, keyDelayMs, keySequence,
          search, searchRegex, caseSensitive, contextLines, maxMatches, searchSince
        } = args;
        try {
          // 如果请求列出所有终端，则执行list操作并返回
          if (listTerminals) {
            const result = await this.terminalManager.listTerminals();
            
            if (result.terminals.length === 0) {
              return {
                content: [
                  {
                    type: 'text',
                    text: 'No active terminal sessions found.'
                  }
                ],
                structuredContent: {
                  listTerminals: true,
                  count: 0,
                  terminals: []
                }
              };
            }

            const terminalList = result.terminals.map(terminal =>
              `ID: ${terminal.id}\n` +
              `PID: ${terminal.pid}\n` +
              `Shell: ${terminal.shell}\n` +
              `Working Directory: ${terminal.cwd}\n` +
              `Created: ${terminal.created}\n` +
              `Last Activity: ${terminal.lastActivity}\n` +
              `Status: ${terminal.status}\n`
            ).join('\n---\n');

            return {
              content: [
                {
                  type: 'text',
                  text: `Active Terminal Sessions (${result.terminals.length}):\n\n${terminalList}`
                }
              ],
              structuredContent: {
                listTerminals: true,
                count: result.terminals.length,
                terminals: result.terminals
              }
            };
          }

          // 如果请求发送中断信号，则尝试 SIGINT/Ctrl+C
          if (args.interrupt) {
            if (!terminalId) {
              throw new Error('terminalId is required when interrupting terminal.');
            }
            const sig = args.interruptSignal ? String(args.interruptSignal) : 'SIGINT';
            await this.terminalManager.signalTerminal(String(terminalId), sig);
            return {
              content: [{ type: 'text', text: `Interrupt sent to terminal ${terminalId} (${sig}).` }],
              structuredContent: { interrupt: true, terminalId, signal: sig }
            };
          }

          // 如果请求终止终端，则执行kill操作并返回
          if (killTerminal) {
            if (!terminalId) {
              throw new Error('terminalId is required when killing terminal.');
            }

            try {
              await this.terminalManager.killTerminal(terminalId, signal);

              return {
                content: [
                  {
                    type: 'text',
                    text: `Terminal ${terminalId} terminated successfully${signal ? ` with signal ${signal}` : ''}.`
                  }
                ],
                structuredContent: {
                  killTerminal: true,
                  terminalId,
                  signal: signal || 'SIGTERM'
                }
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Error terminating terminal: ${error instanceof Error ? error.message : String(error)}`
                  }
                ],
                isError: true
              };
            }
          }

          let actualTerminalId = terminalId;
          let terminalCreated = false;
          
          // 检查是否提供了终端ID
          if (!actualTerminalId) {
            throw new Error('terminalId is required when not listing or killing terminals.');
          }

          // 本工具只支持 this_command_output（一次输入命令 -> 等待 -> 返回本次命令输出）。
          // Any extra reading/search features must be done via read_CTI.
          if (mode && String(mode) !== 'this_command_output') {
            throw new Error('interact_with_terminal only supports mode="this_command_output"; use read_CTI for other read modes.');
          }
          if (
            since !== undefined ||
            maxLines !== undefined ||
            headLines !== undefined ||
            tailLines !== undefined ||
            stripSpinner !== undefined ||
            search !== undefined ||
            searchRegex !== undefined ||
            caseSensitive !== undefined ||
            contextLines !== undefined ||
            maxMatches !== undefined ||
            searchSince !== undefined
          ) {
            throw new Error('Reading/search options are moved to read_CTI; call read_CTI for tail/head/search/context/metadata.');
          }
          
          // 检查终端是否存在，如果不存在则创建
          try {
            // 尝试读取终端信息来检查是否存在
            await this.terminalManager.readFromTerminal({ terminalName: actualTerminalId, maxLines: 1 });
          } catch (error) {
            // 终端不存在，创建新终端
            if (error instanceof Error && (error.message.includes('not found') || error.message.includes('does not exist'))) {
              if (!cwd || !String(cwd).trim()) {
                throw new Error(`must provide cwd when creating a new terminalId (terminalId="${actualTerminalId}")`);
              }
              await this.terminalManager.createTerminal({
                terminalName: actualTerminalId,
                shell,
                cwd,
                env
              });
              terminalCreated = true;
            } else {
              throw error;
            }
          }

          // cwd 在创建会话时固定一次；后续调用可省略（即使传了 cwd 也不自动切目录，避免污染输出）。
          // cwd is fixed at session creation; later calls may omit it (and we do not auto-cd even if cwd is provided to avoid polluting output).
          
          let responseText = '';
          let structuredContent: any = {
            terminalId: actualTerminalId,
            terminalCreated
          };

          const normalizeOutputText = (text: string, commandInput: string | undefined, enable: boolean): string => {
            if (!enable || !text) return text;
            const inputTrimmed = (commandInput ?? '').replace(/\r/g, '').trim();
            const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

            const cleaned: string[] = [];
            let previousLine: string | null = null;
            let blankRun = 0;
            let sawCommandEcho = false;

            for (const rawLine of lines) {
              const line = rawLine;
              const trimmed = line.trim();

              if (!trimmed) {
                blankRun += 1;
                if (blankRun <= 2) {
                  cleaned.push(line);
                }
                previousLine = line;
                continue;
              }
              blankRun = 0;

              // Collapse consecutive identical lines (common for prompts / redraw)
              if (previousLine !== null && line === previousLine) {
                continue;
              }
              previousLine = line;

              // Collapse repeated command echo (keep the first one).
              if (inputTrimmed) {
                if (trimmed === inputTrimmed || trimmed.endsWith(` ${inputTrimmed}`) || trimmed.endsWith(`> ${inputTrimmed}`)) {
                  if (sawCommandEcho) {
                    continue;
                  }
                  sawCommandEcho = true;
                }
              }

              cleaned.push(line);
            }

            return cleaned.join('\n').replace(/\n{4,}/g, '\n\n\n').trimEnd();
          };

          const stripSpinnerChars = (text: string, enable: boolean): string => {
            if (!enable || !text) return text;
            let out = text;
            out = out.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g, '');
            out = out.replace(/[|\/\\-]/g, (match, offset, string) => {
              const prevChar = offset > 0 ? string[offset - 1] : '';
              const nextChar = offset < string.length - 1 ? string[offset + 1] : '';
              if (/[|\/\\-]/.test(prevChar) || /[|\/\\-]/.test(nextChar)) {
                return '';
              }
              return match;
            });
            return out;
          };

          // 收集警告/提示信息并附加到最终响应（不阻断执行）
          // Collect warnings/notices and attach them to the final response (do not block execution)
          const warnings: string[] = [];
          if (input && (input.toLowerCase().includes('ctrl+c') || input.toLowerCase().includes('ctrl c'))) {
            warnings.push(`⚠️ 警告：检测到您在input字段中输入了"Ctrl+C"。

正确的使用方法：
- 使用 specialOperation: "ctrl_c" 参数来发送中断信号
- 不要在input字段中输入"Ctrl+C"字符串

示例：
{
  "terminalId": "your-terminal-id",
  "specialOperation": "ctrl_c"
}

这样可以正确发送Ctrl+C中断信号到终端。

当前输入将被原样发送到终端，但可能不会产生预期的中断效果。

---`);
          }

          // 处理特殊操作
          const defaultKeyDelay = typeof keyDelayMs === 'number' && Number.isFinite(keyDelayMs)
            ? Math.max(0, Math.floor(keyDelayMs))
            : 30;

          let actualInput = input;
          let resolvedKeySequence: Array<{ data: string; delayMsAfter: number; kind: 'key' | 'text' }> | null = null;

          if (Array.isArray(keySequence) && keySequence.length > 0) {
            const seq: Array<{ data: string; delayMsAfter: number; kind: 'key' | 'text' }> = [];
            for (let i = 0; i < keySequence.length; i++) {
              const item = keySequence[i];
              const delayMsAfter = typeof item?.delayMsAfter === 'number' && Number.isFinite(item.delayMsAfter)
                ? Math.max(0, Math.floor(item.delayMsAfter))
                : defaultKeyDelay;
              if (item?.type === 'text') {
                seq.push({ data: String(item.value ?? ''), delayMsAfter, kind: 'text' });
                continue;
              }
              if (item?.type === 'key') {
                const encoded = this.encodeKeyTokenToInput(String(item.value ?? ''));
                if (!encoded) {
                  return {
                    content: [{ type: 'text', text: `Unknown key token in keySequence: "${item.value}".` }],
                    structuredContent: {
                      isError: true,
                      reason: 'UNKNOWN_KEY_TOKEN',
                      token: item.value,
                      terminalId: actualTerminalId,
                      resultStatus: { state: 'blocked', reason: 'unknown_key_token', nextAction: 'Fix the key token and retry.' }
                    },
                    isError: true
                  } as CallToolResult;
                }
                seq.push({ data: encoded, delayMsAfter, kind: 'key' });
                continue;
              }
              return {
                content: [{ type: 'text', text: 'Invalid keySequence item: type must be \"key\" or \"text\".' }],
                structuredContent: { isError: true, reason: 'INVALID_KEY_SEQUENCE_ITEM', terminalId: actualTerminalId },
                isError: true
              } as CallToolResult;
            }
            // 最后一项默认不再延迟 / No delay after the last item by default
            if (seq.length > 0) {
              seq[seq.length - 1]!.delayMsAfter = 0;
            }
            resolvedKeySequence = seq;
          } else if (keys && String(keys).trim()) {
            const rawTokens = String(keys).split(',').map(t => t.trim()).filter(Boolean);
            const seq: Array<{ data: string; delayMsAfter: number; kind: 'key' | 'text' }> = [];
            for (let i = 0; i < rawTokens.length; i++) {
              const t = rawTokens[i]!;
              // text: 前缀可直接输入文本 / text: prefix allows raw text typing
              if (/^text:/i.test(t)) {
                seq.push({ data: t.slice('text:'.length), delayMsAfter: defaultKeyDelay, kind: 'text' });
                continue;
              }
              const encoded = this.encodeKeyTokenToInput(t);
              if (!encoded) {
                return {
                  content: [{ type: 'text', text: `Unknown key token in keys: "${t}".` }],
                  structuredContent: {
                    isError: true,
                    reason: 'UNKNOWN_KEY_TOKEN',
                    token: t,
                    terminalId: actualTerminalId,
                    resultStatus: { state: 'blocked', reason: 'unknown_key_token', nextAction: 'Fix the key token and retry.' }
                  },
                  isError: true
                } as CallToolResult;
              }
              seq.push({ data: encoded, delayMsAfter: defaultKeyDelay, kind: 'key' });
            }
            if (seq.length > 0) {
              seq[seq.length - 1]!.delayMsAfter = 0;
            }
            resolvedKeySequence = seq;
          } else if (specialOperation) {
            const encoded = this.encodeSpecialOperationToInput(String(specialOperation));
            if (encoded) {
              actualInput = encoded;
            }
          } else if (actualInput && appendNewline !== false) {
            // 交互式应用下，直接用 input+appendNewline 有时会导致回车“被吞”或行为不稳定；
            // 这里自动转换为 keySequence（text + enter），让写入路径与按键一致。
            // In interactive apps, input+appendNewline can be unreliable; convert to keySequence (text + enter).
            let isInteractive = false;
            try {
              isInteractive = this.terminalManager.isTerminalInInteractiveMode(actualTerminalId);
            } catch {
              isInteractive = false;
            }
            if (isInteractive) {
              const text = String(actualInput).replace(/(\r\n|\r|\n)+$/g, '');
              resolvedKeySequence = [
                { data: text, delayMsAfter: defaultKeyDelay, kind: 'text' },
                { data: '\r', delayMsAfter: 0, kind: 'key' }
              ];
              structuredContent.autoKeySequence = true;
            }
          }

          // 如果提供了输入或特殊操作，则发送到终端
          if (actualInput || resolvedKeySequence) {
            // 若终端已进入交互/忙碌状态：不再阻断输入，只附带提示信息并继续写入
            // If terminal is interactive/busy: no longer block input; attach a notice and continue writing
            const trimmedInput = actualInput ? actualInput.trim() : '';
            const isControlOnly = Boolean(actualInput) && /^[\u0000-\u001F\u007F]+$/.test(trimmedInput);
            const intendsExecute = appendNewline !== false;
            if (!isControlOnly && intendsExecute && !specialOperation && !resolvedKeySequence) {
              try {
                const status = this.terminalManager.getTerminalReadStatus(actualTerminalId);
                const awaitingInput = this.terminalManager.isTerminalAwaitingInput(actualTerminalId);
                if (status.alternateScreen || status.isRunning || awaitingInput) {
                  if (awaitingInput && !status.hasPrompt && (status.promptLine == null)) {
                    warnings.push('Terminal appears to be waiting for more input (PowerShell continuation prompt is common). This often happens when a command was truncated or has unclosed quotes/braces. Prefer sending scripts via a file (e.g., `node -e`, `.ps1`, or a heredoc-equivalent) instead of complex inline quoting.');
                  } else {
                    warnings.push('Terminal is in an interactive state; inspect the terminal output and respond accordingly.');
                  }
                  structuredContent.interactive = true;
                  structuredContent.awaitingInput = awaitingInput;
                  structuredContent.status = status;
                }
              } catch {
                // Ignore status errors and proceed / 忽略状态获取失败，继续执行
              }
            }

            // 针对疑似长任务：如果调用方式不符合“减少轮询/长等待/只取结束输出”，则返回指导提示词
            // For likely long-running commands: if parameters do not follow best practices, return a guidance prompt
            const longTaskCandidates: string[] = [];
            if (typeof actualInput === 'string' && actualInput) longTaskCandidates.push(actualInput);
            if (resolvedKeySequence) {
              for (const item of resolvedKeySequence) {
                if (item.kind === 'text' && item.data) {
                  longTaskCandidates.push(item.data);
                }
              }
            }
            if (typeof powerShellScript === 'string' && powerShellScript) longTaskCandidates.push(powerShellScript);

            const isLongTask = longTaskCandidates.some((c) => this.isLikelyLongRunningCommand(c));
            if (isLongTask) {
              const waitMode = wait?.mode ?? 'none';
              const includeIntermediateOutput =
                wait?.includeIntermediateOutput !== undefined ? Boolean(wait.includeIntermediateOutput) : true;
              const maxWaitMsRaw = wait?.maxWaitMs ?? wait?.timeoutMs ?? wait?.waitMs;
              const maxWaitMs = typeof maxWaitMsRaw === 'number' && Number.isFinite(maxWaitMsRaw) ? maxWaitMsRaw : 0;

              const okWaitMode = waitMode === 'prompt' || waitMode === 'pattern';
              const okMaxWait = Number.isFinite(maxWaitMs) && maxWaitMs >= 30_000;
              const okIntermediate = includeIntermediateOutput === false;

              if (!okWaitMode || !okMaxWait || !okIntermediate) {
                const prompt = this.buildLongTaskCtiGuidancePrompt(String(cwd));
                return {
                  content: [{ type: 'text', text: prompt }],
                  structuredContent: {
                    blocked: true,
                    blockedReason: 'long_task_guidance',
                    terminalId: actualTerminalId
                  },
                  isError: true
                } as CallToolResult;
              }
            }

            // Optional PowerShell wrapper to avoid quoting/escaping truncation in MCP clients.
            // 可选 PowerShell 包装：避免 MCP 客户端侧引号/转义截断导致 PowerShell 进入续行（>>）。
            if (typeof powerShellScript === 'string' && powerShellScript.length > 0) {
              if (process.platform !== 'win32') {
                warnings.push('powerShellScript is intended for Windows PowerShell (pwsh) only; ignoring on non-Windows platforms.');
              } else {
                const encoded = this.encodePowerShellToEncodedCommand(powerShellScript);
                actualInput = `pwsh -EncodedCommand ${encoded}`;
                warnings.push('Executed via pwsh -EncodedCommand to reduce quoting/escaping issues (powerShellScript).');
                structuredContent.wrapper = 'pwsh_encoded_command';
              }
            }

            // 命令黑名单拦截：命中则严格禁止执行
            // Command blacklist: strictly refuse execution when matched
            const blacklistTargets: string[] = [];
            if (typeof actualInput === 'string' && actualInput) {
              blacklistTargets.push(actualInput);
            }
            if (typeof powerShellScript === 'string' && powerShellScript) {
              blacklistTargets.push(powerShellScript);
            }
            if (resolvedKeySequence) {
              for (const item of resolvedKeySequence) {
                if (item.kind === 'text' && item.data) {
                  blacklistTargets.push(item.data);
                }
              }
            }
            for (const candidate of blacklistTargets) {
              const blacklist = this.checkCommandBlacklist(candidate);
              if (blacklist.blocked) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: blacklist.message || 'Command blocked.'
                    }
                  ],
                  structuredContent: {
                    blocked: true,
                    blockedCommand: blacklist.command || null,
                    terminalId: actualTerminalId,
                    resultStatus: {
                      state: 'blocked',
                      reason: 'blacklist',
                      nextAction: 'Change the command and retry.'
                    }
                  },
                  isError: true
                } as CallToolResult;
              }
            }

            // 等待策略：只允许“最大等待时间”，并对单次调用强制上限，避免 tools/call 被工具层 60s 超时吞掉响应
            // Wait strategy: only use "max wait time" and enforce a per-call hard cap to avoid tool-layer 60s timeouts
            // 兼容参数归一：wait.maxWaitMs 为主；timeoutMs/waitMs/waitForOutput 为兼容
            // Normalize parameters: prefer wait.maxWaitMs; keep timeoutMs/waitMs/waitForOutput for compatibility
            const mappedWait: any = (() => {
              if (wait && typeof wait === 'object') {
                return wait;
              }
              if (waitForOutput !== undefined) {
                const maxWaitMs = Math.max(0, Math.round(Number(waitForOutput) * 1000));
                return { mode: maxWaitMs > 0 ? 'idle' : 'none', maxWaitMs, idleMs: 500, includeIntermediateOutput: true };
              }
              // Default: idle wait to capture command output, safe for long-running processes.
              return { mode: 'idle', maxWaitMs: 2000, idleMs: 900, includeIntermediateOutput: true };
            })();

            const waitMode = mappedWait.mode ?? 'idle';
            const requestedMaxWaitMsRaw =
              Number.isFinite(mappedWait.maxWaitMs) ? Number(mappedWait.maxWaitMs)
                : (Number.isFinite(mappedWait.timeoutMs) ? Number(mappedWait.timeoutMs)
                  : (Number.isFinite(mappedWait.waitMs) ? Number(mappedWait.waitMs) : 0));
            const requestedMaxWaitMs = Math.max(0, Math.round(requestedMaxWaitMsRaw));

            // 渐进式最大等待时间限制：首次/前几次禁止直接请求 >60s，防止客户端误用导致重复启动
            // Progressive max-wait restriction: block >60s requests until enough <=60s attempts have been made to avoid duplicate starts
            // NOTE: do NOT block long waits with a hard "progressive wait required" gate.
            // The caller can explicitly declare `longTask=true` and then poll with exponential backoff.
            // 注意：不要用“渐进式等待必需”的硬闸门阻断长等待；调用方可用 longTask=true 明确声明长任务，并采用指数退避轮询。

            const waitTimeoutMsUncapped = requestedMaxWaitMs;
            const waitTimeoutMs = Math.min(waitTimeoutMsUncapped, MAX_SINGLE_CALL_WAIT_MS);
            const waitIdleMs = Number.isFinite(mappedWait.idleMs) ? Math.max(0, Math.round(mappedWait.idleMs)) : 900;
            const includeIntermediateOutput = mappedWait.includeIntermediateOutput !== undefined ? Boolean(mappedWait.includeIntermediateOutput) : true;

            // 为了避免“输入回显/粘连/边界不清晰”，对普通命令执行自动包一层 begin/end token。
            // This improves command boundary detection and reduces echo/fragment confusion.
            let boundaryToken: string | null = null;
            let boundaryWrappedInput: string | null = null;
            const canUseBoundary =
              !resolvedKeySequence &&
              !specialOperation &&
              typeof actualInput === 'string' &&
              actualInput.trim().length > 0 &&
              appendNewline !== false;
            if (canUseBoundary) {
              boundaryToken = `__CTI_BOUNDARY_${Date.now()}_${Math.random().toString(16).slice(2)}__`;
              let shellPath = '';
              try {
                const stats = await this.terminalManager.getTerminalStats(actualTerminalId);
                shellPath = String((stats as any)?.shell ?? '');
              } catch {
                shellPath = '';
              }
              const shellLower = shellPath.toLowerCase();
              const begin = `${boundaryToken}_BEGIN`;
              const end = `${boundaryToken}_END`;
              if (shellLower.includes('pwsh') || shellLower.includes('powershell')) {
                boundaryWrappedInput = `Write-Output '${begin}'; ${actualInput}; Write-Output '${end}'`;
              } else if (shellLower.includes('cmd.exe') || shellLower.endsWith('\\cmd.exe')) {
                boundaryWrappedInput = `echo ${begin} & ${actualInput} & echo ${end}`;
              } else {
                // bash/zsh/sh 等 / bash/zsh/sh etc.
                boundaryWrappedInput = `echo '${begin}'; ${actualInput}; echo '${end}'`;
              }
            }

            const writeOptions: any = resolvedKeySequence
              ? { terminalName: actualTerminalId, input: '' }
              : { terminalName: actualTerminalId, input: boundaryWrappedInput ?? actualInput };
            if (!resolvedKeySequence && appendNewline !== undefined) {
              writeOptions.appendNewline = appendNewline;
            }
            
            // 在写入命令之前获取当前光标位置
            let currentCursor = 0;
            try {
              // 获取输出缓冲区的最新sequence号，而不是行号
              const outputBuffer = this.terminalManager.getOutputBuffer(actualTerminalId);
              if (outputBuffer) {
                const stats = outputBuffer.getStats();
                // 读取最新的条目来获取当前sequence
                const latestEntries = outputBuffer.getLatest(1);
                if (latestEntries.length > 0 && latestEntries[0]) {
                  currentCursor = latestEntries[0].sequence;
                }
              }
            } catch (error) {
              // 如果获取统计信息失败，使用0作为默认值
              currentCursor = 0;
            }
            
            if (resolvedKeySequence) {
              // keys/keySequence 模式下总是按“原始按键”写入：不自动追加换行
              // In keys/keySequence mode always write raw keys: no auto newline
              for (const item of resolvedKeySequence) {
                if (!item.data) continue;
                await this.terminalManager.writeToTerminal({
                  terminalName: actualTerminalId,
                  input: item.data,
                  appendNewline: false
                });
                if (item.delayMsAfter > 0) {
                  await new Promise(resolve => setTimeout(resolve, item.delayMsAfter));
                }
              }
              structuredContent.keys = keys;
              structuredContent.keyDelayMs = defaultKeyDelay;
              structuredContent.keySequence = keySequence;
              structuredContent.appendNewline = false;
            } else {
              await this.terminalManager.writeToTerminal(writeOptions);
              structuredContent.appendNewline = appendNewline;
            }
            
            structuredContent.input = actualInput;
            if (boundaryToken) {
              structuredContent.boundary = { token: boundaryToken };
            }
            if (specialOperation) {
              structuredContent.specialOperation = specialOperation;
            }

            const effectiveStripSpinner = stripSpinner !== undefined ? Boolean(stripSpinner) : true;
            const effectiveNoEcho = noEcho !== false;
            // 未传 mode 时，默认使用 this_command_output（只返回本次命令的输出增量）
            // If mode is omitted, default to this_command_output (only return delta output for this command)
            const effectiveMode = mode || 'this_command_output';
            const effectiveReadModeForTerminalManager = effectiveMode === 'this_command_output' ? 'smart' : effectiveMode;

            // this_command_output：以写入前的 cursor 作为“基准 since”，只读取本次新增输出
            // this_command_output: use cursor-before-write as baseline, only read new output produced by this write
            const baselineSince = effectiveMode === 'this_command_output'
              ? currentCursor
              : (since !== undefined ? since : currentCursor);

            const waitStart = Date.now();
            const hardDeadline = waitStart + (waitTimeoutMs > 0 ? waitTimeoutMs : 0);
            let pollDelayMs = longTask ? 200 : 120;
            const maxPollDelayMs = longTask ? 2000 : 800;

            let nextSince = baselineSince;
            let lastCursor = nextSince;
            let accumulatedDelta = '';
            let accumulatedBytes = 0;
            let accumulatedLines = 0;
            let hasSeenAnyDelta = false;
            let lastActivityMs = Date.now();
            let latestResult: any = null;

            const checkPatternHit = (text: string): boolean => {
              const pattern = typeof mappedWait.pattern === 'string' ? mappedWait.pattern : '';
              if (!pattern) return false;
              const isRegex = Boolean(mappedWait.patternRegex);
              const isCaseSensitive = Boolean(mappedWait.patternCaseSensitive);
              try {
                if (isRegex) {
                  const flags = isCaseSensitive ? 'm' : 'mi';
                  const re = new RegExp(pattern, flags);
                  return re.test(text);
                }
                if (isCaseSensitive) {
                  return text.includes(pattern);
                }
                return text.toLowerCase().includes(pattern.toLowerCase());
              } catch {
                return false;
              }
            };

            const shouldWait = waitMode !== 'none' && waitTimeoutMs > 0;
            let waitMet = false;
            let waitReason: 'timeout' | 'idle' | 'prompt' | 'pattern' | 'exit' | 'none' = 'none';

            if (!shouldWait) {
              waitReason = 'none';
            } else {
              // 写入后强制最小等待，给 node-pty 时间把数据回传到缓冲区，避免“无输出”
              // Enforce a minimal post-write delay to let node-pty flush data back into buffers (avoid empty output)
              await new Promise(resolve => setTimeout(resolve, 200));

              // Poll readFromTerminal with incremental cursor to reduce repeated output.
              // 轮询增量读取，减少重复输出与调用次数
              while (Date.now() < hardDeadline) {
                const readOptions: any = {
                  terminalName: actualTerminalId,
                  since: nextSince,
                  maxLines: maxLines || 1000,
                  mode: effectiveReadModeForTerminalManager,
                  headLines: headLines || undefined,
                  tailLines: tailLines || undefined
                };

                const outputResult = await this.terminalManager.readFromTerminal(readOptions);
                latestResult = outputResult;

                const status = outputResult.status || null;
                if (status && typeof status.lastActivity === 'string') {
                  const ms = Date.parse(status.lastActivity);
                  if (Number.isFinite(ms)) {
                    lastActivityMs = ms;
                  }
                }

                const awaitingInput = this.terminalManager.isTerminalAwaitingInput(actualTerminalId);

                // Extract delta text, then normalize/strip to reduce token usage.
                const rawText = outputResult.output || '';
                const spinnerStripped = stripSpinnerChars(rawText, effectiveStripSpinner);
                const normalized = normalizeOutputText(spinnerStripped, actualInput, effectiveNoEcho);

                const cursor = typeof outputResult.cursor === 'number' ? outputResult.cursor : undefined;
                if (normalized) {
                  const cursorAdvanced = cursor !== undefined ? cursor > lastCursor : normalized.length > 0;
                  if (cursorAdvanced || !hasSeenAnyDelta) {
                    hasSeenAnyDelta = true;
                    if (includeIntermediateOutput) {
                      accumulatedDelta += normalized;
                      if (!normalized.endsWith('\n')) accumulatedDelta += '\n';
                      accumulatedBytes += Buffer.byteLength(normalized, 'utf8');
                      accumulatedLines += normalized.split('\n').length;
                    }
                  }
                }

                if (cursor !== undefined) {
                  lastCursor = cursor;
                  nextSince = cursor;
                }

                if (waitMode === 'pattern') {
                  if (checkPatternHit(includeIntermediateOutput ? accumulatedDelta : normalized)) {
                    waitMet = true;
                    waitReason = 'pattern';
                    break;
                  }
                } else if (waitMode === 'prompt') {
                  if ((status && status.hasPrompt) || awaitingInput) {
                    waitMet = true;
                    waitReason = 'prompt';
                    break;
                  }
                } else if (waitMode === 'exit') {
                  // Best-effort: only rely on exposed status fields; never block forever.
                  if (status && status.isRunning === false && hasSeenAnyDelta) {
                    waitMet = true;
                    waitReason = 'exit';
                    break;
                  }
                } else if (waitMode === 'idle') {
                  const idleForMs = Date.now() - lastActivityMs;
                  if (hasSeenAnyDelta && idleForMs >= waitIdleMs) {
                    waitMet = true;
                    waitReason = 'idle';
                    break;
                  }
                }

                const sleepMs = Math.min(maxPollDelayMs, pollDelayMs);
                pollDelayMs = Math.min(maxPollDelayMs, Math.max(50, Math.round(pollDelayMs * 1.6)));
                await new Promise(resolve => setTimeout(resolve, sleepMs));
              }

              if (!waitMet) {
                waitReason = 'timeout';
              }
            }

            // 注意：轮询会推进 nextSince（用于增量读取），但最终输出需要覆盖 baselineSince -> 当前末尾
            // Note: polling advances nextSince (for delta reads), but the final output must cover baselineSince -> current end
            const finalReadSince = effectiveMode === 'this_command_output'
              ? baselineSince
              : (since !== undefined ? since : currentCursor);

            const finalResult = await this.terminalManager.readFromTerminal({
              terminalName: actualTerminalId,
              since: finalReadSince,
              maxLines: maxLines || 1000,
              mode: effectiveReadModeForTerminalManager,
              headLines: headLines || undefined,
              tailLines: tailLines || undefined
            });

            const stripAnsiForMatching = (value: string): string => {
              if (!value) return value;
              return value
                .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
                .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, '')
                .replace(/\x1B[@-Z\\-_]/g, '');
            };

            const removeCommandEchoForThisCommandOutput = (text: string, commandInput: string | undefined): string => {
              const inputTrimmed = (commandInput ?? '').replace(/\r/g, '').trim();
              if (!text || !inputTrimmed) return text;

              const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
              const cleaned: string[] = [];
              let removed = false;

              for (const rawLine of lines) {
                const line = rawLine;
                const plain = stripAnsiForMatching(line).trim();
                if (!removed) {
                  // PowerShell 常见回显：PS D:\path> echo "x" / PS D:\path> > echo "x"
                  // Common PowerShell echo: PS D:\path> echo "x" / PS D:\path> > echo "x"
                  const isPsPrompt = /^PS\s+[A-Z]:.*>\s*/i.test(plain);
                  const endsWithInput =
                    plain === inputTrimmed ||
                    plain.endsWith(` ${inputTrimmed}`) ||
                    plain.endsWith(`> ${inputTrimmed}`) ||
                    plain.endsWith(`> > ${inputTrimmed}`);

                  if (isPsPrompt && plain.includes(inputTrimmed)) {
                    removed = true;
                    continue;
                  }
                  if (endsWithInput) {
                    removed = true;
                    continue;
                  }
                }

                cleaned.push(line);
              }

              return cleaned.join('\n');
            };

            let finalOutputRaw = normalizeOutputText(stripSpinnerChars(finalResult.output || '', effectiveStripSpinner), actualInput, effectiveNoEcho);
            if (boundaryToken && finalOutputRaw) {
              const begin = `${boundaryToken}_BEGIN`;
              const end = `${boundaryToken}_END`;
              const lines = finalOutputRaw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
              const beginIdx = lines.findIndex((l) => l.includes(begin));
              const endIdx = lines.findIndex((l) => l.includes(end));
              if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
                finalOutputRaw = lines.slice(beginIdx + 1, endIdx).join('\n').trimEnd();
                structuredContent.boundary.extracted = true;
              } else {
                structuredContent.boundary.extracted = false;
              }
            }
            // this_command_output 默认不需要回显“提示符+输入命令”，只保留命令结果
            // this_command_output should not include "prompt + input command" echo, keep only command results
            if (effectiveMode === 'this_command_output') {
              finalOutputRaw = removeCommandEchoForThisCommandOutput(finalOutputRaw, actualInput);
            }

            // 对“本次命令输出”做智能截断：限制返回文本大小（约 32k token 量级）
            // Intelligently truncate response text: limit returned text size (~32k token scale)
            const MAX_RETURN_CHARS = 128_000;
            const truncateMiddle = (text: string): { text: string; truncated: boolean } => {
              if (!text) return { text, truncated: false };
              if (text.length <= MAX_RETURN_CHARS) return { text, truncated: false };
              const keepHead = Math.floor(MAX_RETURN_CHARS * 0.55);
              const keepTail = MAX_RETURN_CHARS - keepHead;
              const head = text.slice(0, keepHead).trimEnd();
              const tail = text.slice(text.length - keepTail).trimStart();
              const marker = `\n\n--- Output Truncated (kept ${keepHead}+${keepTail} chars, omitted ${text.length - MAX_RETURN_CHARS} chars) ---\n\n`;
              return { text: `${head}${marker}${tail}`, truncated: true };
            };

            const truncatedOutput = truncateMiddle(finalOutputRaw);
            const finalOutput = truncatedOutput.text;
            const awaitingInput = this.terminalManager.isTerminalAwaitingInput(actualTerminalId);
            const status = finalResult.status || null;

            // 建议等待模式：尽量让客户端不需要猜 / Recommended wait mode to reduce guesswork
            let recommendedWaitMode: 'idle' | 'prompt' | 'none' = 'idle';
            let recommendationReason = 'default';
            if (awaitingInput || (status && status.hasPrompt)) {
              recommendedWaitMode = 'prompt';
              recommendationReason = 'prompt detected';
            } else if (status && status.isRunning) {
              recommendedWaitMode = 'idle';
              recommendationReason = 'command appears running';
            } else {
              recommendedWaitMode = 'idle';
              recommendationReason = 'safe default for long-running processes';
            }

            // 等待到期不应作为错误抛出：必须返回结构化结果，让客户端按同一模式继续轮询/调整 maxWaitMs
            // Do not throw on wait expiry: return a structured result so the client can keep polling/adjust maxWaitMs in the same mode
            if (waitMode !== 'none' && waitReason === 'timeout') {
              responseText =
                `Wait reached maxWaitMs on terminal ${actualTerminalId} (requested=${requestedMaxWaitMs}ms, effective=${waitTimeoutMs}ms, cap=${MAX_SINGLE_CALL_WAIT_MS}ms).\n` +
                `Call read_CTI to continue reading output, or call interact_with_terminal again with a larger wait.maxWaitMs / longTask=true.\n\n` +
                `--- Command Output (partial) ---\n${finalOutput}\n--- End of Command Output ---`;
            } else {
              responseText = `Command executed successfully on terminal ${actualTerminalId}.\n\n--- Command Output ---\n${finalOutput}\n--- End of Command Output ---`;
            }

            const resultState: 'running' | 'finished' | 'blocked' | 'timeout' =
              (waitMode !== 'none' && waitReason === 'timeout')
                ? 'timeout'
                : (waitMode === 'none' ? 'running' : 'finished');
            const nextAction =
              resultState === 'timeout'
                ? 'Call read_CTI to continue reading output, or re-run interact_with_terminal with a larger wait.maxWaitMs / longTask=true.'
                : (resultState === 'running'
                  ? 'Call read_CTI to read incremental output, or re-run interact_with_terminal with wait.mode=prompt.'
                  : null);

            structuredContent = {
              ...structuredContent,
              kind: (waitMode !== 'none' && waitReason === 'timeout') ? 'wait_timeout' : 'ok',
              resultStatus: {
                state: resultState,
                reason: waitReason,
                nextAction
              },
              wait: {
                mode: waitMode,
                // 统一字段：maxWaitMs（单次调用最大等待时间）
                // Unified field: maxWaitMs (per-call max wait)
                maxWaitMs: waitTimeoutMs,
                met: waitMet,
                reason: waitReason,
                requestedMaxWaitMs,
                effectiveMaxWaitMs: waitTimeoutMs,
                singleCallCapMs: MAX_SINGLE_CALL_WAIT_MS,
                capped: waitTimeoutMsUncapped > waitTimeoutMs
              },
              write: {
                appendedNewline: structuredContent.appendNewline !== undefined ? structuredContent.appendNewline : true,
                bytesWritten: typeof actualInput === 'string' ? Buffer.byteLength(actualInput, 'utf8') : 0,
                startedAt: new Date(waitStart).toISOString()
              },
              read: {
                mode: effectiveMode,
                since: baselineSince,
                cursor: finalResult.cursor ?? finalResult.since ?? null,
                hasMore: Boolean(finalResult.hasMore),
                // 这里的 truncated 表示“返回给调用方的文本是否被截断”
                // truncated here means "response text was truncated for the caller"
                truncated: Boolean(finalResult.truncated) || truncatedOutput.truncated
              },
              delta: {
                text: normalizeOutputText(stripSpinnerChars(accumulatedDelta, effectiveStripSpinner), actualInput, effectiveNoEcho),
                bytes: accumulatedBytes,
                lines: accumulatedLines
              },
              commandOutput: finalOutput,
              readMode: effectiveMode,
              totalLines: finalResult.totalLines,
              hasMore: finalResult.hasMore,
              truncated: Boolean(finalResult.truncated) || truncatedOutput.truncated,
              status: {
                ...(status || {}),
                awaitingInput,
                recommendedWaitMode,
                recommendationReason
              }
            };

            if (finalResult.stats) {
              structuredContent.stats = finalResult.stats;
            }
          } else {
            // 如果没有输入，则只读取终端输出
            const readOptions: any = {
              terminalName: actualTerminalId,
              since: since || undefined,
              maxLines: maxLines || undefined,
              mode: mode || 'smart',
              headLines: headLines || undefined,
              tailLines: tailLines || undefined,
              stripSpinner: stripSpinner
            };
            
            const outputResult = await this.terminalManager.readFromTerminal(readOptions);
            const effectiveStripSpinner = stripSpinner !== undefined ? Boolean(stripSpinner) : true;
            const cleanedOutput = normalizeOutputText(stripSpinnerChars(outputResult.output || '', effectiveStripSpinner), undefined, true);
            
            responseText = `Terminal Output (${actualTerminalId}):\n\n${cleanedOutput}\n\n--- End of Output ---`;
            responseText += `\nTotal Lines: ${outputResult.totalLines}\n`;
            responseText += `Has More: ${outputResult.hasMore}\n`;
            responseText += `Next Read Cursor: ${outputResult.cursor ?? outputResult.since}`;
            
            if (outputResult.truncated) {
              responseText += `\nTruncated: Yes`;
            }
            
            structuredContent = {
              ...structuredContent,
              readMode: readOptions.mode,
              totalLines: outputResult.totalLines,
              hasMore: outputResult.hasMore,
              truncated: outputResult.truncated,
              read: {
                mode: readOptions.mode,
                since: readOptions.since ?? null,
                cursor: outputResult.cursor ?? outputResult.since ?? null,
                hasMore: Boolean(outputResult.hasMore),
                truncated: Boolean(outputResult.truncated)
              },
              delta: {
                text: cleanedOutput,
                bytes: Buffer.byteLength(cleanedOutput || '', 'utf8'),
                lines: (cleanedOutput || '').split('\n').length
              }
            };
            
            // 添加统计信息
            if (outputResult.stats) {
              structuredContent.stats = outputResult.stats;
              responseText += `\n\nStatistics:`;
              responseText += `\n- Total Bytes: ${outputResult.stats.totalBytes}`;
              responseText += `\n- Estimated Tokens: ${outputResult.stats.estimatedTokens}`;
              responseText += `\n- Lines Shown: ${outputResult.stats.linesShown}`;
              if (outputResult.stats.linesOmitted > 0) {
                responseText += `\n- Lines Omitted: ${outputResult.stats.linesOmitted}`;
              }
            }
            
            // 添加状态信息
            if (outputResult.status) {
              structuredContent.status = outputResult.status;
              responseText += `\n\nStatus:`;
              responseText += `\n- Running: ${outputResult.status.isRunning}`;
              responseText += `\n- Prompt Visible: ${outputResult.status.hasPrompt}`;
              responseText += `\n- Last Activity: ${outputResult.status.lastActivity}`;
              if (outputResult.status.promptLine) {
                responseText += `\n- Prompt: ${outputResult.status.promptLine}`;
              }
              if (outputResult.status.pendingCommand) {
                responseText += `\n- Pending Command: ${outputResult.status.pendingCommand.command} (started ${outputResult.status.pendingCommand.startedAt})`;
              }
              if (outputResult.status.lastCommand) {
                responseText += `\n- Last Command: ${outputResult.status.lastCommand.command}`;
                if (outputResult.status.lastCommand.completedAt) {
                  responseText += ` (completed ${outputResult.status.lastCommand.completedAt})`;
                }
              }
            }
          }

          // 可选：对终端缓冲区做正则/文本搜索（不新增工具）
          // Optional: regex/plain-text search on terminal output buffer (no new tool)
          if (typeof search === 'string' && search.trim()) {
            const searchResult = this.searchTerminalBuffer({
              terminalId: actualTerminalId,
              query: search,
              isRegex: Boolean(searchRegex),
              caseSensitive: Boolean(caseSensitive),
              contextLines: typeof contextLines === 'number' ? contextLines : 2,
              maxMatches: typeof maxMatches === 'number' ? maxMatches : 50,
              since: typeof searchSince === 'number' ? searchSince : 0
            });

            if ('error' in searchResult) {
              return {
                content: [{ type: 'text', text: searchResult.error }],
                structuredContent: { isError: true, reason: 'SEARCH_FAILED', terminalId: actualTerminalId },
                isError: true
              } as CallToolResult;
            }

            structuredContent.search = {
              query: search,
              regex: Boolean(searchRegex),
              caseSensitive: Boolean(caseSensitive),
              contextLines: typeof contextLines === 'number' ? contextLines : 2,
              maxMatches: typeof maxMatches === 'number' ? maxMatches : 50,
              since: typeof searchSince === 'number' ? searchSince : 0,
              matchCount: searchResult.matchCount,
              lines: searchResult.lines
            };

            const preview = searchResult.lines
              .map((l) => `${l.lineNumber}:${l.sequence} ${l.content}`)
              .join('\n');
            responseText += `\n\n--- Search Results (matchCount=${searchResult.matchCount}) ---\n${preview}\n--- End of Search Results ---`;
          }
          
          // 如果创建了新终端，添加相关信息
          if (terminalCreated) {
            responseText = terminalCreated
              ? `Terminal "${actualTerminalId}" created and ready.\n\n${responseText}`
              : responseText;
          }

          // 将提示/警告信息附加到最终文本响应中（不影响 structuredContent 的机器可读数据）
          // Attach notices/warnings to final text response (without affecting machine-readable structuredContent)
          if (warnings.length > 0) {
            const warningText = warnings.join('\n\n');
            responseText = responseText ? `${warningText}\n\n${responseText}` : warningText;
            structuredContent.warnings = warnings;
          }
          
          return {
            content: [
              {
                type: 'text',
                text: responseText
              }
            ],
            structuredContent
          } as CallToolResult;
        } catch (error) {
          let cwdHint = '';
          try {
            const tid = typeof terminalId === 'string' ? terminalId : (terminalId ? String(terminalId) : '');
            if (tid) {
              const stats = await this.terminalManager.getTerminalStats(tid);
              const currentCwd = (stats as any)?.cwd;
              if (currentCwd) {
                cwdHint = ` (current cwd: ${currentCwd})`;
              }
            }
          } catch {
            // ignore / 忽略
          }
          return {
            content: [
              {
                type: 'text',
                text: `Error interacting with terminal: ${error instanceof Error ? error.message : String(error)}${cwdHint}`
              }
            ],
            isError: true
          } as CallToolResult;
        }
      }
      );
    } else {
      console.log('[MCP-INFO] Tool "interact_with_terminal" is disabled');
    }

    // Codex Bug Fix Tool
    if (!this.isToolDisabled('fix_bug_with_codex')) {
      // 同样对 Codex 修复工具减少类型推导复杂度，避免深度类型实例化问题
      // Similarly, reduce type inference complexity for Codex fix tool to avoid deep type instantiation issues
      const fixBugWithCodexSchema: any = {
        description: z.string().describe(`DETAILED bug description for Codex.

MUST INCLUDE:
- Problem symptoms (what's broken)
- Expected behavior (what should happen)
- Problem location (file paths, line numbers)
- Related code snippets
- Root cause (if known)
- Fix suggestions (if any)
- Impact scope (what else might be affected)
- Related files (all relevant file paths)
- Test cases (how to verify the fix)
- Context (background information)

The more detailed, the better the fix!`),
        cwd: z.string().optional().describe('Working directory (default: current directory)'),
        timeout: z.number().optional().describe('Timeout in milliseconds (default: 600000 = 10 minutes)')
      };

      (this.server as any).tool(
        'fix_bug_with_codex',
        `Use OpenAI Codex CLI to automatically fix bugs with FULL SYSTEM ACCESS.

WARNING CRITICAL: This tool gives Codex COMPLETE control over the codebase!
- Sandbox: danger-full-access (no restrictions)
- Approval: never (fully automated)

YOUR RESPONSIBILITY (AI Assistant):
You MUST provide a DETAILED and COMPREHENSIVE bug description to Codex.
The quality of the fix depends entirely on how well you describe the problem!

IMPORTANT NOTES:
1. ONLY use ENGLISH in the description (no Chinese, no emoji)
2. UTF-8 encoding issues may occur with non-ASCII characters
3. Keep the description clear, structured, and detailed
4. Use plain text formatting (avoid special characters)

GOOD DESCRIPTION EXAMPLE (DO THIS):
"Username validation bug in auth.js file.

PROBLEM:
- File: src/auth/login.ts, line 45
- Code: const usernameRegex = /^[a-zA-Z0-9]{3,20}$/
- Symptom: Username 'user_name' is rejected with 'Invalid username' error
- Expected: Should accept usernames with underscores and hyphens

ROOT CAUSE:
- Regex [a-zA-Z0-9] only allows letters and numbers
- Missing support for underscore and hyphen characters

SUGGESTED FIX:
- Change regex to: /^[a-zA-Z0-9_-]{3,20}$/
- This will allow underscores and hyphens in usernames

IMPACT:
- Affects login() and register() functions
- May impact existing user validation logic

RELATED FILES:
- src/auth/login.ts (main fix)
- src/auth/validation.ts (may need update)
- tests/auth/login.test.ts (for verification)

TEST CASES:
- 'user_name' should pass
- 'user-name' should pass
- 'user@name' should fail

VERIFICATION:
- Run: npm test
- Expected: all tests pass"

BAD DESCRIPTION EXAMPLE (DON'T DO THIS):
"Login has a bug, please fix it"
"Username validation is wrong"
"Fix the regex in auth.js"

WHAT TO INCLUDE IN YOUR DESCRIPTION:
1. Problem symptoms - specific error behavior
2. Expected behavior - how it should work
3. Problem location - file path, line number, function name
4. Related code - the problematic code snippet
5. Root cause - why this problem occurs (if known)
6. Fix suggestions - how to fix it (if you have ideas)
7. Impact scope - what else might be affected
8. Related files - all relevant file paths
9. Test cases - how to verify the fix works
10. Context information - background that helps understand the problem

HOW THIS TOOL WORKS:
1. Your bug description will be saved to: docs/codex-bug-description-TIMESTAMP.md
2. Codex will read this document and analyze the problem
3. Codex will fix the bug in the codebase
4. Codex will generate a fix report in: docs/codex-fix-TIMESTAMP.md
5. Both documents will be preserved in docs/ for reference

WORKFLOW AFTER CALLING THIS TOOL:
1. Wait for Codex to complete (up to 10 minutes)
2. YOU MUST read the fix report: docs/codex-fix-TIMESTAMP.md
3. YOU MUST summarize the changes to the user
4. YOU MUST provide testing recommendations
5. Optionally, review the bug description document to see what was sent to Codex

WHAT CODEX WILL DO:
1. Read your bug description from docs/codex-bug-description-TIMESTAMP.md
2. Analyze the problem based on your description
3. Fix the bug in the codebase
4. Generate a comprehensive fix report in docs/codex-fix-TIMESTAMP.md
5. The report includes: problem, changes, files modified, testing guide

TIMEOUT:
Default: 10 minutes (600000ms)
Adjust if the fix is complex or involves many files

TIP:
Before calling this tool, gather as much information as possible:
- Read error messages
- Check relevant files
- Understand the expected behavior
- Review recent changes that might have caused the bug`,
      fixBugWithCodexSchema,
      {
        title: 'Fix Bug with Codex (Full Access)',
        readOnlyHint: false
      },
      async (args: any): Promise<CallToolResult> => {
        const { description, cwd, timeout } = args;
        const params: { description: string; cwd?: string; timeout?: number } = { description };
        if (cwd) params.cwd = cwd;
        if (timeout) params.timeout = timeout;
        return await this.fixBugWithCodex(params);
      }
      );
    } else {
      console.log('[MCP-INFO] Tool "fix_bug_with_codex" is disabled');
    }
  }

  /**
   * 设置 MCP 资源
   */
  private setupResources(): void {
    // 终端列表资源
    this.server.resource(
      'terminal-list',
      'terminal://list',
      { description: 'List of all terminal sessions', mimeType: 'application/json' },
      async (): Promise<ReadResourceResult> => {
        try {
          const result = await this.terminalManager.listTerminals();
          return {
            contents: [
              {
                uri: 'terminal://list',
                mimeType: 'application/json',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        } catch (error) {
          throw new Error(`Failed to get terminal list: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // 终端输出资源模板
    this.server.resource(
      'terminal-output',
      new ResourceTemplate('terminal://output/{terminalId}', {
        list: undefined // 不需要列出所有可能的终端输出
      }),
      { description: 'Terminal output for a specific terminal', mimeType: 'text/plain' },
      async (uri: URL, variables): Promise<ReadResourceResult> => {
        try {
          const terminalId = variables.terminalId;
          if (!terminalId) {
            throw new Error('Terminal ID is required');
          }

          const actualTerminalId = Array.isArray(terminalId) ? terminalId[0] : terminalId;
          if (!actualTerminalId) {
            throw new Error('Terminal ID is required');
          }
          const result = await this.terminalManager.readFromTerminal({ terminalName: actualTerminalId });
          return {
            contents: [
              {
                uri: uri.toString(),
                mimeType: 'text/plain',
                text: result.output
              }
            ]
          };
        } catch (error) {
          throw new Error(`Failed to read terminal output: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // 管理器统计资源
    this.server.resource(
      'terminal-stats',
      'terminal://stats',
      { description: 'Terminal manager statistics', mimeType: 'application/json' },
      async (): Promise<ReadResourceResult> => {
        try {
          const stats = this.terminalManager.getStats();
          return {
            contents: [
              {
                uri: 'terminal://stats',
                mimeType: 'application/json',
                text: JSON.stringify(stats, null, 2)
              }
            ]
          };
        } catch (error) {
          throw new Error(`Failed to get terminal stats: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );
  }

  /**
   * 设置 MCP 提示
   */
  private setupPrompts(): void {
    // 提供一个空的prompts列表，避免Method not found错误
    // 注意：虽然capabilities中声明了prompts，但可以不提供具体的prompt实现
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // 监听终端事件并记录日志
    // 使用 stderr 避免污染 stdio JSON-RPC 通道

    this.terminalManager.on('terminalCreated', (terminalId, session) => {
      process.stderr.write(`[MCP-INFO] Terminal created: ${terminalId} (PID: ${session.pid})\n`);
    });

    this.terminalManager.on('terminalExit', (terminalId, exitCode, signal) => {
      process.stderr.write(`[MCP-INFO] Terminal exited: ${terminalId} (code: ${exitCode}, signal: ${signal})\n`);
    });

    this.terminalManager.on('terminalKilled', (terminalId, signal) => {
      process.stderr.write(`[MCP-INFO] Terminal killed: ${terminalId} (signal: ${signal})\n`);
    });

    this.terminalManager.on('terminalCleaned', (terminalId) => {
      process.stderr.write(`[MCP-INFO] Terminal cleaned up: ${terminalId}\n`);
    });
  }

  /**
   * 获取 MCP 服务器实例
   */
  getServer(): McpServer {
    return this.server;
  }

  /**
   * 获取终端管理器实例
   */
  getTerminalManager(): TerminalManager {
    return this.terminalManager;
  }

  /**
   * 关闭服务器
   */
  async shutdown(): Promise<void> {
    process.stderr.write('[MCP-INFO] Shutting down MCP server...\n');

    // 关闭 Web UI
    await this.webUiManager.stop();

    await this.terminalManager.shutdown();
    process.stderr.write('[MCP-INFO] MCP server shutdown complete\n');
  }
}
