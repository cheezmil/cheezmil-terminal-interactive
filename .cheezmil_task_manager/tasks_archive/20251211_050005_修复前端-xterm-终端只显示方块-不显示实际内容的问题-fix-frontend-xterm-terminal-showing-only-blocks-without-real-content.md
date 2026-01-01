- [x] 1. 检查前端 HomeView.vue 中 xterm 初始化配置和 rendererType，尝试切换为 DOM 渲染并验证显示效果 / Inspect xterm initialization in HomeView.vue and try switching rendererType to DOM, then verify display
**关键解决方法**：1. 已调整后端 TerminalManager 的终端事件使用用户可见的终端名称广播，确保 WebSocket 消息中的 terminalId 与前端侧边栏的终端 ID 完全一致。
- [x] 2. 检查全局和 scoped CSS 中与 .xterm、.xterm-rows、.xterm-screen 相关的样式，确保不会破坏字符测量和绘制 / Review global and scoped CSS for .xterm, .xterm-rows, .xterm-screen to ensure they do not break character measurement and rendering
**关键解决方法**：1. 已调整后端 TerminalManager 的终端事件使用用户可见的终端名称广播，确保 WebSocket 消息中的 terminalId 与前端侧边栏的终端 ID 完全一致。
- [x] 3. 使用 chrome-mcp 注入脚本和控制台确认终端缓冲区中存在正确文本，并对比 DOM 或 canvas 实际渲染结果 / Use chrome-mcp injected scripts and console to confirm correct text in the terminal buffer and compare with DOM/canvas rendering
**关键解决方法**：1. 已调整后端 TerminalManager 的终端事件使用用户可见的终端名称广播，确保 WebSocket 消息中的 terminalId 与前端侧边栏的终端 ID 完全一致。
- [x] 4. 必要时调整字体设置（fontFamily、fontSize、lineHeight、letterSpacing）以及浏览器缩放适配，直到在当前环境下文字可以正常可视化 / If needed, adjust font settings (fontFamily, fontSize, lineHeight, letterSpacing) and browser scaling until text is visually correct in the current environment
**关键解决方法**：1. 已调整后端 TerminalManager 的终端事件使用用户可见的终端名称广播，确保 WebSocket 消息中的 terminalId 与前端侧边栏的终端 ID 完全一致。
- [x] 5. 最终在多个终端标签（新建终端、切换终端）下回归测试，确保均能稳定显示真实终端内容 / Finally regression-test across multiple terminal tabs (new, switched) to ensure real terminal content is consistently visible
**关键解决方法**：1. 已调整后端 TerminalManager 的终端事件使用用户可见的终端名称广播，确保 WebSocket 消息中的 terminalId 与前端侧边栏的终端 ID 完全一致。
- [x] 6. 创建独立的前端 TerminalTestView 测试页面，用最简 xterm 初始化和写入逻辑验证在当前环境下文本是否能正常渲染 / Create an isolated frontend TerminalTestView test page with minimal xterm init and write logic to verify text rendering in the current environment
**关键解决方法**：1. 已调整后端 TerminalManager 的终端事件使用用户可见的终端名称广播，确保 WebSocket 消息中的 terminalId 与前端侧边栏的终端 ID 完全一致。
- [ ] 7. 将前端终端从 xtermjs 完全移除，改用 https://tzfun.github.io/vue-web-terminal/getting-started.html 组件实现相同/更佳功能
