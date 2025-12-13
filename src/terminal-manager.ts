import { spawn } from 'node-pty';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  TerminalSession,
  TerminalCreateOptions,
  TerminalWriteOptions,
  TerminalReadOptions,
  TerminalReadResult,
  TerminalListResult,
  TerminalManagerConfig,
  TerminalError,
  TerminalStatsResult,
  TerminalReadStatus,
  CommandRuntimeInfo
} from './types.js';
import { OutputBuffer } from './output-buffer.js';
import { OutputBufferEntry } from './types.js';

/**
 * 终端会话管理器
 * 负责创建、管理和维护持久化的终端会话
 */
export class TerminalManager extends EventEmitter {
  private sessions = new Map<string, TerminalSession>();
  private ptyProcesses = new Map<string, any>();
  private outputBuffers = new Map<string, OutputBuffer>();
  private exitPromises = new Map<string, Promise<void>>();
  private exitResolvers = new Map<string, () => void>();
  private config: Required<TerminalManagerConfig>;
  private cleanupTimer: NodeJS.Timeout;
  
  // Terminal name mapping - 终端名称映射
  private terminalNameMap = new Map<string, string>(); // name -> internal UUID
  private terminalReverseMap = new Map<string, string>(); // internal UUID -> name

  constructor(config: TerminalManagerConfig = {}) {
    super();

    this.config = {
      maxBufferSize: config.maxBufferSize || 10000,
      sessionTimeout: config.sessionTimeout || 24 * 60 * 60 * 1000, // 24 hours
      defaultShell: config.defaultShell ?? process.env.DEFAULT_SHELL ?? (process.platform === 'win32' ? 'pwsh.exe' : '/bin/bash'),
      defaultCols: config.defaultCols || 80,
      defaultRows: config.defaultRows || 24,
      compactAnimations: config.compactAnimations ?? true,
      animationThrottleMs: config.animationThrottleMs || 100
    };

    // 定期清理超时的会话
    this.cleanupTimer = setInterval(() => this.cleanupTimeoutSessions(), 60000); // 每分钟检查一次
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 解析终端名称 - 支持终端名称和UUID
   * Resolve terminal name - supports terminal names and UUIDs
   */
  private resolveTerminalName(terminalName: string): string {
    // 如果是 UUID 格式，直接返回
    // If it's UUID format, return directly
    if (/^[0-9a-f]{8}-/i.test(terminalName)) {
      return terminalName;
    }
    // 如果是终端名称，映射到内部 UUID
    // If it's a terminal name, map to internal UUID
    const internalId = this.terminalNameMap.get(terminalName);
    if (!internalId) {
      throw new Error(`终端 "${terminalName}" 不存在。可用终端：${Array.from(this.terminalNameMap.keys()).join(', ')}`);
    }
    return internalId;
  }

  /**
   * 智能选择读取模式
   * Smart selection of read mode
   */
  private selectReadMode(totalLines: number): 'full' | 'head' | 'tail' | 'head-tail' {
    if (totalLines < 100) {
      return 'full';
    } else if (totalLines < 1000) {
      return 'head-tail';
    } else {
      return 'head-tail';  // 更激进的截断
    }
  }

  /**
   * 创建新的终端会话 - 支持终端名称
   * Create new terminal session - supports terminal names
   */
  async createTerminal(options: TerminalCreateOptions & {terminalName?: string} = {}): Promise<string> {
    const internalId = uuidv4();
    
    // 必须提供终端名称，禁止使用UUID
    // Terminal name is required, UUID usage is prohibited
    if (!options.terminalName) {
      throw new Error('必须提供终端名称，禁止使用UUID作为终端标识符。请提供一个有意义的简短描述作为终端名称。');
    }
    
    const terminalName = options.terminalName;
    
    // 检查终端名称是否已存在
    // Check if terminal name already exists
    if (this.terminalNameMap.has(terminalName)) {
      throw new Error(`终端名称 "${terminalName}" 已存在，请选择其他名称`);
    }
    
    // 验证终端名称格式 - 不允许UUID格式
    // Validate terminal name format - UUID format is not allowed
    if (/^[0-9a-f]{8}-/i.test(terminalName)) {
      throw new Error('禁止使用UUID格式的终端名称，请使用有意义的描述性名称');
    }
    
    // 建立映射关系
    // Establish mapping relationship
    this.terminalNameMap.set(terminalName, internalId);
    this.terminalReverseMap.set(internalId, terminalName);

    let { shell } = options;
    // Handle shell parameter conversion for Windows compatibility
    // Convert "pwsh" to "pwsh.exe" on Windows platforms to improve robustness
    if (process.platform === 'win32' && shell === 'pwsh') {
      shell = 'pwsh.exe';
    }

    const {
      shell: finalShell = this.config.defaultShell,
      cwd = process.cwd(),
      env = { ...process.env } as Record<string, string>,
      cols = this.config.defaultCols,
      rows = this.config.defaultRows
    } = options;

    // Use the converted shell if provided, otherwise use the default
    const resolvedShell = shell || finalShell;

    try {
      // 确保环境变量中包含 TERM，这对交互式应用很重要
      const ptyEnv = {
        ...env,
        TERM: env.TERM || 'xterm-256color',
        // 确保 LANG 设置正确，避免编码问题
        LANG: env.LANG || 'en_US.UTF-8',
        // 禁用一些可能干扰输出的环境变量
        PAGER: env.PAGER || 'cat',
      };

      // 创建 PTY 进程
      const ptyProcess = spawn(resolvedShell, [], {
        name: 'xterm-256color',  // 修复：使用正确的终端类型
        cols,
        rows,
        cwd,
        env: ptyEnv,
        // 启用 UTF-8 编码
        encoding: 'utf8' as any
      });

      let resolveExit: (() => void) | null = null;
      const exitPromise = new Promise<void>((resolve) => {
        resolveExit = resolve;
      });
      this.exitPromises.set(internalId, exitPromise);
      if (resolveExit) {
        this.exitResolvers.set(internalId, resolveExit);
      }

      // 创建会话记录
      const session: TerminalSession = {
        id: internalId,
        pid: ptyProcess.pid,
        shell: resolvedShell,
        cwd,
        env,
        created: new Date(),
        lastActivity: new Date(),
        status: 'active',
        pendingCommand: null,
        lastCommand: null,
        lastPromptLine: null,
        lastPromptAt: null,
        hasPrompt: false,
        alternateScreen: false,
        rawOutput: ''
      };

      // 创建输出缓冲器
      const outputBuffer = new OutputBuffer(internalId, this.config.maxBufferSize, {
        compactAnimations: this.config.compactAnimations,
        animationThrottleMs: this.config.animationThrottleMs
      });

      // 监听输出缓冲的更新以追踪提示符和命令状态
      outputBuffer.on('data', (entries: OutputBufferEntry[]) => {
        this.processBufferEntries(session, entries);
      });

      // 监听 PTY 输出 - 始终使用用户可见的终端名称进行事件广播
      // Listen PTY output - always use human-readable terminal name when emitting events
      ptyProcess.onData((data: string) => {
        setImmediate(() => {
          const now = new Date();
          session.lastActivity = now;

          // 记录原始输出，并检测是否进入/退出备用屏幕（vim 等全屏程序）
          // Record raw output and detect alternate screen enter/exit (fullscreen apps like vim)
          this.updateRawOutputAndScreenState(session, data);

          outputBuffer.append(data);
          // 使用终端名称而不是内部 UUID，保证 WebSocket 与前端使用的 ID 对齐
          // Use terminal name instead of internal UUID so WebSocket IDs match frontend IDs
          const publicTerminalId = this.terminalReverseMap.get(internalId) || terminalName;
          this.emit('terminalOutput', publicTerminalId, data);
        });
      });

      // 监听 PTY 退出 - 统一使用终端名称进行事件广播
      // Listen PTY exit - consistently emit events with terminal name
      ptyProcess.onExit((e: { exitCode: number; signal?: number }) => {
        session.status = 'terminated';
        session.lastActivity = new Date();
        const publicTerminalId = this.terminalReverseMap.get(internalId) || terminalName;
        this.emit('terminalExit', publicTerminalId, e.exitCode, e.signal);

        const resolver = this.exitResolvers.get(internalId);
        if (resolver) {
          resolver();
          this.exitResolvers.delete(internalId);
        }

        // 清理资源
        const cleanupTimer = setTimeout(() => {
          this.cleanupSession(internalId);
        }, 5000); // 5秒后清理
        if (typeof cleanupTimer.unref === 'function') {
          cleanupTimer.unref();
        }
      });

      // 存储会话信息 / Store session info
      this.sessions.set(internalId, session);
      this.ptyProcesses.set(internalId, ptyProcess);
      this.outputBuffers.set(internalId, outputBuffer);

      // 事件中也使用终端名称，方便日志与前端调试
      // Also emit terminalCreated with terminal name for easier logging & debugging
      this.emit('terminalCreated', terminalName, session);
      
     return terminalName;  // 返回终端名称
    } catch (error) {
     const terminalError: TerminalError = new Error(`Failed to create terminal: ${error}`) as TerminalError;
     terminalError.code = 'CREATE_FAILED';
     terminalError.terminalName = terminalName;
     throw terminalError;
   }
  }

  /**
   * 向终端写入数据 - 支持终端名称
   * Write data to terminal - supports terminal names
   */
  async writeToTerminal(options: TerminalWriteOptions): Promise<void> {
    const { terminalName, input, appendNewline } = options;
    
    // 解析终端名称
    // Resolve terminal name
    const resolvedId = this.resolveTerminalName(terminalName);

    const ptyProcess = this.ptyProcesses.get(resolvedId);
    const session = this.sessions.get(resolvedId);

    if (!ptyProcess || !session) {
      const error: TerminalError = new Error(`Terminal ${terminalName} not found`) as TerminalError;
      error.code = 'TERMINAL_NOT_FOUND';
      error.terminalName = terminalName;
      throw error;
    }

    if (session.status !== 'active') {
      const error: TerminalError = new Error(`Terminal ${terminalName} is not active`) as TerminalError;
      error.code = 'TERMINAL_INACTIVE';
      error.terminalName = terminalName;
      throw error;
    }

    try {
      // 如果输入不以换行符结尾，自动添加换行符以执行命令。
      // 对多行输入（例如粘贴到 vim 插入模式）默认不自动追加，避免多余回车导致状态错乱。
      // Auto-append newline when input doesn't end with a newline.
      // For multi-line input (e.g., pasting into vim insert mode), default to NO auto-append to avoid extra Enter.
      const hasMultiline = input.includes('\n') || input.includes('\r\n');
      const autoAppend = appendNewline ?? (hasMultiline ? false : this.shouldAutoAppendNewline(input));
      const needsNewline = autoAppend && !input.endsWith('\n') && !input.endsWith('\r');
      const newlineChar = '\r';
      const inputWithAutoNewline = needsNewline ? input + newlineChar : input;
      const inputToWrite = this.normalizeNewlines(inputWithAutoNewline);

      // 写入数据到 PTY。
      // Windows ConPTY 在一次 write 过大时可能丢数据；因此这里按块写入并小幅让出事件循环。
      // Write to PTY in chunks.
      // Windows ConPTY may drop very large single writes, so we chunk and yield briefly.
      await this.writeInChunks(ptyProcess, inputToWrite);

      session.lastActivity = new Date();
      this.emit('terminalInput', terminalName, inputToWrite);

      const executed = /[\n\r]$/.test(inputToWrite);
      this.trackCommand(session, inputToWrite, executed);

      // 给 PTY 一点时间处理输入
      // 这对于交互式应用特别重要
      await new Promise(resolve => setImmediate(resolve));
    } catch (error) {
      const terminalError: TerminalError = new Error(`Failed to write to terminal: ${error}`) as TerminalError;
      terminalError.code = 'WRITE_FAILED';
      terminalError.terminalName = terminalName;
      throw terminalError;
    }
  }

  private normalizeNewlines(value: string): string {
    if (!value) {
      return value;
    }

    // Normalize CRLF to CR first, then convert bare LF to CR so Enter behaves like a real TTY
    return value
      .replace(/\r\n/g, '\r')
      .replace(/\n/g, '\r');
  }

  /**
   * 分块写入，避免 ConPTY 大包截断
   * Chunked write to avoid ConPTY truncation on large payloads
   */
  private async writeInChunks(ptyProcess: any, data: string): Promise<void> {
    const chunkSize = 4000;
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.slice(offset, offset + chunkSize);
      const written = ptyProcess.write(chunk);
      if (written === false) {
        await new Promise<void>((resolve) => {
          const onDrain = () => {
            ptyProcess.off('drain', onDrain);
            resolve();
          };
          ptyProcess.on('drain', onDrain);
          setTimeout(() => {
            ptyProcess.off('drain', onDrain);
            resolve();
          }, 5000);
        });
      }
      // 让出事件循环，给全屏程序处理输入的时间
      // Yield to event loop to let fullscreen apps process input
      await new Promise(resolve => setTimeout(resolve, 2));
    }
  }

