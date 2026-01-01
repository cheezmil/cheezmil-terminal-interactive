- [x] 1. 收集两项目终端渲染链路差异点（Webview/DOM/CSS/xterm 配置）
**关键做法**：先从“渲染容器”入手：VSCode Webview/原生终端样式 vs 普通浏览器/页面；再对比 xterm.js options + CSS（fontFamily/fontSize/lineHeight/letterSpacing/padding/theme/rendererType）。
**下次注意**：若要精确对比，下次直接用 `rg -n` 同时搜两边 `new Terminal(`、`fontFamily`、`theme`、`.xterm`、`--vscode-` 变量。
- [x] 2. 归纳常见“更好看”的决定因素（字体、抗锯齿、行高、间距、主题、padding 等）
**关键做法**：“好看”通常来自：字体选择与渲染（抗锯齿/子像素）、行高/字距、padding/圆角/阴影、主题色对比度、光标/选区/滚动条样式、以及 xterm 渲染器（canvas/webgl）与 DPR 适配。
**下次注意**：排查顺序：先锁定字体与字号，再调 lineHeight/letterSpacing/padding，最后调 theme 与滚动条/背景效果。
- [x] 3. 给出可落地的对齐方案与排查清单
**关键做法**：对齐方案=对齐“容器 CSS + xterm options”。优先把 cheezmil 的 xterm fontFamily/fontSize/lineHeight/letterSpacing/padding/theme/cursor/selection/scrollbar 调到与 VSCode 观感一致，再考虑透明/模糊等装饰性效果。
**下次注意**：如果你希望我给出100%精确差异：我可以直接 `rg` 两个工程里 xterm 初始化与 `.xterm` 样式，把具体配置差异列出来，并给出一套可复制的 cheezmil 配置。
