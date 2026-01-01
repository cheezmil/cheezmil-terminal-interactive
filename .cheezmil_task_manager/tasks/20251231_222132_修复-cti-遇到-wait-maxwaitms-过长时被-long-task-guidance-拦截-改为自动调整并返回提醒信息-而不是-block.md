- [x] 1. 定位 CTI 返回 blockedReason: long_task_guidance 的代码路径与触发条件
**关键做法**：用 rg 直接定位到 `src/mcp-server.ts` 里对 long_task_guidance 的提前 return。
**下次注意**：后续改动要避免在执行前直接 `isError: true` 返回；改为 warnings/structuredContent 提示即可。
- [x] 2. 设计行为：对 wait.maxWaitMs>50000 自动 clamp=50000，并在返回元数据中附带提醒（不中断执行）
**关键做法**：将“长任务指导”从 hard block 改为 warnings + structuredContent.longTaskGuidance；并对传入的 wait.maxWaitMs>50s 自动 clamp。
**下次注意**：下一步实现代码后要跑后端脚本回归，确认不再出现 blockedReason=long_task_guidance。
- [x] 3. 实现：修改 CTI 相关代码，保证不会直接 blocked 返回；必要时调整 longTask 逻辑
**关键做法**：在 `src/mcp-server.ts` 删除 long_task_guidance 的提前 return，改为 guidance-only；并把 clamp 信息写入 structuredContent.waitMaxWaitMsClamped。
**下次注意**：若后续客户端依赖 isError/block 字段，需要同步更新客户端兼容逻辑。
- [x] 4. 回归验证：按项目要求运行后端 build + start + test-mcp-client，确认不再出现 long_task_guidance block
**关键做法**：按项目规定用 build/start/reload/restart + `node src/tests/test-mcp-client.mjs` 做回归，确认长等待不再被 block。
**下次注意**：如果还需要把 guidance 信息在前端 UI 显示得更友好，可以再加一层 UI 提示。