  /**
   * 更新原始输出缓冲并检测备用屏幕状态
   * Update raw output buffer and detect alternate screen state
   */
  private updateRawOutputAndScreenState(session: TerminalSession, data: string): void {
    if (!session) {
      return;
    }

    const enterSeqs = ['\x1b[?1049h', '\x1b[?47h', '\x1b[?1047h'];
    const exitSeqs = ['\x1b[?1049l', '\x1b[?47l', '\x1b[?1047l'];

    for (const seq of enterSeqs) {
      if (data.includes(seq)) {
        session.alternateScreen = true;
        break;
      }
    }
    for (const seq of exitSeqs) {
      if (data.includes(seq)) {
        session.alternateScreen = false;
        break;
      }
    }

    if (session.rawOutput === undefined) {
      session.rawOutput = '';
    }
    session.rawOutput += data;
    const maxRawChars = 200000;
    if (session.rawOutput.length > maxRawChars) {
      session.rawOutput = session.rawOutput.slice(session.rawOutput.length - maxRawChars);
    }
  }

  private shouldAutoAppendNewline(input: string): boolean {
    if (!input) {
      return false;
    }

    if (input.includes('')) {
      return false;
    }

    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      if ((code < 32 || code === 127) && code !== 9 && code !== 10 && code !== 13) {
        return false;
      }
    }

