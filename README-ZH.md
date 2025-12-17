# Cheestard Terminal Interactive MCP Server

[Chinese README](README-ZH.md)

#### 本工具能让AI控制多个终端，并通过 MCP（模型上下文协议）进行交互，解决一些AI编程工具的终端卡住不再继续下一步的问题，实现持久化终端会话管理，即使AI编程工具不小心关闭，终端也会保持继续运行，提升自动化任务进行的成功概率。


## 有什么理由使用本项目
- 目前各种主流AI编程工具，执行某些命令比如`npm run dev`会堵塞终端，这时候AI迟迟得不到消息，有些AI编程工具会硬编码一个2分钟超时，就算超时后看不到终端的任何信息，有些超时能看到消息，甚至有些AI编程工具直接完全卡住。这个项目能节省卡住的时间。
- 如果你在同时使用不同的AI编程工具，本项目可以让不同AI查看正在运行的终端。
- 你可能会让一个codex控制其他的claude code。
- 你可能会说，我直接将终端所有内容输出到一个文件让AI读取嘛，但是这样会多消耗一次API请求。此外，AI也不知道何种命令需要输出成一个文件，文件在哪里，这些都需要你手动写清楚提示词告诉AI否则照样会堵塞，这有点麻烦。
- 某些情况下，你可能需要重启codex cli或claude code以生效一些设置，这时候你不希望丢失正在运行的终端任务。

## 使用方法
### 运行后端
> ⚠️ 由于 `node-pty` 的缘故，Windows 用户目前需要使用不大于 Node.js 20 的版本才能正常使用，所以为了方便使用我将安装编译运行脚本都使用了20.19.5，请务必安装好`https://github.com/Schniz/fnm`，否则将无法使用，除非你每个项目都使用同一个nodejs不过这是不太可能的因为本文档列举的某个AI编程工具或比较热门的MCP工具用到了nodejs22+。

先fork本项目，方便您提交PR贡献，然后再
```bash
git clone https://github.com/<你的github用户名>/cheestard-terminal-interactive.git
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
务必使用CTI这个MCP终端工具执行命令，禁止用系统提示词自带的工具函数执行命令。
```
> 说明：若CTI没有启动，AI会聪明地自动使用原来的AI编程工具自带的工具函数执行命令。若你一直不告诉它有CTI这个工具，AI它很可能一直都不用CTI。

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
      "type": "http",
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

| 功能 | Cheestard Terminal Interactive | Claude Code | Codex | Antigravity | Cursor | Cline | Roocode | Kilocode | Gemini CLI | Qwen Code | iFlow CLI | Open Code | windsurf | Warp | Augment | Goose | Crush |
|------|-------------------------------|-------------|-------|-------------|--------|-------|---------|----------|-------------|-----------|-----------|-----------|----------|------|---------|-------|-------|
| 输入ctrl+c | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| 输入回车 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| 没有经常卡住不工作 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| 一次API请求创建多个终端 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 同时查看多个终端输出 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 关闭旧的终端 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 从终端搜索字符串 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 输入y或n | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| 直接在WSL输入Linux命令 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 和另一个命令行AI交互 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| SSH终端 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| 新建对话后可继续使用之前的终端 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 在执行命令前后执行指定脚本 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 在执行命令前后执行某些固定命令 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 执行某些命令附加额外提示词告知AI正确的做法 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 使用正则表达式过滤终端输出从而节省上下文 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |


## TODO
- [ ] 美化终端
- [ ] 新增认证功能，避免任何人都能访问。
- [x] 新增命令黑名单，即使接收到某些命令，也绝不会执行。