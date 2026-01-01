- [x] 1. 复现：最大化/缩小窗口对比
**关键做法**：用chrome-mcp注入脚本读取`.cti-vscode-terminal .xterm-rows`的`style`，复现到 xterm DOM renderer 会写入异常的 `letter-spacing: ~7.687px`（字符被拉开）。
**下次注意**：这个问题不是 Tailwind 的 tracking，而是 xterm DOM renderer 在某些尺寸/缩放条件下 charWidth 测量异常导致；后续优先看`.xterm`是否带`xterm-dom-renderer-owner-*`。
- [x] 2. 采集：computed letter-spacing 及来源
**关键做法**：确认异常来自 xterm DOM renderer：`.xterm` class 为 `xterm-dom-renderer-owner-*` 且页面中无 canvas；同时`.xterm-rows`出现行内 `letter-spacing` 被写成单个 cell 宽度（约 7.687px）。
**下次注意**：修复方向优先切到 canvas renderer（VS Code 也是 canvas），避免 DOM renderer 的 letter-spacing 补偿路径；必要时再加兜底重测/切换。
- [x] 3. 修复：隔离/重置终端letter-spacing
**关键做法**：根因与修复策略（非常关键）：
**下次注意**：后续如果再出现字距问题：先用 chrome-mcp 检查 `.cti-vscode-terminal .xterm` 是否仍是 `xterm-dom-renderer-owner-*`，以及 `.xterm-rows` 的行内 `letter-spacing`；如果是，说明 GPU/WebGL 没生效或依赖版本被回退，需要优先排查 `@xterm/*` 依赖是否安装、WebglAddon 是否成功 load。
- [x] 4. 按规定重建前端并Chrome验收
**关键做法**：按项目规则执行并验收：
**下次注意**：如果之后你说“最大化又坏了”，第一步就是在新 tab 里（带 query 或新窗口）复测 `.xterm` class 与 canvas 是否存在，排除旧 tab 注入脚本/缓存污染。
- [x] 5. 回填并完成任务单
**关键做法**：最终结论（给你/未来排查者的一页纸）：

【现象】
- 仅在最大化（或某些窗口尺寸/缩放组合）时，终端字符间距异常变大；缩小窗口再刷新又恢复。

【直接证据】
- 异常时：`.cti-vscode-terminal .xterm` 为 `terminal xterm xterm-dom-renderer-owner-*`（DOM renderer），且 `.xterm-rows` 被运行时写入 `style="... letter-spacing: 7.6875px;"`。
- 正常时：`cti_probe` 新 tab 中 `.cti-vscode-terminal` 内有 `<canvas>`，`.xterm` class 为 `terminal xterm`，`.xterm-rows` 不再出现该行内 letter-spacing。

【根因（为什么最大化触发）】
- DOM renderer 为了对齐字符网格，会用“letter-spacing 补偿”把 row 宽度凑齐；当字符宽度测量（char width）在某些 DPI/缩放/容器宽度组合下失真时，补偿值会被算成接近单个 cell 宽度（≈7~8px），造成每个字符都被拉开。
- 项目原本尝试通过 `xterm-addon-canvas` 切回 canvas，但该包 `peerDependencies` 只支持 `xterm:^4`，与本项目 `xterm@5.3.0` 不兼容，导致 addon 激活时报错，最终仍回退到 DOM renderer。

【最终修复（保证 1) 不回退到DOM renderer 2) 最大化稳定）】
1) 依赖体系对齐到官方 @xterm：
   - 新增 `@xterm/xterm`、`@xterm/addon-fit`；
   - 代码中 `Terminal/FitAddon` 的 import 全部迁到 `@xterm/*`；
   - `xterm.css` 改为 `@xterm/xterm/css/xterm.css`。
2) 渲染器改为 VS Code 同路线：
   - 在 `term.open(...)` 后加载 `@xterm/addon-webgl` 的 `WebglAddon`（带 context loss 兜底），使渲染走 canvas/webgl，而不是 DOM renderer。
3) CSS 兜底：
   - `frontend/src/styles/vscode-terminal.css` 保留 `.cti-vscode-terminal .xterm-rows { letter-spacing: 0px !important; }`，就算极端情况下落回 DOM renderer，也不会“字距炸裂”。

【你刚刚确认】
- 你已确认该问题修复（最大化/刷新不会再把字符间距弄坏）。
**下次注意**：如果未来又出现：先 `refresh:true`，再在新窗口打开 `http://localhost:1107/?cti_probe=1` 看是否有 `<canvas>` + `.xterm` 是否还带 `xterm-dom-renderer-owner-*`；这两条能最快区分“渲染器回退/依赖被破坏”还是“其他 CSS 污染”。
