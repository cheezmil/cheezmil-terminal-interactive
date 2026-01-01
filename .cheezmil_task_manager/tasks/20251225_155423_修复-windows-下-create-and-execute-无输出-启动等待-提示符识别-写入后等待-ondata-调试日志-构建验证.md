- [x] 1. 定位 terminal-manager.ts 与 mcp-server.ts 的相关逻辑
**关键做法**：用 rg -C 直接定位 createTerminal/onData/isPromptLine 与 interact_with_terminal 写入/轮询位置，避免分步读文件。
**下次注意**：后续改动前再确认是否有更深层 AGENTS.md 覆盖子目录规范。
- [x] 2. 在 Windows 创建终端后增加启动等待/稳定输出等待
**关键做法**：把 Windows 启动等待放在 sessions/outputBuffers 建好之后、emit terminalCreated 之前，确保 waitForOutputStable 可用。
**下次注意**：如果仍偶发无输出，可把等待策略从固定 1s 改为基于提示符/idle 触发。
- [x] 3. 增强 isPromptLine：剥离 ANSI 后匹配 PowerShell 提示符
**关键做法**：在 isPromptLine 内先 strip ANSI，再增加 PowerShell `PS X:\...>` 的专用匹配，避免颜色码导致误判。
**下次注意**：如需更强兼容，可追加 `PS>` / 自定义 prompt (function prompt) 的模式。
- [x] 4. 在 writeToTerminal 后轮询前强制最小等待 200ms
**关键做法**：把 200ms 最小等待放到 shouldWait 分支进入轮询前，保证 write->read 之间有 flush 时间。
**下次注意**：如果需要更快响应，可把 200ms 作为可配置项或按平台/壳类型调整。
- [x] 5. 在 ptyProcess.onData 增加 stderr 调试日志（长度+预览）
**关键做法**：在 createTerminal 内部 onData 回调加 stderr 日志，并用 250ms 节流+200 字符预览避免刷屏。
**下次注意**：如日志过多影响性能，可改为环境变量开关或仅首次 N 次输出。
- [x] 6. 运行前后端构建/启动脚本并用 chrome_console 检查
**关键做法**：按项目要求用脚本完成 build+启动+reload，并运行 `node src/tests/test-mcp-client.mjs` 做冒烟验证。
**下次注意**：如果要进一步复现 create_and_execute 空输出，可用 test-mcp-client 增加多次循环调用（注意不要测试黑名单命令）。
