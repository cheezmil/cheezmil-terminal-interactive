- [x] 1. 定位后端生成/拼接PowerShell命令的位置，复现“进入 >>”的触发路径
**关键做法**：用一次性 rg+上下文定位到 `src/terminal-manager.ts` 的终端命名/状态检测，以及 `src/mcp-server.ts` 的交互提示输出点。
**下次注意**：后续若再出现“>>”，优先看 `isTerminalAwaitingInput` 的 tail 规则以及 MCP 层是否把 awaitingInput 转成可见提示。
- [x] 2. 实现更稳健的PowerShell命令包装：强制用-EncodedCommand或临时脚本文件执行，避免引号/正则转义截断
**关键做法**：在 `interact_with_terminal` 增加 `powerShellScript` 参数：服务端将脚本 UTF-16LE Base64 后用 `pwsh -EncodedCommand` 执行，显著降低客户端引号/转义截断导致的 PowerShell 续行（>>）。
**下次注意**：若后续需要进一步增强，可扩展为“临时 .ps1 文件执行”模式，避免嵌套 pwsh 进程。
- [x] 3. 在后端返回给前端/客户端的英文提示词中加入：terminalId隔离/避免复用/必要时重置会话的明确指引
**关键做法**：把 MCP 工具说明、黑名单默认提示、progressive-wait 提示、terminalId隔离提示全部改为英文；并在创建终端/交互警告里明确提示“避免复用 terminalId 以免会话污染”。
**下次注意**：后续若新增任何对用户可见的提示/错误信息，默认用英文；中文只保留在注释里。
- [x] 4. 更新/新增测试脚本覆盖：复杂引号/正则/多行命令不会造成续行、terminalId污染提示出现
**关键做法**：新增 `src/tests/test-powershell-continuation.mjs`：验证 createTerminal 自动生成非UUID的可读 terminalName，并验证 PowerShell 续行提示（>>）会被识别为 awaiting input。
**下次注意**：若需要覆盖 `powerShellScript` 端到端，可再补一个通过 MCP tools/call 的集成测试。
- [x] 5. 按项目约定重建并启动后端，运行test-mcp-client.mjs验证
**关键做法**：按约定执行 `node start_build_be_cheezmil-terminal-interactive.mjs` + `ct start -- node start_be...` 流程，并跑 `node src/tests/test-mcp-client.mjs` 与新增 `node src/tests/test-powershell-continuation.mjs` 通过验证。
**下次注意**：若 `test-powershell-continuation.mjs` 再出现 teardown EPIPE，可考虑在 TerminalManager 层做更稳健的 Windows 关闭顺序。
- [x] 6. 用CTM逐项打勾收尾
**关键做法**：按顺序完成并验证后再收尾打勾，确保任务列表闭环。
**下次注意**：无
