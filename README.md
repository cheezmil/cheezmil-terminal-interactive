# Cheestard Terminal Interactive MCP Server

[Chinese README](README-ZH.md)

#### This tool allows AI to control multiple terminals and interact with them via MCP (Model Context Protocol). It solves the problem that some AI coding tools get stuck when the terminal is blocked and cannot proceed to the next step. It provides persistent terminal session management, so even if the AI coding tool is accidentally closed, the terminal will keep running, increasing the success rate of automated tasks.


## Why use this project
- At present, most mainstream AI coding tools block the terminal when running certain commands such as `npm run dev`. In this case, the AI cannot receive new messages for a long time. Some AI tools hard‑code a 2‑minute timeout; some can still see terminal output after timing out; some just completely hang. This project helps you avoid wasting time when things get stuck.
- If you are using different AI coding tools at the same time, this project allows different AIs to view the same running terminals.
- You might let one Codex control another Claude Code.
- You might say, “I can just redirect all terminal output to a file and let the AI read that.” But that costs an extra API call. Also, the AI does not know which commands need to be written to a file or where that file is, and you must clearly describe all of this in the prompt; otherwise things will still get blocked. That is a bit troublesome.
- In some cases, you may need to restart codex cli or Claude Code to apply some settings, and at this time you do not want to lose the terminal tasks that are still running.

## Usage
### Run backend
> ⚠️ Due to `node-pty`, Windows users currently need to use a Node.js version no greater than 20 in order to use this project properly. For convenience, the install, build and run scripts all use 20.19.5. Please be sure to install `https://github.com/Schniz/fnm`, otherwise it will not work, unless you use the same Node.js version for every project, which is unlikely because one of the AI coding tools or popular MCP tools mentioned in this document uses Node.js 22+.

First fork this project so it is convenient for you to submit PR contributions, and then:
```bash
git clone https://github.com/<your-github-username>/cheestard-terminal-interactive.git
```
```bash
# Install dependencies
node start_install.mjs
```
```bash
# Run backend
node start_be_cheestard-terminal-interactive.mjs
```


### ⚙️ MCP client configuration
#### Before configuring the MCP client, it is best to add a rule to your AI coding tool:
```plaintext
Be sure to use this CTI MCP terminal tool. Do not use the built-in tool functions in the system prompt to run commands.
```

#### All MCP clients that support Streamable HTTP can be used. The configuration differs slightly between clients, so please check the official documentation of each one. Here are some simple examples:

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

**Command line add method:**
In addition to configuration files, Claude Code also supports quickly adding MCP servers via the command line:

```bash
# Add cheestard-terminal-interactive server
claude mcp add cheestard-terminal-interactive --scope user --type streamable-http --url http://localhost:1106/mcp

# List configured MCP servers
claude mcp list

# Remove MCP server
claude mcp remove cheestard-terminal-interactive
```

**Command line parameter description:**
- `--scope user`: Set configuration scope to user level.
- `--type streamable-http`: Specify transport type as streamable-http.
- `--url http://localhost:1106/mcp`: Specify server address.

For more complex configuration, it is recommended to edit the configuration file directly:
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

### 🌐 How to use the Web management interface
```bash
node start_fe_cheestard-terminal-interactive.mjs
```

## Disclaimer
- Because different AI models have different intelligence levels when judging dangerous commands and are guided by different prompts, they sometimes cannot decide whether a command is dangerous. For example, recursive file deletion commands should be executed manually by you, or you should clearly specify that dangerous commands must be run by yourself. No matter what commands are executed through this project, you are responsible for any negative consequences.
- Do not allow the internet to directly access this project deployed on your computer. Otherwise, you are responsible for any negative consequences.


## As of 2025-11-03, comparison of terminal interaction features in mainstream AI coding tools (if there is any mistake, please tell me so I can fix it 🥲):

| Feature | Cheestard Terminal Interactive | Claude Code | Codex | Cursor | Cline | Roocode | Kilocode | Gemini CLI | Qwen Code | iFlow CLI | Open Code | windsurf | Warp | Augment | Goose | Crush |
|--------|-------------------------------|-------------|-------|--------|-------|---------|----------|-------------|-----------|-----------|-----------|----------|------|---------|-------|-------|
| Input ctrl+c | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Press Enter | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Rarely hangs and stops working | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Create multiple terminals in one API request | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View output of multiple terminals simultaneously | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Close old terminals | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Search strings in terminal | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Input y or n | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Run Linux commands directly in WSL | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Interact with another command-line AI | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| SSH terminal | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Continue using previous terminal after starting a new chat | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Run specified scripts before and after commands | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Run some fixed commands before and after commands | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Attach extra prompts for certain commands to tell the AI the correct behavior | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Use regular expressions to filter terminal output to save context | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |


## TODO
- [ ] Add authentication to prevent anyone from accessing it.
- [ ] Add a command blacklist so that some commands will never be executed even if they are received.

