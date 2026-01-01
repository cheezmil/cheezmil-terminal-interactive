# Cheezmil Terminal Interactive MCP Server

[中文README](README.md)

#### This tool enables AI to control multiple terminals and interact through MCP (Model Context Protocol), solving the problem of AI programming tools getting stuck in terminals and not proceeding to the next step. It implements persistent terminal session management - even after the AI conversation is closed, terminal commands continue running. Recommended for Claude Code, Codex, Cursor, Cline, Roocode, Kilocode users, effectively reducing the probability of getting stuck and improving the success rate of automated task execution.


As of 2025-11-03, comparison of terminal interaction features in mainstream AI programming tools (please correct me if there are errors 🥲):

| Feature | Cheezmil Terminal Interactive | Claude Code | Codex | Cursor | Cline | Roocode | Kilocode | Gemini CLI | Qwen Code | iFlow CLI | Open Code | windsurf | Warp | Augment |
|---------|-------------------------------|-------------|-------|--------|-------|---------|----------|-------------|-----------|-----------|-----------|----------|------|---------|
| Input ctrl+c | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Input enter | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| No frequent freezing | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Create multiple terminals in one API request | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View multiple terminal outputs simultaneously | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Close old terminals | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Search strings from terminal | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Input y or n | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Directly input Linux commands in WSL | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Interact with another command-line AI | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| SSH terminal | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Continue using previous terminals after new conversation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Execute specified scripts before and after command execution | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Execute certain fixed commands before and after command execution | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Attach additional prompts to certain commands to inform AI of correct practices | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Use regular expressions to filter terminal output to save context | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## ✨ Core Features

### 🔥 Persistent Terminal Sessions
- **Long-running**: Create, reuse, and manage long-running Shell sessions
- **Resume after disconnection**: Terminal continues running after client disconnects, can continue operating after reconnection
- **Multi-session management**: Manage multiple independent terminal sessions simultaneously

### 🧠 Intelligent Output Management
- **Circular buffer**: Configurable size (default 10,000 lines), automatic memory management
- **Multiple read modes**:
  - `full`: Complete output
  - `head`: Read only the first N lines
  - `tail`: Read only the last N lines
  - `head-tail`: Read both beginning and end simultaneously
- **Incremental reading**: Use `since` parameter to read only new content
- **Token estimation**: Automatically estimate token count of output for AI context control

### 🎨 Spinner Animation Compression
- **Automatic detection**: Recognize common progress animation characters (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏, ◐◓◑◒, etc.)
- **Intelligent throttling**: Reduce noise output from commands like `npm install`, `yarn`, `pnpm`
- **Preserve key information**: Compress animations while retaining real logs
- **Flexible configuration**: Can be controlled via environment variables or parameters

### 🌐 Web Visual Management Interface
- **Real-time terminal**: Based on xterm.js terminal rendering, supports full ANSI colors
- **WebSocket push**: Real-time terminal output display, no refresh needed
- **Interactive operations**: Send commands and view output directly in browser
- **Multi-instance support**: Automatic port allocation, supports multiple AI clients using simultaneously

### 🛡️ Stability Guarantees
- **Output stability detection**: `wait_for_output` tool ensures complete output retrieval
- **Interactive application support**: Supports vim, npm create and other interactive programs
- **ANSI escape sequences**: Correctly handles terminal control characters

## Usage Methods
### Run Backend Server
⚠️ Due to `node-pty`, Windows users currently need to use Node.js version 20 or lower to work properly. For convenience, I have set all installation, compilation, and running scripts to use 20.19.5. Please make sure to install fnm: https://github.com/Schniz/fnm, otherwise it cannot be used, unless you use the same Node.js for every project, which is unlikely.
```bash
git clone https://github.com/cheezmil/cheezmil-terminal-interactive.git
```
```bash
# Install dependencies
node start_install.mjs
```
```bash
# Run backend
node start_be_cheezmil-terminal-interactive.mjs
```

### ⚙️ MCP Client Configuration

#### Before configuring MCP clients, it's best to add a rule to your AI programming tool
```plaintext
Always use cheezmil-terminal-interactive MCP terminal, prohibit using system prompt's built-in tool functions to execute commands.
```

#### All MCP clients that support Streamable HTTP can be used, different MCP clients will have slightly different configurations, please check the corresponding client's official documentation, here are simple examples

- **Cline / Roocode / Kilocode**:
```json
    "CTI": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
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

**Command Line Addition Method:**
In addition to the configuration file method, Claude Code also supports quickly adding MCP servers using the command line:

```bash
# Add CTI server
claude mcp add CTI --scope user --type streamable-http --url http://localhost:1106/mcp

# List configured MCP servers
claude mcp list

# Remove MCP server
claude mcp remove CTI
```

**Command Line Parameter Description:**
- `--scope user`: Set configuration scope to user level
- `--type streamable-http`: Specify transport type as streamable-http
- `--url http://localhost:1106/mcp`: Specify server address

For complex configurations, it's recommended to directly edit the configuration file:
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


### 🌐 Web Management Interface Usage
```bash
node start_fe_cheezmil-terminal-interactive.mjs
```

## Copy .env.example to .env in the root directory, you can set parameters to your liking
| Variable | Description | Default Value |
|----------|-------------|---------------|
| `MCP_PORT` | MCP Streamable HTTP server backend port | 1106 |
| `FRONTEND_PORT` | Frontend port | 1107 |
| `MAX_BUFFER_SIZE` | Maximum buffer lines | 10000 |
| `SESSION_TIMEOUT` | Session timeout (milliseconds) | 86400000 (24 hours) |
| `COMPACT_ANIMATIONS` | Enable spinner compression | true |
| `ANIMATION_THROTTLE_MS` | Animation throttle time (milliseconds) | 100 |
| `MCP_DEBUG` | Enable debug logging | false |