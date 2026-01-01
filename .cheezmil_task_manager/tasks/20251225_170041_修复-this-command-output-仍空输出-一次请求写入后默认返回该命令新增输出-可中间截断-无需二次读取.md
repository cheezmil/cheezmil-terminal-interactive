- [x] 1. 定位 mcp-server.ts this_command_output 的 baselineSince/nextSince/finalResult 逻辑
**关键做法**：定位到 `finalResult` 使用了 `since: nextSince`，导致轮询推进光标后最终读到空输出。
**下次注意**：后续改动要保持：轮询光标与最终输出读取的起点分离。
- [x] 2. 修复：轮询可推进 nextSince，但最终输出必须覆盖 baselineSince->末尾（避免读到空）
**关键做法**：新增 `finalReadSince`：this_command_output 时固定用 `baselineSince` 做最终 read，避免被 `nextSince` 推进清空。
**下次注意**：如果 maxLines 过小仍可能截断本次命令输出，可考虑单独的 `maxChars/maxBytes` 参数。
- [x] 3. 补充：当 includeIntermediateOutput=false 时也能通过最终 read 得到输出
**关键做法**：最终输出不再依赖 `includeIntermediateOutput` 的 `accumulatedDelta`，而是统一通过 `finalReadSince` 做最终 read，所以 includeIntermediateOutput=false 也能拿到输出。
**下次注意**：如果要减少一次 read，可在 includeIntermediateOutput=true 且 waitMet 时优先用 accumulatedDelta 构造输出。
- [x] 4. 执行后端构建/启动脚本链并运行 test-mcp-client 验证
**关键做法**：按后端要求脚本链重新 build+reload，并运行 test-mcp-client 确认 interact_with_terminal 调用链仍正常。
**下次注意**：建议把 test-mcp-client 增强为：默认不传 mode 的一次调用断言 Command Output 非空，防止回归。