    return true;
  }

  /**
   * 从终端读取输出 - 支持终端名称和智能模式
   * Read output from terminal - supports terminal names and smart mode
   */
  async readFromTerminal(options: TerminalReadOptions): Promise<TerminalReadResult> {
    const { terminalName, since = 0, maxLines = 1000, mode, headLines, tailLines } = options;
    
    // 解析终端名称
    // Resolve terminal name
    const resolvedId = this.resolveTerminalName(terminalName);

    const outputBuffer = this.outputBuffers.get(resolvedId);
    const session = this.sessions.get(resolvedId);

    if (!outputBuffer || !session) {
      const error: TerminalError = new Error(`Terminal ${terminalName} not found`) as TerminalError;
      error.code = 'TERMINAL_NOT_FOUND';
      error.terminalName = terminalName;
      throw error;
    }

    try {
      // 给一个很小的延迟，确保 onData 事件中的数据已经被处理
      // 这解决了"读取到旧数据"的问题
      await new Promise(resolve => setImmediate(resolve));
      // 如果指定了智能读取模式，使用新的 readSmart 方法
      const cursorPosition = since ?? 0;
      
      // 智能模式：自动选择最佳读取方式
      // Smart mode: automatically select best reading method
      let selectedMode = mode;
      if (mode === 'auto' || mode === 'smart') {
        const stats = outputBuffer.getStats();
        selectedMode = this.selectReadMode(stats.totalLines);
      }

      // 全屏程序（vim）在备用屏幕时，普通行缓冲无法准确还原屏幕。
      // 这里在 smart/auto 或显式 raw 模式下回退到原始输出尾部。
      // Fullscreen apps (vim) in alternate screen can't be reconstructed well from line buffer.
      // Fallback to raw output tail for smart/auto or explicit raw mode.
      const shouldUseRaw = selectedMode === 'raw' || ((mode === undefined || mode === 'auto' || mode === 'smart') && session.alternateScreen);
      if (shouldUseRaw) {
        const rawText = session.rawOutput || '';
        const rawTailChars = Math.min(rawText.length, 8000);
        const output = rawTailChars > 0 ? rawText.slice(rawText.length - rawTailChars) : '';
        const totalBytes = Buffer.byteLength(output, 'utf8');
        const estimatedTokens = Math.ceil(output.length / 4);
        const latestEntries = outputBuffer.getLatest(1);
        const nextCursor = latestEntries[0]?.sequence ?? cursorPosition;

        return {
          output,
          totalLines: outputBuffer.getStats().totalLines,
          hasMore: false,
          since: nextCursor,
          cursor: nextCursor,
          truncated: rawText.length > rawTailChars,
          stats: {
            totalBytes,
            estimatedTokens,
            linesShown: output.split('\n').length,
            linesOmitted: 0
          },
          status: {
            ...this.buildReadStatus(session),
            alternateScreen: Boolean(session.alternateScreen)
          }
        };
      }

      if (selectedMode && selectedMode !== 'full') {
        const smartOptions: any = {
          since: cursorPosition,
          mode: selectedMode,
          maxLines
        };
        if (headLines !== undefined) smartOptions.headLines = headLines;
        if (tailLines !== undefined) smartOptions.tailLines = tailLines;

        const result = outputBuffer.readSmart(smartOptions);

        let output = '';
        if (mode === 'head-tail' && result.truncated) {
          const headOutput = result.entries.slice(0, headLines || 50).map(e => e.content).join('\n');
          const tailOutput = result.entries.slice(-(tailLines || 50)).map(e => e.content).join('\n');
          output = headOutput + '\n\n... [省略 ' + result.stats.linesOmitted + ' 行] ...\n\n' + tailOutput;
        } else {
          output = result.entries.map(entry => entry.content).join('\n');
          if (result.truncated) {
            if (mode === 'head') {
              output += '\n\n... [省略后续 ' + result.stats.linesOmitted + ' 行] ...';
            } else if (mode === 'tail') {
              output = '... [省略前面 ' + result.stats.linesOmitted + ' 行] ...\n\n' + output;
            }
          }
        }

        return {
          output,
          totalLines: result.totalLines,
          hasMore: result.hasMore,
          since: result.nextCursor,
          cursor: result.nextCursor,
          truncated: result.truncated,
          stats: result.stats,
          status: {
            ...this.buildReadStatus(session),
            alternateScreen: Boolean(session.alternateScreen)
          }
        };
      }

      // 使用原有的读取方法
      const result = outputBuffer.read({ since: cursorPosition, maxLines });
      const output = result.entries.map(entry => entry.content).join('\n');

      return {
        output,
        totalLines: result.totalLines,
        hasMore: result.hasMore,
        since: result.nextCursor,
        cursor: result.nextCursor,
        status: {
          ...this.buildReadStatus(session),
          alternateScreen: Boolean(session.alternateScreen)
        }
      };
    } catch (error) {
      const terminalError: TerminalError = new Error(`Failed to read from terminal: ${error}`) as TerminalError;
      terminalError.code = 'READ_FAILED';
      terminalError.terminalName = terminalName;
      throw terminalError;
    }
  }

  /**
   * 获取终端统计信息 - 支持终端名称
   * Get terminal statistics - supports terminal names
   */
  async getTerminalStats(terminalName: string): Promise<TerminalStatsResult> {
    // 解析终端名称
    // Resolve terminal name
    const resolvedId = this.resolveTerminalName(terminalName);
    
    const outputBuffer = this.outputBuffers.get(resolvedId);
    const session = this.sessions.get(resolvedId);

    if (!outputBuffer || !session) {
      const error: TerminalError = new Error(`Terminal ${terminalName} not found`) as TerminalError;
      error.code = 'TERMINAL_NOT_FOUND';
      error.terminalName = terminalName;
      throw error;
    }

    const stats = outputBuffer.getStats();
    const allEntries = outputBuffer.read({ since: 0 });
    const totalText = allEntries.entries.map(e => e.content).join('\n');
    const totalBytes = Buffer.byteLength(totalText, 'utf8');
    const estimatedTokens = Math.ceil(totalText.length / 4);

    return {
      terminalName,
      terminalId: resolvedId,
      totalLines: stats.totalLines,
      totalBytes,
      estimatedTokens,
      bufferSize: stats.bufferedLines,
      oldestLine: stats.oldestLine,
      newestLine: stats.newestLine,
      isActive: session.status === 'active'
    };
  }

  /**
   * 获取终端的输出缓冲区 - 内部方法
   * Get terminal's output buffer - internal method
   */
  getOutputBuffer(terminalName: string): OutputBuffer | null {
    // 解析终端名称
    // Resolve terminal name
    const resolvedId = this.resolveTerminalName(terminalName);
    return this.outputBuffers.get(resolvedId) || null;
  }

  /**
   * 检查终端是否正在运行命令 - 支持终端名称
   * Check if terminal is running command - supports terminal names
   * 通过检查最后一次活动时间来判断
   */
  isTerminalBusy(terminalName: string): boolean {
    // 解析终端名称
    // Resolve terminal name
    const resolvedId = this.resolveTerminalName(terminalName);
    const session = this.sessions.get(resolvedId);
    if (!session) {
      return false;
    }

    if (session.pendingCommand) {
      return true;
    }

    // 如果最后活动时间在 100ms 内，认为终端正在忙碌
    const timeSinceLastActivity = Date.now() - session.lastActivity.getTime();
    return timeSinceLastActivity < 100;
  }

  /**
   * 等待终端输出稳定 - 支持终端名称
   * Wait for terminal output to stabilize - supports terminal names
   * 用于确保命令执行完成后再读取输出
   */
  async waitForOutputStable(terminalName: string, timeout: number = 5000, stableTime: number = 500): Promise<void> {
    // 解析终端名称
    // Resolve terminal name
    const resolvedId = this.resolveTerminalName(terminalName);
    const session = this.sessions.get(resolvedId);
    if (!session) {
      throw new Error(`Terminal ${terminalName} not found`);
    }

    const startTime = Date.now();
    let lastActivityTime = session.lastActivity.getTime();

    while (Date.now() - startTime < timeout) {
      const currentActivityTime = session.lastActivity.getTime();

      // 如果输出已经稳定（在 stableTime 内没有新输出）
      if (Date.now() - currentActivityTime > stableTime) {
        return;
      }

      // 如果有新的活动，更新时间
      if (currentActivityTime > lastActivityTime) {
        lastActivityTime = currentActivityTime;
      }

      // 等待一小段时间再检查
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 超时也返回，不抛出错误
  }

  /**
   * 列出所有终端会话
   */
  async listTerminals(): Promise<TerminalListResult> {
    const terminals = Array.from(this.sessions.values()).map(session => {
      // 获取用户提供的终端名称，如果没有则使用内部UUID
      // Get user-provided terminal name, fallback to internal UUID if not available
      const terminalName = this.terminalReverseMap.get(session.id) || session.id;
      
      return {
        id: terminalName, // 使用用户提供的名称而不是内部UUID
        internalId: session.id, // 保留内部UUID供调试使用
        pid: session.pid,
        shell: session.shell,
        cwd: session.cwd,
        created: session.created.toISOString(),
        lastActivity: session.lastActivity.toISOString(),
        status: session.status
      };
    });

    return { terminals };
  }

  /**
   * 终止终端会话 - 支持终端名称
   * Kill terminal session - supports terminal names
   */
  async killTerminal(terminalName: string, signal = 'SIGTERM'): Promise<void> {
    // 解析终端名称
    // Resolve terminal name
    const resolvedId = this.resolveTerminalName(terminalName);
    
    const ptyProcess = this.ptyProcesses.get(resolvedId);
    const session = this.sessions.get(resolvedId);
    const exitPromise = this.exitPromises.get(resolvedId);

    if (!ptyProcess || !session) {
      const error: TerminalError = new Error(`Terminal ${terminalName} not found`) as TerminalError;
      error.code = 'TERMINAL_NOT_FOUND';
      error.terminalName = terminalName;
      throw error;
    }

    try {
      // Windows平台特殊处理
      if (process.platform === 'win32') {
        // 在Windows上，使用kill()而不传递信号参数
        // 这会强制终止进程
        ptyProcess.kill();
      } else {
        // Unix/Linux系统使用信号
        ptyProcess.kill(signal);
      }
      
      session.status = 'terminated';
      session.lastActivity = new Date();
      this.emit('terminalKilled', terminalName, signal);

      await this.waitForPtyExit(resolvedId, ptyProcess, exitPromise);

      const buffer = this.outputBuffers.get(resolvedId);
      if (buffer) {
        buffer.removeAllListeners();
      }

      // 清理资源：从 Map 中删除已终止的终端
      this.ptyProcesses.delete(resolvedId);
      this.outputBuffers.delete(resolvedId);
      this.sessions.delete(resolvedId);
      this.exitPromises.delete(resolvedId);
      this.exitResolvers.delete(resolvedId);
      
      // 清理名称映射
      this.terminalNameMap.delete(terminalName);
      this.terminalReverseMap.delete(resolvedId);
    } catch (error) {
      const terminalError: TerminalError = new Error(`Failed to kill terminal: ${error}`) as TerminalError;
      terminalError.code = 'KILL_FAILED';
      terminalError.terminalName = terminalName;
      throw terminalError;
    }
  }

  /**
   * 获取终端会话信息
   */
  getTerminalInfo(terminalId: string): TerminalSession | undefined {
    return this.sessions.get(terminalId);
  }

  /**
   * 检查终端是否存在且活跃
   */
  isTerminalActive(terminalId: string): boolean {
    const session = this.sessions.get(terminalId);
    return session?.status === 'active';
  }

  /**
   * 调整终端大小
   */
  async resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void> {
    const ptyProcess = this.ptyProcesses.get(terminalId);
    const session = this.sessions.get(terminalId);

    if (!ptyProcess || !session) {
      const error: TerminalError = new Error(`Terminal ${terminalId} not found`) as TerminalError;
      error.code = 'TERMINAL_NOT_FOUND';
      error.terminalName = terminalId;
      throw error;
    }

    try {
      ptyProcess.resize(cols, rows);
      session.lastActivity = new Date();
      this.emit('terminalResized', terminalId, cols, rows);
    } catch (error) {
      const terminalError: TerminalError = new Error(`Failed to resize terminal: ${error}`) as TerminalError;
      terminalError.code = 'RESIZE_FAILED';
      terminalError.terminalName = terminalId;
      throw terminalError;
    }
  }

  /**
   * 清理指定会话
   */
  private cleanupSession(terminalId: string): void {
    const ptyProcess = this.ptyProcesses.get(terminalId);
    const outputBuffer = this.outputBuffers.get(terminalId);

    if (ptyProcess) {
      try {
        ptyProcess.kill();
      } catch (error) {
        // 忽略清理时的错误
      }
      this.ptyProcesses.delete(terminalId);
    }

    if (outputBuffer) {
      outputBuffer.removeAllListeners();
      outputBuffer.clear();
      this.outputBuffers.delete(terminalId);
    }

    this.sessions.delete(terminalId);
    this.exitPromises.delete(terminalId);
    this.exitResolvers.delete(terminalId);
    this.emit('terminalCleaned', terminalId);
  }

  private async waitForPtyExit(terminalId: string, ptyProcess: any, exitPromise?: Promise<void>) {
    if (!exitPromise) {
      return;
    }

    const waitWithTimeout = async (timeoutMs: number): Promise<boolean> => {
      return await Promise.race([
        exitPromise.then(() => true).catch(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs))
      ]);
    };

    const graceTimeout = this.config.sessionTimeout > 0 ? Math.min(2000, this.config.sessionTimeout) : 2000;
    const exitedInGrace = await waitWithTimeout(graceTimeout);
    if (exitedInGrace) {
      return;
    }

    try {
      ptyProcess.kill('SIGKILL');
    } catch {
      // ignore kill escalation errors
    }

    await waitWithTimeout(500);
  }

  /**
   * 清理超时的会话
   */
  private cleanupTimeoutSessions(): void {
    const now = new Date();
    const timeoutThreshold = this.config.sessionTimeout;

    for (const [terminalId, session] of this.sessions.entries()) {
      const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();

      if (session.status === 'terminated' || timeSinceLastActivity > timeoutThreshold) {
        if (process.env.MCP_DEBUG === 'true') {
          process.stderr.write(`[MCP-DEBUG] Cleaning up timeout session: ${terminalId}\n`);
        }
        this.cleanupSession(terminalId);
      }
    }
  }

  /**
   * 获取管理器统计信息
   */
  getStats() {
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.status === 'active').length;
    const totalSessions = this.sessions.size;
    const totalBufferSize = Array.from(this.outputBuffers.values())
      .reduce((total, buffer) => total + buffer.getStats().bufferedLines, 0);

    return {
      activeSessions,
      totalSessions,
      totalBufferSize,
      config: this.config
    };
  }

  /**
   * 关闭管理器，清理所有资源
   */
  async shutdown(): Promise<void> {
    if (process.env.MCP_DEBUG === 'true') {
      process.stderr.write('[MCP-DEBUG] Shutting down terminal manager...\n');
    }

    // 终止所有活跃的终端
    const activeTerminals = Array.from(this.sessions.keys());
    for (const terminalId of activeTerminals) {
      try {
        await this.killTerminal(terminalId, 'SIGTERM');
      } catch (error) {
        if (process.env.MCP_DEBUG === 'true') {
          process.stderr.write(`[MCP-DEBUG] Error killing terminal ${terminalId}: ${error}\n`);
        }
      }
    }

    // 等待一段时间让进程正常退出
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 强制清理所有会话
    for (const terminalId of activeTerminals) {
      this.cleanupSession(terminalId);
    }

    this.emit('shutdown');
    clearInterval(this.cleanupTimer);
    if (process.env.MCP_DEBUG === 'true') {
      process.stderr.write('[MCP-DEBUG] Terminal manager shutdown complete\n');
    }
  }

  private processBufferEntries(session: TerminalSession, entries: OutputBufferEntry[]): void {
    if (!entries || entries.length === 0) {
      return;
    }

    const seen = new Set<number>();
    let promptDetected = false;

    for (const entry of entries) {
      if (!entry || seen.has(entry.sequence)) {
        continue;
      }
      seen.add(entry.sequence);

      const content = entry.content ?? '';
      if (!content) {
        continue;
      }

      if (this.isPromptLine(content)) {
        promptDetected = true;
        session.hasPrompt = true;
        session.lastPromptLine = content;
        session.lastPromptAt = entry.timestamp || new Date();

        if (session.pendingCommand) {
          session.pendingCommand.completedAt = new Date();
          session.lastCommand = {
            command: session.pendingCommand.command,
            startedAt: session.pendingCommand.startedAt,
            completedAt: session.pendingCommand.completedAt
          };
          session.pendingCommand = null;
        }
      }
    }

    if (!promptDetected && entries.length > 0 && session.pendingCommand) {
      session.hasPrompt = false;
    }
  }

  private trackCommand(session: TerminalSession, rawInput: string, executed: boolean): void {
    if (!session || !executed) {
      return;
    }

    const commandText = this.extractCommandText(rawInput);
    if (!commandText) {
      return;
    }

    const commandInfo: CommandRuntimeInfo = {
      command: commandText,
      startedAt: new Date(),
      completedAt: null
    };

    session.pendingCommand = commandInfo;
    session.hasPrompt = false;
  }

  private extractCommandText(rawInput: string): string | null {
    if (!rawInput) {
      return null;
    }

    const normalized = rawInput.replace(/\r/g, '\n').split('\n');
    for (let i = normalized.length - 1; i >= 0; i--) {
      const line = normalized[i];
      if (!line) {
        continue;
      }
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      if (this.isMostlyPrintable(trimmed)) {
        return trimmed.slice(0, 500);
      }
    }

    return null;
  }

  private isMostlyPrintable(value: string): boolean {
    if (!value) {
      return false;
    }

    let printable = 0;
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code === 9 || code === 32 || code >= 33) {
        printable++;
      }
    }

    return printable > 0 && printable / value.length >= 0.6;
  }

  private isPromptLine(line: string): boolean {
    if (!line) {
      return false;
    }

    const trimmedEnd = line.trimEnd();
    if (!trimmedEnd) {
      return false;
    }

    const promptSuffixes = ['$', '#', '%', '>'];

    // Common case: prompt ends with symbol and space
    for (const suffix of promptSuffixes) {
      if (line.endsWith(`${suffix} `)) {
        const prefix = trimmedEnd.slice(0, -1).trim();
        if (prefix.length > 0) {
          return true;
        }
      }
    }

    // Prompts without trailing space
    const lastChar = trimmedEnd.charAt(trimmedEnd.length - 1);
    if (promptSuffixes.includes(lastChar)) {
      const prefix = trimmedEnd.slice(0, -1).trim();
      if (prefix.length > 0 && /[a-zA-Z0-9_@~\/\]\)]$/.test(prefix)) {
        return true;
      }
    }

    return false;
  }

  private buildReadStatus(session: TerminalSession): TerminalReadStatus {
    const pending = session.pendingCommand
      ? {
          command: session.pendingCommand.command,
          startedAt: session.pendingCommand.startedAt.toISOString(),
          completedAt: session.pendingCommand.completedAt ? session.pendingCommand.completedAt.toISOString() : null
        }
      : null;

    const lastCommand = session.lastCommand
      ? {
          command: session.lastCommand.command,
          startedAt: session.lastCommand.startedAt.toISOString(),
          completedAt: session.lastCommand.completedAt ? session.lastCommand.completedAt.toISOString() : null
        }
      : null;

    return {
      isRunning: Boolean(session.pendingCommand),
      hasPrompt: Boolean(session.hasPrompt),
      pendingCommand: pending,
      lastCommand,
      promptLine: session.lastPromptLine ?? null,
      lastActivity: session.lastActivity.toISOString(),
      alternateScreen: Boolean(session.alternateScreen)
    };
  }

  /**
   * 获取终端当前状态（不读取输出）
   * Get current terminal status (without reading output)
   */
  public getTerminalReadStatus(terminalName: string): TerminalReadStatus {
    const resolvedId = this.resolveTerminalName(terminalName);
    const session = this.sessions.get(resolvedId);
    if (!session) {
      const error: TerminalError = new Error(`Terminal ${terminalName} not found`) as TerminalError;
      error.code = 'TERMINAL_NOT_FOUND';
      error.terminalName = terminalName;
      throw error;
    }
    return this.buildReadStatus(session);
  }

  private looksLikeAwaitingInputTail(rawTail: string): boolean {
    if (!rawTail) {
      return false;
    }
    // 若末尾没有换行，且以常见提示符结尾（如 ":" / "?" / "]"），通常表示程序正在等待用户输入
    // If tail doesn't end with newline and ends with common prompt chars (":" / "?" / "]"), it's likely awaiting user input
    if (/[\r\n]$/.test(rawTail)) {
      return false;
    }
    return /[:?\]]\s*$/.test(rawTail);
  }

  /**
   * 判断终端是否处于“等待用户输入”的交互状态（例如 Read-Host / npm init 提示）
   * Detect whether terminal is awaiting user input (e.g., Read-Host / interactive prompts)
   */
  public isTerminalAwaitingInput(terminalName: string): boolean {
    const resolvedId = this.resolveTerminalName(terminalName);
    const session = this.sessions.get(resolvedId);
    if (!session) {
      return false;
    }
    const raw = session.rawOutput || '';
    const tail = raw.length > 200 ? raw.slice(raw.length - 200) : raw;
    return this.looksLikeAwaitingInputTail(tail);
  }

  /**
   * 统一的终端交互方法 - 整合创建、写入和读取功能
   * Unified terminal interaction method - integrates create, write and read functionality
   */
  async interactWithTerminal(options: {
    // 创建选项 - Create options
    terminalName?: string;
    shell?: string;
    cwd?: string;
    env?: Record<string, string>;
    cols?: number;
    rows?: number;
    
    // 写入选项 - Write options
    input?: string;
    appendNewline?: boolean;
    waitForOutput?: boolean;
    outputTimeout?: number;
    stableTime?: number;
    
    // 读取选项 - Read options
    since?: number;
    maxLines?: number;
    mode?: 'full' | 'head' | 'tail' | 'head-tail' | 'auto' | 'smart';
    headLines?: number;
    tailLines?: number;
    stripSpinner?: boolean;
    
    // 操作模式 - Operation mode
    operation?: 'create' | 'write' | 'read' | 'write_and_read' | 'create_and_execute';
  }): Promise<{
    // 创建结果 - Create result
    terminalName?: string;
    terminalId?: string;
    
    // 写入结果 - Write result
    written?: boolean;
    
    // 读取结果 - Read result
    output?: string;
    totalLines?: number;
    hasMore?: boolean;
    since?: number;
    cursor?: number;
    truncated?: boolean;
    stats?: any;
    status?: any;
    
    // 统计信息 - Statistics
    terminalStats?: any;
  }> {
    const {
      // 操作模式，默认为创建并执行
      operation = 'create_and_execute',
      
      // 创建参数
      terminalName,
      shell,
      cwd,
      env,
      cols,
      rows,
      
      // 写入参数
      input,
      appendNewline,
      waitForOutput = true,
      outputTimeout = 5000,
      stableTime = 500,
      
      // 读取参数
      since = 0,
      maxLines = 1000,
      mode = 'smart',
      headLines,
      tailLines,
      stripSpinner = true
    } = options;

    const result: any = {};

    try {
      // 根据操作模式执行相应的操作
      // Execute corresponding operations based on operation mode
      switch (operation) {
        case 'create':
        case 'create_and_execute': {
          // 创建终端 - Create terminal
          const createOptions: any = {};
          if (terminalName) createOptions.terminalName = terminalName;
          if (shell) createOptions.shell = shell;
          if (cwd) createOptions.cwd = cwd;
          if (env) createOptions.env = env;
          if (cols) createOptions.cols = cols;
          if (rows) createOptions.rows = rows;

          const createdTerminalName = await this.createTerminal(createOptions);
          result.terminalName = createdTerminalName;
          result.terminalId = this.terminalNameMap.get(createdTerminalName);
          
          // 如果只是创建终端，直接返回
          // If only creating terminal, return directly
          if (operation === 'create') {
            break;
          }
          
          // 继续执行写入和读取操作
          // Continue with write and read operations
          if (input) {
            // 写入输入 - Write input
            await this.writeToTerminal({
              terminalName: createdTerminalName,
              input,
              ...(appendNewline !== undefined && { appendNewline })
            });
            result.written = true;
            
            // 等待输出稳定 - Wait for output to stabilize
            if (waitForOutput) {
              await this.waitForOutputStable(createdTerminalName, outputTimeout, stableTime);
            }
            
            // 读取输出 - Read output
            const readResult = await this.readFromTerminal({
              terminalName: createdTerminalName,
              since,
              maxLines,
              mode,
              headLines,
              tailLines
            });
            
            // 处理输出结果 - Process output result
            let processedOutput = readResult.output;
            if (stripSpinner && processedOutput) {
              // 移除旋转动画字符 - Remove spinner animation characters
              processedOutput = processedOutput.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g, '');
              // 移除其他常见的动画字符 - Remove other common animation characters
              processedOutput = processedOutput.replace(/[|\/\\-]/g, (match, offset, string) => {
                // 简单的启发式方法：如果这些字符连续出现，可能是动画
                // Simple heuristic: if these characters appear consecutively, it might be animation
                const prevChar = offset > 0 ? string[offset - 1] : '';
                const nextChar = offset < string.length - 1 ? string[offset + 1] : '';
                if (/[|\/\\-]/.test(prevChar) || /[|\/\\-]/.test(nextChar)) {
                  return '';
                }
                return match;
              });
            }
            
            result.output = processedOutput;
            result.totalLines = readResult.totalLines;
            result.hasMore = readResult.hasMore;
            result.since = readResult.since;
            result.cursor = readResult.cursor;
            result.truncated = readResult.truncated;
            result.stats = readResult.stats;
            result.status = readResult.status;
          }
          
          // 获取终端统计信息 - Get terminal statistics
          result.terminalStats = await this.getTerminalStats(createdTerminalName);
          break;
        }
        
        case 'write':
        case 'write_and_read': {
          if (!terminalName) {
            throw new Error('对于写入操作，必须提供 terminalName');
          }
          
          // 写入输入 - Write input
          if (input) {
            await this.writeToTerminal({
              terminalName,
              input,
              ...(appendNewline !== undefined && { appendNewline })
            });
            result.written = true;
            
            // 如果只是写入，直接返回
            // If only writing, return directly
            if (operation === 'write') {
              break;
            }
            
            // 等待输出稳定 - Wait for output to stabilize
            if (waitForOutput) {
              await this.waitForOutputStable(terminalName, outputTimeout, stableTime);
            }
            
            // 读取输出 - Read output
            const readResult = await this.readFromTerminal({
              terminalName,
              since,
              maxLines,
              mode,
              headLines,
              tailLines
            });
            
            // 处理输出结果 - Process output result
            let processedOutput = readResult.output;
            if (stripSpinner && processedOutput) {
              processedOutput = processedOutput.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g, '');
              processedOutput = processedOutput.replace(/[|\/\\-]/g, (match, offset, string) => {
                const prevChar = offset > 0 ? string[offset - 1] : '';
                const nextChar = offset < string.length - 1 ? string[offset + 1] : '';
                if (/[|\/\\-]/.test(prevChar) || /[|\/\\-]/.test(nextChar)) {
                  return '';
                }
                return match;
              });
            }
            
            result.output = processedOutput;
            result.totalLines = readResult.totalLines;
            result.hasMore = readResult.hasMore;
            result.since = readResult.since;
            result.cursor = readResult.cursor;
            result.truncated = readResult.truncated;
            result.stats = readResult.stats;
            result.status = readResult.status;
          }
          
          // 获取终端统计信息 - Get terminal statistics
          result.terminalStats = await this.getTerminalStats(terminalName);
          break;
        }
        
        case 'read': {
          if (!terminalName) {
            throw new Error('对于读取操作，必须提供 terminalName');
          }
          
          // 读取输出 - Read output
          const readResult = await this.readFromTerminal({
            terminalName,
            since,
            maxLines,
            mode,
            headLines,
            tailLines
          });
          
          // 处理输出结果 - Process output result
          let processedOutput = readResult.output;
          if (stripSpinner && processedOutput) {
            processedOutput = processedOutput.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g, '');
            processedOutput = processedOutput.replace(/[|\/\\-]/g, (match, offset, string) => {
              const prevChar = offset > 0 ? string[offset - 1] : '';
              const nextChar = offset < string.length - 1 ? string[offset + 1] : '';
              if (/[|\/\\-]/.test(prevChar) || /[|\/\\-]/.test(nextChar)) {
                return '';
              }
              return match;
            });
          }
          
          result.output = processedOutput;
          result.totalLines = readResult.totalLines;
          result.hasMore = readResult.hasMore;
          result.since = readResult.since;
          result.cursor = readResult.cursor;
          result.truncated = readResult.truncated;
          result.stats = readResult.stats;
          result.status = readResult.status;
          
          // 获取终端统计信息 - Get terminal statistics
          result.terminalStats = await this.getTerminalStats(terminalName);
          break;
        }
        
        default:
          throw new Error(`不支持的操作模式: ${operation}`);
      }
      
      return result;
    } catch (error) {
      const terminalError: TerminalError = new Error(`统一终端交互失败: ${error}`) as TerminalError;
      terminalError.code = 'INTERACT_FAILED';
      terminalError.terminalName = terminalName || 'unknown';
      throw terminalError;
    }
  }
}
