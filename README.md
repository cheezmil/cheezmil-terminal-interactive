# Cheestard Terminal Interactive MCP Server

[Chinese README](README-ZH.md)

#### This tool enables AI to control multiple terminals and interact through MCP (Model Context Protocol), solving the problem of AI programming tools getting stuck and unable to proceed to the next step. It implements persistent terminal session management, allowing terminal commands to continue running even when the AI conversation is closed. Recommended for Claude Code, Codex, Cursor, Cline, Roocode, and Kilocode users, as it effectively reduces the likelihood of getting stuck and improves the success rate of automated tasks. Currently, various mainstream AI programming tools may block terminals when executing certain commands, requiring manual termination via keyboard shortcuts. During this time, the AI receives no feedback, with some tools hardcoding a 2-minute timeout after which no terminal information is visible, while others may show messages after timeout, and some AI programming tools get completely stuck. This project saves time wasted on such blocking issues. If you're using different AI programming tools simultaneously, this project allows different AIs to view running persistent terminals.

## Usage
### Running the Backend
⚠️ Due to `node-pty`, Windows users currently need to use Node.js version not greater than 20 to function properly. For convenience, I've set all installation, compilation, and execution scripts to use 20.19.5. Please ensure you have fnm installed: https://github.com/Schniz/fnm
Otherwise, it won't work unless you use the same nodejs for every project, which is unlikely since some AI programming tools or popular MCP tools listed in this document use nodejs 22+.
```bash
git clone https://github.com/cheestard/cheestard-terminal-interactive.git
```
```bash
# Install dependencies
node start_install.mjs
```
```bash
# Run backend
node start_be_cheestard-terminal-interactive.mjs
```

### ⚙️ MCP Client Configuration
#### Before configuring the MCP client, it's best to add a rule for your AI programming tool:
```plaintext
Must use the CTI MCP terminal tool,禁止 using system prompt built-in tool functions to execute commands.
```

#### All MCP clients supporting Streamable HTTP can be used. Configuration varies slightly between different MCP clients, so check the official documentation for your specific client. Here are simple examples:

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

**Command line addition method:**
In addition to configuration file method, Claude Code also supports quickly adding MCP servers via command line:

```bash
# Add cheestard-terminal-interactive server
claude mcp add cheestard-terminal-interactive --scope user --type streamable-http --url http://localhost:1106/mcp

# List configured MCP servers
claude mcp list

# Remove MCP server
claude mcp remove cheestard-terminal-interactive
```

**Command line parameter explanation:**
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
node start_fe_cheestard-terminal-interactive.mjs
```

## Disclaimer
- Since different AI models have varying intelligence in judging dangerous commands and different prompt guidance, AI sometimes cannot determine whether certain commands are dangerous, such as recursive file deletion commands. Please manually execute relatively dangerous commands, or explicitly indicate dangerous commands for me to handle myself. Regardless of what commands are executed through this project, you are responsible for any adverse consequences.
- Do not allow direct internet access to this project deployed on your computer, otherwise you are responsible for any adverse consequences.

## As of 2025-11-03, comparison of terminal interaction features among mainstream AI programming tools (if there are errors, please tell me to correct them🥲):

| Feature | Cheestard Terminal Interactive | Claude Code | Codex | Cursor | Cline | Roocode | Kilocode | Gemini CLI | Qwen Code | iFlow CLI | Open Code | windsurf | Warp | Augment |
|------|-------------------------------|-------------|-------|--------|-------|---------|----------|-------------|-----------|-----------|-----------|----------|------|---------|
| Input ctrl+c | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Input enter | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Not frequently getting stuck | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Create multiple terminals in one API request | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View multiple terminal outputs simultaneously | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Close old terminals | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Search strings from terminal | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Input y or n | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Directly input Linux commands in WSL | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Interact with another command-line AI | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| SSH terminal | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Continue using previous terminals after creating new conversation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Execute specified scripts before and after running commands | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Execute certain fixed commands before and after running commands | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Execute certain commands with additional prompts to inform AI of correct practices | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Use regular expressions to filter terminal output thus saving context | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## ✨ Core Features

### 🔥 Persistent Terminal Sessions
- **Long-running**: Create, reuse, and manage long-running Shell sessions
- **Resume after disconnection**: Terminals continue running after client disconnects, allowing continuation upon reconnection
- **Multi-session management**: Simultaneously manage multiple independent terminal sessions

### 🧠 Intelligent Output Management
- **Circular buffer**: Configurable size (default 10,000 lines), automatic memory management
- **Multiple read modes**:
  - `full`: Complete output
  - `head`: Read only first N lines
  - `tail`: Read only last N lines
  - `head-tail`: Read both beginning and end
- **Incremental reading**: Use `since` parameter to read only new content
- **Token estimation**: Automatically estimate output token count, helping AI control context

### 🎨 Spinner Animation Compression
- **Automatic detection**: Recognize common progress animation characters (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏, ◐◓◑◒ etc.)
- **Smart throttling**: Reduce noise output from commands like `npm install`, `yarn`, `pnpm`
- **Preserve critical information**: Compress animations while retaining real logs
- **Flexible configuration**: Control on/off via environment variables or parameters

### 🌐 Web Visualization Management Interface
- **Real-time terminal**: Terminal rendering based on xterm.js, supporting full ANSI colors
- **WebSocket push**: Terminal output displayed in real-time without refreshing
- **Interactive operations**: Send commands and view output directly in browser
- **Multi-instance support**: Automatic port allocation, supporting multiple AI clients simultaneously

### 🛡️ Stability Assurance
- **Output stability detection**: `wait_for_output` tool ensures complete output is obtained
- **Interactive application support**: Supports vim, npm create, and other interactive programs
- **ANSI escape sequences**: Properly handle terminal control characters

## TODO
- [] Add authentication feature to prevent unauthorized access.
- [] Add command blacklist, never executing certain commands even if received.