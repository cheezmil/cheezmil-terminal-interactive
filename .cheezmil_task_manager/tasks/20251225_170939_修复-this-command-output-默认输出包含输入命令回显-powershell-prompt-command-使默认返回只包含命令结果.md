- [x] 1. 定位 mcp-server.ts 构造 finalOutput 的位置与 normalizeOutputText 行为
**关键做法**：先定位 `normalizeOutputText`：它当前策略是“保留第一次命令回显”，所以默认会把 PowerShell prompt+command 带回。
**下次注意**：修复应只影响 mode=this_command_output，避免破坏其它 read 模式的历史可读性。
- [x] 2. 实现：仅在 mode=this_command_output 时过滤掉 prompt+command 回显行
**关键做法**：在构造 `finalOutputRaw` 后、仅对 `mode===this_command_output` 额外过滤掉 PowerShell prompt+command 回显行。
**下次注意**：如果未来支持 bash/zsh，可在该过滤函数里按 shell 类型扩展其它提示符模式。
- [x] 3. 运行后端构建/启动脚本链并验证输出不再包含回显
**关键做法**：按后端脚本链重新 build+reload 并跑 test-mcp-client，确保修改不破坏现有交互逻辑。
**下次注意**：建议你用 RooCode 直接调用 `interact_with_terminal` 执行 `echo "Testing different modes"`，确认返回里不再包含 `PS ...> ...` 回显行。
