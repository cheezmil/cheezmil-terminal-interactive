- [x] 1. 扩展 MCP 入参：新增 wait 对象并兼容 waitForOutput
**关键做法**：在 MCP schema 里新增 wait 对象，同时保持 waitForOutput 向后兼容映射。
**下次注意**：后续如果要暴露到前端/文档，可同步更新说明。
- [x] 2. 服务端实现等待循环：idle/prompt/pattern/exit，默认无无限等待
**关键做法**：把等待逻辑收敛到服务端轮询 + 超时返回，避免客户端/AI 自己猜。
**下次注意**：如需更精准的 exit 判断，可在 TerminalSession 暴露 exitCode/status。
- [x] 3. 强化增量返回：返回 delta（新增输出）并暴露 read 游标字段
**关键做法**：轮询使用 since/cursor 递增读取并累计 delta，structuredContent 明确 read/delta 字段。
**下次注意**：若 readFromTerminal 的 smart/raw 仍会带旧内容，可在 TerminalManager 进一步做严格 deltaOnly。
- [x] 4. 减少 token：默认去噪（提示符/回显/空行/spinner）+ 统计
**关键做法**：输出后处理：strip spinner + 去重/折叠提示符/回显/空行，默认减少 token。
**下次注意**：如误伤真实输出，可加参数开关 normalizeOutput。
- [x] 5. 修复新建终端首次输出丢失：写入后确保至少读取到新增输出或等待到 idle
**关键做法**：等待条件要求“先看到增量再判 idle”，避免新建终端第一次输出/echo 被读取太快漏掉。
**下次注意**：如果仍偶发，可在 createTerminal 后做一次短 wait idle。
- [x] 6. 运行后端构建/启动/测试脚本验证
**关键做法**：已按规定执行后端 build/start/reload 脚本，并运行 `node src/tests/test-mcp-client.mjs`（新增 wait/delta echo 回归也已通过）。
**下次注意**：后续若调整默认等待参数，记得同步更新测试阈值。
- [x] 7. 修改 `src/tests/test-mcp-client.mjs`：移除/禁用黑名单命令测试，避免执行危险黑名单命令；并重新运行测试脚本验证
**关键做法**：已从 `src/tests/test-mcp-client.mjs` 移除黑名单命令测试，避免触发危险命令；并重新运行测试脚本确认通过。
**下次注意**：如需验证黑名单功能，建议改为“纯配置解析/静态验证”或用无副作用的 mock。
