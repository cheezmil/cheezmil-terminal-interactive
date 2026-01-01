- [x] 1. 定位后端：生成/路由/提示词/CTI交互相关代码位置
**关键做法**：用 rg -n -C 直接命中读取：核心在 `src/mcp-server.ts` 的 `interact_with_terminal` 工具处理与 `src/terminal-manager.ts` 的会话实现。
**下次注意**：后续若要新增“提示词拦截/引导”，优先复用工具层返回 `isError=true` + `structuredContent.blockedReason` 的模式。
- [x] 2. 实现：检测该特定“优化CTI调用方式”的场景并返回一段面向AI的提示词
**关键做法**：对特定长任务（crawl4ai/pagespy）做“参数合规性拦截”，不合规时直接返回英文 guidance prompt（isError=true），迫使调用方改用更少轮询/更长等待/专用 terminalId 的方式。
**下次注意**：如果后续要支持更多“长任务最佳实践”，建议把关键字与规则抽成可配置项（但先别动 config.yml，除非用户要求）。
- [x] 3. 实现：CTI交互层新增校验：缺少cwd直接报错 'must provide cwd'（英文）并允许同terminalId随时修改cwd
**关键做法**：在 `interact_with_terminal` 工具处理里强制校验 `cwd`，缺失直接抛 `must provide cwd`；同时在 `TerminalManager` 增加 `pendingCwd` 机制，支持同一 `terminalId` 随时传入新 `cwd` 并在下一次写入前自动 `cd/Set-Location`。
**下次注意**：如果你希望“纯 read 调用”也立刻切目录（而不是等下一次 write），我可以再加一个 `applyNow` 开关；但会不可避免地产生一条 cd 输出污染 buffer。
- [x] 4. 补充测试脚本：覆盖场景识别与cwd缺失报错
**关键做法**：更新既有 `src/tests/test-mcp-client.mjs` 统一补上 `cwd: process.cwd()`；新增 `src/tests/test-interact-requires-cwd-and-pagespy-guidance.mjs` 覆盖 cwd 缺失报错与 pagespy/crawl4ai guidance 拦截。
**下次注意**：这两个测试都避免触碰黑名单命令（按项目规则），只验证错误/提示行为。
- [x] 5. 按项目要求运行后端构建+启动脚本并运行 test-mcp-client.mjs 验证
**关键做法**：按项目规定脚本顺序执行：先 build，再 `ct start -- ...` 启动，等待 30s 后 reload/restart MCP，然后运行 `node src/tests/test-mcp-client.mjs` 与新增验证脚本。
**下次注意**：如果后续增删了 interact_with_terminal 参数约束，记得同步更新 `src/tests/test-mcp-client.mjs` 的每个 tools/call 参数。
- [x] 6. 按用户反馈：去掉针对 crawl4ai/pagespy 的明确描述，改为通用“长任务命令”自动识别（如 npm/pip install 等），并更新对应提示词与测试脚本
**关键做法**：移除所有 crawl4ai/pagespy 定向文案与关键字函数，改为通用 `isLikelyLongRunningCommand` 启发式（npm/pnpm/yarn/pip install 等）触发 guidance prompt，并同步更新测试脚本的断言与输入。
**下次注意**：如果你希望把“哪些算长任务”做成可配置（config.yml），我可以在不破坏现有配置的前提下新增可选项并同步 `config.example.yml`。
