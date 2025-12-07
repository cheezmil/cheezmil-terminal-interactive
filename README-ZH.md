# Cheestard Terminal Interactive MCP Server

[Chinese README](README-ZH.md)

#### 本工具能让AI控制多个终端，并通过 MCP（模型上下文协议）进行交互，解决一些AI编程工具的终端卡住不再继续下一步的问题，实现持久化终端会话管理，即使与AI的对话关闭，终端命令也会继续运行。推荐Claude Code、Codex、Cursor、Cline、Roocode、Kilocode用户使用，能够有效减少不卡住的概率，提升自动化任务进行的成功概率。目前各种主流AI编程工具，执行某些命令会堵塞终端，也就是那些需要对着终端按终止快捷键才能继续，这时候AI迟迟得不到消息，有些AI编程工具会硬编码一个2分钟超时，超时后看不到终端的任何信息，有些超时能看到消息，甚至有些AI编程工具直接完全卡住。这个项目能节省卡住的时间。如果你在同时使用不同的AI编程工具，本项目可以让不同AI查看正在运行的持久化终端。


## 使用方法
### 运行后端
⚠️ 由于 `node-pty` 的缘故，Windows 用户目前需要使用不大于 Node.js 20 的版本才能正常使用，所以为了方便使用我将安装编译运行脚本都使用了20.19.5，请务必安装好fnm：https://github.com/Schniz/fnm
否则将无法使用，除非你每个项目都使用同一个nodejs不过这是不太可能的因为本文档列举的某个AI编程工具或比较热门的MCP工具用到了nodejs22+。
```bash
git clone https://github.com/cheestard/cheestard-terminal-interactive.git
```
```bash
# 安装依赖
node start_install.mjs
```
```bash
# 运行后端
node start_be_cheestard-terminal-interactive.mjs
```


### ⚙️ MCP 客户端配置
#### 在配置MCP客户端之前，最好对你的AI编程工具加一条规则：
```plaintext
务必使用CTI这个MCP终端工具，禁止用系统提示词自带的工具函数执行命令。
```

#### 所有支持 Streamable HTTP 的 MCP 客户端都可用，不同MCP客户端的配置会略有不同，注意查询对应客户端的官方文档，这里给出简单的示例

- **Cline / Roocode / Kilocode**:
```json
    "CTI": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **Codex**:
```toml
[mcp_servers.CTI]
url = "http://localhost:1106/mcp"
```

- **Cursor**:
```json
    "CTI": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **Claude Code**:
```json
    "CTI": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

**命令行添加方法：**
除了配置文件方式外，Claude Code 还支持使用命令行快速添加 MCP 服务器：

```bash
# 添加 cheestard-terminal-interactive 服务器
claude mcp add cheestard-terminal-interactive --scope user --type streamable-http --url http://localhost:1106/mcp

# 列出已配置的 MCP 服务器
claude mcp list

# 移除 MCP 服务器
claude mcp remove cheestard-terminal-interactive
```

**命令行参数说明：**
- `--scope user`: 设置配置范围为用户级别
- `--type streamable-http`: 指定传输类型为 streamable-http
- `--url http://localhost:1106/mcp`: 指定服务器地址

对于复杂的配置，建议直接编辑配置文件：
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

- **Gemini CLI**:
```json
    "CTI": {
      "type": "http",
      "url": "http://localhost:1106/mcp"
    }
```

- **Windsurf**:
```json
    "CTI": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **Qwen Code**:
```json
    "CTI": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **iFlow CLI**:
```json
    "CTI": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **Open Code**:
```json
    "CTI": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **Warp**:
```json
    "CTI": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **Augment**:
```json
    "CTI": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

### 🌐 Web 管理界面使用方式
```bash
node start_fe_cheestard-terminal-interactive.mjs
```

## 免责声明
- 由于不同AI模型对危险命令的判断智商不同，提示词引导不同，AI有时候会无法判断某些命令是否危险，比如一些递归删除文件命令，请手动执行一些较为危险的命令，或明确指出危险命令让我自己来。不管通过本项目执行什么命令，产生的不良后果需要您自负。
- 不要让互联网能直接访问部署在你电脑上的本项目，否则产生的不良后果需要您自负。


## 截至2025-11-03，主流AI编程工具终端交互功能对比（如有错误，请告诉我修正🥲）：

| 功能 | Cheestard Terminal Interactive | Claude Code | Codex | Cursor | Cline | Roocode | Kilocode | Gemini CLI | Qwen Code | iFlow CLI | Open Code | windsurf | Warp | Augment |
|------|-------------------------------|-------------|-------|--------|-------|---------|----------|-------------|-----------|-----------|-----------|----------|------|---------|
| 输入ctrl+c | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 输入回车 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 没有经常卡住不工作 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 一次API请求创建多个终端 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 同时查看多个终端输出 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 关闭旧的终端 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 从终端搜索字符串 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 输入y或n | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 直接在WSL输入Linux命令 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 和另一个命令行AI交互 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| SSH终端 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 新建对话后可继续使用之前的终端 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 在执行命令前后执行指定脚本 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 在执行命令前后执行某些固定命令 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 执行某些命令附加额外提示词告知AI正确的做法 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 使用正则表达式过滤终端输出从而节省上下文 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |


## ✨ 核心特性

### 🔥 持久化终端会话
- **长期运行**：创建、复用、管理长期运行的 Shell 会话
- **断线续传**：客户端断开后终端继续运行，重连后可继续操作
- **多会话管理**：同时管理多个独立的终端会话

### 🧠 智能输出管理
- **循环缓冲区**：可配置大小（默认 10,000 行），自动管理内存
- **多种读取模式**：
  - `full`：完整输出
  - `head`：只读取开头 N 行
  - `tail`：只读取末尾 N 行
  - `head-tail`：同时读取开头和末尾
- **增量读取**：使用 `since` 参数只读取新增内容
- **Token 估算**：自动估算输出的 token 数量，方便 AI 控制上下文

### 🎨 Spinner 动画压缩
- **自动检测**：识别常见的进度动画字符（⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏, ◐◓◑◒ 等）
- **智能节流**：减少 `npm install`、`yarn`、`pnpm` 等命令的噪音输出
- **保留关键信息**：压缩动画的同时保留真实日志
- **灵活配置**：可通过环境变量或参数控制开关

### 🌐 Web 可视化管理界面
- **实时终端**：基于 xterm.js 的终端渲染，支持完整 ANSI 颜色
- **WebSocket 推送**：终端输出实时显示，无需刷新
- **交互操作**：直接在浏览器中发送命令、查看输出
- **多实例支持**：自动端口分配，支持多个 AI 客户端同时使用

### 🛡️ 稳定性保障
- **输出稳定检测**：`wait_for_output` 工具确保获取完整输出
- **交互式应用支持**：支持 vim、npm create 等交互式程序
- **ANSI 转义序列**：正确处理终端控制字符


## TODO
- [] 新增认证功能，避免任何人都能访问。
- [] 新增命令黑名单，即使接收到某些命令，也绝不会执行。