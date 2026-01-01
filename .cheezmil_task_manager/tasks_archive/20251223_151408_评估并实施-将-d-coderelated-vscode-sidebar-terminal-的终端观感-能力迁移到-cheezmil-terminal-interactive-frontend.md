- [x] 1. 快速扫描 vscode-sidebar-terminal：xterm 初始化、CSS/主题、字体与渲染器设置
**关键做法**：vscode-sidebar-terminal 的终端主要在 `src/webview/services/TerminalCreationService.ts` 创建，终端配置通过 `TerminalConfigService.mergeConfig` 合并，并在创建前注入字体覆盖与 `getWebviewTheme()` 解析出的主题，避免创建时闪屏。
**下次注意**：后续重点再抓：TerminalConfigService 默认项、滚动条/选区/光标服务，以及 webview 的全局 CSS（通常在 webview 的 html/css 或 style 注入处）。
- [x] 2. 扫描本项目 frontend：xterm 初始化与现有样式入口
**关键做法**：本项目 `frontend/src/views/HomeView.vue` 已有“VS Code-like defaults” 的 xterm 初始化（含 `fontFamily: "Cascadia Code"...`），另有 `TerminalDetailView.vue`、`TerminalTestView.vue` 也各自 new 了 Terminal，存在配置分散/不一致的风险。
**下次注意**：如果要对齐观感，应抽一个统一的 `createXterm(options)` 工具/组件，让三个视图复用同一套字体/行高/主题/滚动条 CSS。
- [ ] 3. 判定哪些可“直接搬”（CSS/主题/参数）哪些不可（VSCode API/Webview/扩展宿主）
- [ ] 4. 在本项目实现：对齐 xterm options + 终端容器样式 + 滚动条/选区/光标
- [ ] 5. 按项目要求构建前端产物并用 chrome-mcp 检查 console/页面效果
