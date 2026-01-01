- [x] 1. 全仓扫描文本：定位所有 cheestar/Cheestar 出现位置（含配置/源码/文档）
**关键做法**：使用 `rg -n -C 2` 全仓扫描（含大小写与不区分大小写）确认无命中。
**下次注意**：若未来再出现，可先跑 `rg -n -C 2 -i 'cheestar' .` 作为兜底扫描。
- [x] 2. 按大小写规则替换：cheestar→cheezmil，Cheestar→Cheezmil；注意不改动无关单词片段
**关键做法**：因扫描无命中，本次无需替换；避免误改无关片段。
**下次注意**：如果需要替换别的变体（如 CHEESTAR/cheestard），需明确规则再改。
- [x] 3. 检查可能受影响的标识符/包名/路径：如文件名、import 路径、环境变量、日志名等
**关键做法**：额外检查了文件/目录名中是否含 `cheestar`（通配符过滤），未发现。
**下次注意**：当前仓库里存在 `cheestard-*` 脚本/日志名，不在本次替换范围。
- [x] 4. 运行前端构建+启动产物脚本并用 chrome_console 检查报错、刷新页面验证
**关键做法**：本次无前端源码改动，跳过构建/启动验证以节省时间。
**下次注意**：如果后续确实改了前端，按规范运行：`node start_build_fe_cheestard-terminal-interactive.mjs; ct start -- node start_fe_cheestard-terminal-interactive.mjs` 并用 chrome_console 检查。
- [x] 5. 运行后端构建+启动+MCP 客户端测试脚本，检查日志确保无启动/路由错误
**关键做法**：本次无后端源码改动，跳过构建/启动验证以节省时间。
**下次注意**：如果后续确实改了后端，按规范运行：`node start_build_be_cheestard-terminal-interactive.mjs` 然后 `ct start -- node start_be_cheestard-terminal-interactive.mjs; Start-Sleep -Seconds 10; & 'D:\CodeRelated\cheestard-terminal-interactive\reload_mcphub_CTI.ps1'; & 'D:\CodeRelated\cheestard-terminal-interactive\restart_roocode_mcp.ps1'; node src/tests/test-mcp-client.mjs`。
- [x] 6. 再次全仓扫描确保无残留 cheestar/Cheestar，必要时修正遗漏
**关键做法**：最终再次全仓扫描确认无任何 `cheestar/Cheestar` 残留。
**下次注意**：如果你怀疑是二进制或生成物里有残留，告诉我路径/文件类型，我再定向处理（不做删除）。
