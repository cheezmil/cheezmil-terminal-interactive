# 修复交互式终端回车键问题的提示词

## 问题描述
当终端处于交互式模式（如Claude Code、vim等）时，CTI工具无法正确发送回车键来执行命令或提交消息。具体表现为：

1. 字符可以输入到终端，但回车键无法生效
2. 命令停留在待执行状态，无法提交
3. 无法与交互式AI（如Claude Code）进行有效对话
4. 无法发送连续的按键组合（如双击ESC清空输入框）

## 问题根源分析

根据代码分析，问题主要出现在以下几个方面：

1. **换行符处理问题**：
   - 在`terminal-manager.ts`的`writeToTerminal`方法中，`appendNewline`参数在交互式模式下可能无法正确工作
   - `normalizeNewlines`方法可能不适合交互式应用的换行符需求

2. **交互式状态检测不准确**：
   - `isTerminalAwaitingInput`和`getTerminalReadStatus`方法可能无法准确识别所有交互式状态
   - 导致系统认为终端不需要回车键

3. **特殊操作支持不足**：
   - 目前只支持`ctrl_c`、`ctrl_z`、`ctrl_d`，缺少ESC等常用交互键
   - 无法支持组合键操作（如双击ESC）
   - 请支持输入所有的快捷键和按键！并提示AI可以将这些快捷键一次性输入，并给出每个快捷键或按键输入的间隔时间，然后程序内部自行处理。！！！！！！！！！！！！！！！！！！！！！！！！！！！

## 修复方案

### 1. 增强交互式状态检测
```typescript
// 在 terminal-manager.ts 中增强检测方法
isTerminalInInteractiveMode(terminalName: string): boolean {
  const session = this.sessions.get(this.resolveTerminalName(terminalName));
  if (!session) return false;
  
  // 检查备用屏幕状态
  if (session.alternateScreen) return true;
  
  // 检查原始输出中的交互式程序特征
  if (session.rawOutput) {
    // Claude Code 特征
    if (session.rawOutput.includes('ctrl-g to edit prompt') || 
        session.rawOutput.includes('Claude Code')) {
      return true;
    }
    
    // vim/nano 等编辑器特征
    if (session.rawOutput.includes('-- INSERT --') || 
        session.rawOutput.includes('-- NORMAL --') ||
        session.rawOutput.includes('Nano:')) {
      return true;
    }
  }
  
  return false;
}
```

### 2. 修复回车键发送逻辑
```typescript
// 在 terminal-manager.ts 的 writeToTerminal 方法中
async writeToTerminal(options: TerminalWriteOptions): Promise<void> {
  // ... 现有代码 ...
  
  try {
    // 检测是否为交互式模式
    const isInteractive = this.isTerminalInInteractiveMode(terminalName);
    
    let inputToWrite: string;
    
    if (isInteractive) {
      // 交互式模式下的特殊处理
      if (appendNewline && !input.endsWith('\r')) {
        // 确保发送正确的回车符
        inputToWrite = input + '\r';
      } else {
        inputToWrite = this.normalizeNewlines(input);
      }
    } else {
      // 普通模式的处理
      const hasMultiline = input.includes('\n') || input.includes('\r\n');
      const autoAppend = appendNewline ?? (hasMultiline ? false : this.shouldAutoAppendNewline(input));
      const needsNewline = autoAppend && !input.endsWith('\n') && !input.endsWith('\r');
      const newlineChar = '\r';
      const inputWithAutoNewline = needsNewline ? input + newlineChar : input;
      inputToWrite = this.normalizeNewlines(inputWithAutoNewline);
    }

    // 写入数据到 PTY
    await this.writeInChunks(ptyProcess, inputToWrite);
    
    // ... 现有代码 ...
  }
}
```

### 3. 扩展特殊操作支持
```typescript
// 在 mcp-server.ts 中扩展 specialOperation 枚举
const interactWithTerminalSchema: any = {
  // ... 现有参数 ...
  specialOperation: z.enum(['ctrl_c', 'ctrl_z', 'ctrl_d', 'esc', 'enter', 'double_esc']).optional()
    .describe('Special operation to send to terminal. Added: esc, enter, double_esc'),
};

// 在处理特殊操作的部分添加新的case
if (specialOperation) {
  switch (specialOperation) {
    case 'ctrl_c':
      actualInput = '\u0003';
      break;
    case 'ctrl_z':
      actualInput = '\u001a';
      break;
    case 'ctrl_d':
      actualInput = '\u0004';
      break;
    case 'esc':
      actualInput = '\u001b';
      break;
    case 'enter':
      actualInput = '\r';
      break;
    case 'double_esc':
      actualInput = '\u001b\u001b';
      break;
  }
}
```

### 4. 添加交互式终端专用方法
```typescript
// 在 terminal-manager.ts 中添加新方法
async sendEnterKey(terminalName: string): Promise<void> {
  await this.writeToTerminal({
    terminalName,
    input: '\r',
    appendNewline: false
  });
}

async sendEscapeKey(terminalName: string): Promise<void> {
  await this.writeToTerminal({
    terminalName,
    input: '\u001b',
    appendNewline: false
  });
}

async sendDoubleEscape(terminalName: string): Promise<void> {
  await this.writeToTerminal({
    terminalName,
    input: '\u001b\u001b',
    appendNewline: false
  });
}
```

### 5. 优化MCP工具描述
```typescript
// 更新工具描述，明确说明交互式模式的使用方法
(this.server as any).tool(
  'interact_with_terminal',
  `与指定ID的终端进行交互操作。支持交互式应用（如Claude Code、vim等）。
  
  交互式应用使用提示：
  - 使用 specialOperation: "enter" 来发送回车键
  - 使用 specialOperation: "esc" 来发送ESC键
  - 使用 specialOperation: "double_esc" 来发送双击ESC（清空Claude Code输入框）
  - 对于交互式应用，设置 appendNewline: false 并手动添加 \r 来确保回车生效`,
  // ... 其余代码 ...
);
```

## 测试用例

1. **Claude Code交互测试**：
   - 启动Claude Code
   - 发送消息并使用`specialOperation: "enter"`提交
   - 使用`specialOperation: "double_esc"`清空输入框
   - 验证对话是否正常进行

2. **vim编辑器测试**：
   - 启动vim
   - 使用`specialOperation: "esc"`切换模式
   - 验证编辑操作是否正常

3. **普通命令测试**：
   - 确保修复不影响普通命令的执行
   - 验证自动换行功能仍然正常工作

## 实现优先级

1. **高优先级**：修复回车键发送逻辑，确保基本交互功能
2. **中优先级**：扩展特殊操作支持，添加ESC等常用键
3. **低优先级**：优化交互式状态检测，提高准确性

这个修复方案将确保CTI工具能够与交互式终端应用正常工作，特别是与Claude Code等AI终端应用的交互。