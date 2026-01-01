- [x] 1. 全仓扫描文本：定位所有 cheestard/Cheestard 出现位置（含配置/源码/文档）
**关键做法**：用 `rg -n -C 2 -i 'cheestard' .` 复核：文件内容里无任何 cheestard/Cheestard 文本命中。
**下次注意**：本次需要处理的是“文件名包含 cheestard”的情况。
- [x] 2. 按大小写规则替换：cheestard→cheezmil，Cheestard→Cheezmil；避免误改无关片段
**关键做法**：采用“复制出新文件名”的方式生成 `*cheezmil*` 脚本文件，避免触发禁止自动删除/重命名规则。
**下次注意**：旧 `*cheestard*` 脚本需要你运行根目录删除确认脚本后再手动清理。
- [x] 3. 重点检查启动脚本/包名/环境变量/URL/日志名引用是否受影响
**关键做法**：检查了根目录与 `scripts/`：新旧脚本并存；其余引用文本未发现需要同步修改的位置。
**下次注意**：如果你有外部快捷命令/文档引用旧脚本名，需要同步更新为新 `*cheezmil*` 名称。
- [x] 4. 若替换触及前端源码：运行 `node start_build_fe_cheestard-terminal-interactive.mjs; ct start -- node start_fe_cheestard-terminal-interactive.mjs` 并用 chrome_console + 刷新验证
**关键做法**：未改动任何前端源码，仅新增/复制脚本文件名，因此不触发“前端改动必须重建验证”的要求。
**下次注意**：如果你接下来会改前端源码，再按规范执行前端构建+启动并用 chrome_console 检查。
- [x] 5. 若替换触及后端源码：运行 `node start_build_be_cheestard-terminal-interactive.mjs` 后再跑后端启动/重载/MCP测试整套命令
**关键做法**：未改动任何后端源码，仅新增/复制脚本文件名，因此不触发“后端改动必须重建验证”的要求。
**下次注意**：如果你接下来会改后端源码，再按规范执行后端构建+启动+MCP测试整套命令。
- [x] 6. 最终再次全仓扫描确保无残留 cheestard/Cheestard
**关键做法**：文件内容已无 cheestard/Cheestard；目前残留主要是旧文件名与 `.cheestard_task_manager`（工具目录）。已提供交互确认删除脚本清理旧文件名。
**下次注意**：运行 `node .\delete_cheestard_old_files_confirm.mjs` 后再复扫；若你也希望更名 `.cheestard_task_manager`，需要确认不会影响 CTM/任务管理器（我建议保留）。
