# Cheestard Terminal Interactive MCP Server

##### This tool enables AI to control multiple terminals and interact through MCP (Model Context Protocol), solving the problem of AI programming tools getting stuck in terminals and not proceeding to the next step. It implements persistent terminal session management - even after the AI conversation is closed, terminal commands continue running. Recommended for Claude Code, Codex, Cursor, Cline, Roocode, Kilocode users, effectively reducing the probability of getting stuck and improving the success rate of automated task execution.

[中文文档](README.md)

As of 2025-11-03, comparison of terminal interaction features in mainstream AI programming tools (please correct me if there are errors 🥲):

| Feature | Cheestard Terminal Interactive | Claude Code | Codex | Cursor | Cline | Roocode | Kilocode | Gemini CLI | Qwen Code | iFlow CLI | Open Code | windsurf | warp | Augment |
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

## ⚙️ MCP Client Configuration

> ⚠️ Due to `node-pty`, Windows users currently need to use Node.js version 20 or lower. Recommended to use `fnm use 20` https://github.com/Schniz/fnm

> Before configuring MCP clients, it's best to add a rule to your AI programming tool
```plaintext
Always use cheestard-terminal-interactive MCP terminal, prohibit using system prompt's built-in tool functions to execute commands.
```

### 🚀 Streamable HTTP Transport

Better than stdio, state will not be lost.

#### Client Configuration

**All MCP clients that support Streamable HTTP can use the following configuration, different MCP clients have different configurations**

- **Cline / Roocode / Kilocode**:
```json
    "cheestard-terminal-interactive": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **Cursor**:
```json
    "cheestard-terminal-interactive": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **Claude Code**:
```json
    "cheestard-terminal-interactive": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **Gemini CLI**:
```json
    "cheestard-terminal-interactive": {
      "type": "http",
      "url": "http://localhost:1106/mcp"
    }
```

- **Windsurf**:
```json
    "cheestard-terminal-interactive": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **Qwen Code**:
```json
    "cheestard-terminal-interactive": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **iFlow CLI**:
```json
    "cheestard-terminal-interactive": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **Open Code**:
```json
    "cheestard-terminal-interactive": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **warp**:
```json
    "cheestard-terminal-interactive": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

- **Augment**:
```json
    "cheestard-terminal-interactive": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    }
```

## 🌐 Web Management Interface

### Configuration
Add to .env file:
```plaintext
# Frontend port
FRONTEND_PORT=1107
```

### Usage
```bash
# Install dependencies
node start_install.mjs
```
```bash
node start_fe_cheestard-terminal-interactive.mjs
```

## 🚀 Script Usage Guide

This project provides a set of scripts for easy installation, building, and running of the frontend and backend components.

### Script Usage Order

1. **Installation** (First time setup)
   ```bash
   node start_install.mjs
   ```

2. **Building** (Required after code changes)
   ```bash
   # Build backend
   node start_build_be.mjs
   
   # Build frontend
   node start_build_fe.mjs
   ```

3. **Running** (Choose one based on your needs)
   ```bash
   # Development mode (with hot reload)
   node start_be_dev_cheestard-terminal-interactive.mjs  # Backend dev
   node start_fe_dev_cheestard-terminal-interactive.mjs  # Frontend dev
   
   # Production mode (using built files)
   node start_be_cheestard-terminal-interactive.mjs      # Backend
   node start_fe_cheestard-terminal-interactive.mjs      # Frontend
   ```

### Script Descriptions

| Script | Purpose |
|--------|---------|
| `start_install.mjs` | Install project dependencies |
| `start_build_be.mjs` | Build backend TypeScript code |
| `start_build_fe.mjs` | Build frontend Vue.js code |
| `start_be_dev_cheestard-terminal-interactive.mjs` | Run backend in development mode |
| `start_fe_dev_cheestard-terminal-interactive.mjs` | Run frontend in development mode |
| `start_be_cheestard-terminal-interactive.mjs` | Run backend in production mode |
| `start_fe_cheestard-terminal-interactive.mjs` | Run frontend in production mode |

### Notes

- All scripts automatically handle process termination and port conflicts
- Environment variables are loaded from `.env` file
- Development mode provides hot reload for faster development
- Production mode uses optimized built files for better performance

## 🌐 Open Web Management Interface

Tell the AI:
```
Please call the open_terminal_ui tool
```

## Environment Variable Description
| Variable | Description | Default Value |
|----------|-------------|---------------|
| `MCP_PORT` | MCP Streamable HTTP server port | 1106 |
| `FRONTEND_PORT` | Frontend port | 1107 |
| `MAX_BUFFER_SIZE` | Maximum buffer lines | 10000 |
| `SESSION_TIMEOUT` | Session timeout (milliseconds) | 86400000 (24 hours) |
| `COMPACT_ANIMATIONS` | Enable spinner compression | true |
| `ANIMATION_THROTTLE_MS` | Animation throttle time (milliseconds) | 100 |
| `MCP_DEBUG` | Enable debug logging | false |