# Cheezmil Terminal Interactive MCP Server

[Chinese README](README-ZH.md)

## Why Use This Project
- Currently, various mainstream AI programming tools get stuck when executing certain commands like `npm run dev`, causing the terminal to block. In such cases, AI doesn't receive timely feedback. Some AI programming tools have a hardcoded 2-minute timeout, and even after timeout, they can't see any terminal information. Some can see messages after timeout, while others get completely stuck. This project saves time wasted on getting stuck.
- If you're using different AI programming tools simultaneously, this project allows different AIs to view running terminals.
- You might want one codex to control other claude code instances.
- You might think, "Why not just output all terminal content to a file for AI to read?" However, this consumes an additional API request. Moreover, AI doesn't know which commands need to be output to a file or where the file should be located. You would need to manually write clear prompts to tell AI, otherwise it will still get stuck, which is quite troublesome.
- In certain situations, you might need to restart codex cli or claude code to apply some settings, but you don't want to lose running terminal tasks.
- Sometimes, even with prompts instructing AI on how to run commands, AI might forget and execute commands you don't want. You can add these commands to a blacklist with an additional prompt to strengthen the guidance for AI on correct operations.
- Claude Code already has background tasks, so why do you still need this project? First, background tasks require explicit prompts to be called, otherwise they need to be triggered manually; background tasks require additional prompts with a fixed timeout that cannot be flexibly recognized; background tasks don't respond quickly to small tasks and often take several minutes to react, affecting efficiency. Additionally, there are redundant background tasks still receiving terminal destruction information. If your script has operations to terminate old instances, Claude Code starts to go crazy, checking and restarting scripts randomly, wasting time. (December 22, 2025)
- This project provides Windows users with the following functionality: using wsl.exe or ssh root@127.0.0.1 as shell to directly input native Linux commands, reducing the probability of errors often encountered with wsl "input some file modification commands" or ssh root@127.0.0.1 "input some file modification commands".

## Usage
### Running the Backend
> ⚠️ Due to `node-pty`, Windows users currently need to use Node.js version 20 or lower to work properly. For convenience, I've set all installation, compilation, and running scripts to use 20.19.5. Please make sure to install `https://github.com/Schniz/fnm`, otherwise it won't work unless you use the same Node.js version for all projects, which is unlikely since some AI programming tools or popular MCP tools mentioned in this documentation require Node.js 22+.

> If you are a Windows user, it is strongly recommended to install PowerShell 7 instead of the system default PowerShell to avoid some encoding issues. https://github.com/powershell/powershell/releases

First fork this project for easy PR contributions, then:

```bash
git clone https://github.com/<your-github-username>/cheezmil-terminal-interactive.git
```
```bash
# Install frontend and backend dependencies
node start_install.mjs
```
```bash
# Build backend
start_build_be_cheezmil-terminal-interactive.mjs
```
```bash
# Run backend
node start_be_cheezmil-terminal-interactive.mjs
```

### ⚙️ MCP Client Configuration
#### Before configuring MCP clients, it's best to add a rule to your AI programming tool:
```plaintext
Except for commands that locate and read code files, all other commands must be executed using the CTI MCP terminal tool!
```
> Of course, you can also ask your AI programming tool what the system's built-in command execution tool function is called, and then customize a prompt for it to combine CTI with the "system's built-in command execution tool function". If CTI is not running, AI will intelligently automatically use the original tool functions that come with the AI programming tool to execute commands. If you never tell it about the CTI tool, AI will likely never use CTI.

> Different programming software has different MCP maximum timeout settings. Please refer to the corresponding documentation. Please set a very large timeout for CTI, otherwise some programming software has very short default timeouts. For example, Codex only has a default 60s timeout, which will not get any information output and thus cannot be used normally.

#### All MCP clients that support Streamable HTTP can be used. Configuration will vary slightly for different MCP clients. Please refer to the corresponding client's official documentation. Here are simple examples:


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
tool_timeout_sec = 666666
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

**Command Line Addition Method:**
In addition to the configuration file method, Claude Code also supports using the command line to quickly add MCP servers:

```bash
# Add cheezmil-terminal-interactive server
claude mcp add CTI --scope user --type streamable-http --url http://localhost:1106/mcp

# List configured MCP servers
claude mcp list

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
# Build frontend
start_build_fe_cheezmil-terminal-interactive.mjs
```
```bash
node start_fe_cheezmil-terminal-interactive.mjs
```

## Disclaimer
- Due to varying levels of intelligence in different AI models when judging dangerous commands and different prompt guidance, AI sometimes cannot determine whether certain commands are dangerous, such as some recursive file deletion commands. Please manually execute some more dangerous commands or clearly specify dangerous commands for me to handle. Regardless of what commands are executed through this project, you are responsible for any adverse consequences.
- Do not allow direct internet access to this project deployed on your computer, otherwise you are responsible for any adverse consequences.

## Comparison of Terminal Interaction Features in Mainstream AI Programming Tools as of 2025-11-03 (If there are errors, please let me know to correct them 🥲):

| Feature | Cheezmil Terminal Interactive | Claude Code | Codex | Antigravity | Cursor | Cline | Roocode | Kilocode | Gemini CLI | Qwen Code | iFlow CLI | Open Code | windsurf | Warp | Augment | Goose | Crush |
|---------|-------------------------------|-------------|-------|-------------|--------|-------|---------|----------|-------------|-----------|-----------|-----------|----------|------|---------|-------|-------|
| Input ctrl+c | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Input enter | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| No frequent stuck issues | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Create multiple terminals with one API request | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View multiple terminal outputs simultaneously | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Close old terminals | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Search strings from terminal | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Input y or n | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Directly input Linux commands in WSL | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Interact with another command line AI | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| SSH terminal | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Continue using previous terminals after new conversation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Execute specified scripts before and after command execution | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Execute certain fixed commands before and after command execution | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Execute certain commands with additional prompts to inform AI of correct approach | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Use regular expressions to filter terminal output to save context | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## TODO
- [ ] Beautify terminal
- [ ] Add authentication functionality to prevent anyone from accessing
- [x] Add command blacklist - even if certain commands are received, they will never be executed
