/**
 * 终端会话相关的类型定义
 */

export interface TerminalSession {
  id: string;
  pid: number;
  shell: string;
  cwd: string;
  // 待应用的工作目录：用于“无输出污染”地更新 cwd，真正执行前再注入 cd/Set-Location
  // Pending working directory: update cwd without polluting output, apply via cd/Set-Location right before execution
  pendingCwd?: string | null;
  env: Record<string, string>;
  // 终端尺寸（列/行）
  // Terminal size (cols/rows)
  cols?: number;
  rows?: number;
  created: Date;
  lastActivity: Date;
  status: 'active' | 'inactive' | 'terminated';
  pendingCommand?: CommandRuntimeInfo | null;
  lastCommand?: CommandRuntimeInfo | null;
  lastPromptLine?: string | null;
  lastPromptAt?: Date | null;
  hasPrompt?: boolean;
  // 是否处于备用屏幕（vim/top 等全屏程序会启用）
  // Whether we are in alternate screen (fullscreen apps like vim/top enable it)
  alternateScreen?: boolean;
  // 原始输出环形缓冲（用于全屏程序时回退）
  // Raw output ring buffer (fallback for fullscreen apps)
  rawOutput?: string;
}

export interface CommandRuntimeInfo {
  command: string;
  startedAt: Date;
  completedAt?: Date | null;
}

export interface TerminalCreateOptions {
  shell?: string | undefined;
  cwd?: string | undefined;
  env?: Record<string, string> | undefined;
  cols?: number | undefined;
  rows?: number | undefined;
  terminalName?: string | undefined;
}

export interface TerminalWriteOptions {
  terminalName: string;
  input: string;
  appendNewline?: boolean;
}

export interface TerminalReadOptions {
  terminalName: string;
  since?: number | undefined;
  maxLines?: number | undefined;
  mode?: 'full' | 'head-tail' | 'head' | 'tail' | 'raw' | undefined;
  headLines?: number | undefined;
  tailLines?: number | undefined;
  stripSpinner?: boolean | undefined;
  direction?: 'forward' | 'backward' | undefined;
}

export interface TerminalReadResult {
  output: string;
  totalLines: number;
  hasMore: boolean;
  since: number;
  cursor?: number;
  truncated?: boolean;
  stats?: {
    totalBytes: number;
    estimatedTokens: number;
    linesShown: number;
    linesOmitted: number;
  };
  status?: TerminalReadStatus;
}

export interface TerminalReadStatus {
  isRunning: boolean;
  hasPrompt: boolean;
  pendingCommand: CommandSummary | null;
  lastCommand: CommandSummary | null;
  promptLine: string | null;
  lastActivity: string;
  // 是否检测到备用屏幕模式（vim 等）
  // Whether alternate screen mode is detected (vim etc.)
  alternateScreen?: boolean;
}

export interface CommandSummary {
  command: string;
  startedAt: string;
  completedAt?: string | null;
}

export interface TerminalListResult {
  terminals: Array<{
    id: string;          // 用户提供的终端名称或UUID
    internalId: string;  // 内部UUID，用于调试
    pid: number;
    shell: string;
    cwd: string;
    created: string;
    lastActivity: string;
    status: string;
  }>;
}

export interface OutputBufferEntry {
  timestamp: Date;
  content: string;
  lineNumber: number;
  sequence: number;
}

export interface BufferReadOptions {
  since?: number | undefined;
  maxLines?: number | undefined;
  // 读取方向：forward=从旧到新分页；backward=始终取最新（默认行为）/
  // Read direction: forward=page from old to new; backward=always take latest (default behavior)
  direction?: 'forward' | 'backward' | undefined;
}

export interface BufferReadResult {
  entries: OutputBufferEntry[];
  totalLines: number;
  hasMore: boolean;
  nextCursor: number;
}

export interface TerminalManagerConfig {
  maxBufferSize?: number;
  sessionTimeout?: number;
  defaultShell?: string;
  defaultCols?: number;
  defaultRows?: number;
  compactAnimations?: boolean;
  animationThrottleMs?: number;
}

export interface TerminalError extends Error {
  code: string;
  terminalName?: string;
}

// MCP 相关类型
export interface CreateTerminalInput {
  shell?: string | undefined;
  cwd?: string | undefined;
  env?: Record<string, string> | undefined;
  terminalName?: string | undefined;
}

export interface CreateTerminalResult {
  terminalName: string;
  terminalId: string;
  status: string;
  pid: number;
  shell: string;
  cwd: string;
}

export interface WriteTerminalInput {
  terminalName: string;
  input: string;
  appendNewline?: boolean;
}

export interface WriteTerminalResult {
  success: boolean;
  message?: string;
}

export interface ReadTerminalInput {
  terminalName: string;
  since?: number;
  maxLines?: number;
  mode?: 'full' | 'head-tail' | 'head' | 'tail';
  headLines?: number;
  tailLines?: number;
  stripSpinner?: boolean;
  direction?: 'forward' | 'backward';
}

export interface TerminalStatsInput {
  terminalName: string;
}

export interface TerminalStatsResult {
  terminalName: string;
  terminalId: string;
  totalLines: number;
  totalBytes: number;
  estimatedTokens: number;
  bufferSize: number;
  oldestLine: number;
  newestLine: number;
  isActive: boolean;
}
export interface ListTerminalsResult {
  terminals: Array<{
    id: string;          // 用户提供的终端名称或UUID
    internalId: string;  // 内部UUID，用于调试
    pid: number;
    shell: string;
    cwd: string;
    created: string;
    lastActivity: string;
    status: string;
  }>;
}

export interface KillTerminalInput {
  terminalName: string;
  signal?: string;
}

export interface KillTerminalResult {
  success: boolean;
  message?: string;
}

// Web UI 相关类型
export interface WebUIStartOptions {
  port?: number;
  autoOpen?: boolean;
  terminalManager: any; // TerminalManager 类型
}

export interface WebUIStartResult {
  url: string;
  port: number;
  mode: 'new' | 'existing';
  autoOpened: boolean;
}

// Codex Bug Fix 相关类型
export interface FixBugWithCodexInput {
  description: string;    // Bug 详细描述（必填）
  cwd?: string;          // 工作目录（可选）
  timeout?: number;      // 超时时间（可选，默认 600000ms = 10分钟）
}

export interface FixBugWithCodexResult {
  terminalId: string;           // 执行 Codex 的终端 ID
  reportPath: string | null;    // 报告文件路径
  reportExists: boolean;        // 报告是否成功生成
  workingDir: string;           // 工作目录
  executionTime: number;        // 执行时间（毫秒）
  timedOut: boolean;            // 是否超时
  output: string;               // Codex 终端输出
  reportPreview: string | null; // 报告预览（前 500 字符）
}

// Unified terminal interaction interface
export interface InteractWithTerminalInput {
  action: 'create' | 'execute' | 'write' | 'read' | 'list' | 'kill' | 'stats';
  terminalName?: string;  // Terminal name for identification
  command?: string;
  cwd?: string;
  shell?: string;
  env?: Record<string, string>;
  input?: string;
  readOptions?: {
    mode?: 'full' | 'head' | 'tail' | 'head-tail';
    maxLines?: number;
    since?: number;
    headLines?: number;
    tailLines?: number;
    stripSpinner?: boolean;
  };
  // Deprecated: use wait.maxWaitMs via MCP tool arguments instead
  // 已废弃：请在 MCP 工具参数里使用 wait.maxWaitMs
  waitForOutput?: number;  // Wait time in seconds for command output (deprecated)
  signal?: string;  // For kill action
}

export interface InteractWithTerminalResult {
  success: boolean;
  message?: string;
  // For create action
  terminalName?: string;
  terminalId?: string;
  pid?: number;
  shell?: string;
  cwd?: string;
  status?: string;
  // For read action
  output?: string;
  totalLines?: number;
  hasMore?: boolean;
  truncated?: boolean;
  stats?: {
    totalBytes: number;
    estimatedTokens: number;
    linesShown: number;
    linesOmitted: number;
  };
  // For list action
  terminals?: Array<{
    id: string;
    name?: string;
    pid: number;
    shell: string;
    cwd: string;
    created: string;
    lastActivity: string;
    status: string;
  }>;
  // For stats action
  totalBytes?: number;
  estimatedTokens?: number;
  bufferSize?: number;
  isActive?: boolean;
}
