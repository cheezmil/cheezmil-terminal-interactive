- [x] 1. 定位 CTI 工具实现与现有接口
**关键做法**：用 rg 一次性定位：MCP 工具在 `src/mcp-server.ts`，统一交互在 `src/terminal-manager.ts`，前端 HTTP 读输出在 `src/terminal-api-routes.ts`，相关测试在 `src/tests/*.mjs`。
**下次注意**：后续重构需要同步：MCP tool schema、api-docs、测试脚本、以及可能的前端/文档中对工具名的引用。
- [x] 2. 设计 read_CTI 新接口与交互流程
**关键做法**：交互流程：`interact_with_terminal` 只负责“一次输入命令→等待→返回本次命令输出(this_command_output)”；所有后续读取/截断/关键字上下文/元数据都走新工具 `read_CTI`。`cwd` 仅在创建新 terminalId 时必传，后续可省略。
**下次注意**：接下来要把旧的 read/search 参数彻底从 schema/handler 中去掉（目前已强制报错引导 read_CTI），并补齐 docs/api-docs 与测试脚本覆盖 read_CTI + longTask/noEcho。
- [x] 3. 实现：interact 仅 this_command_output + 边界 token/noEcho
**关键做法**：在 `src/mcp-server.ts`：默认强制 `mode=this_command_output`，并新增 `noEcho`；普通命令自动包 begin/end boundary token，并在返回前提取 token 之间的输出，显著降低粘连/误判。
**下次注意**：下一步把旧 schema 里的 read/search 参数彻底移除（目前是强制报错引导 read_CTI），并把边界 token 的行为写入 docs/api-docs。
- [x] 4. 实现：read_CTI（tailLines/关键字上下文/元数据）
**关键做法**：新增 MCP 工具 `read_CTI`：支持 `tailLines/headLines/since` 读取、`keywords+contextLines` 关键字上下文截取、以及 session 元数据（stats/readStatus/awaitingInput）。
**下次注意**：需要补测试：read_CTI 的 keywordContext、metadata 字段结构，以及与 interact 的串联用法。
- [x] 5. 实现：cwd 创建时固定 + 报错带当前 cwd
**关键做法**：`cwd` 只在创建新 terminalId 时必传；后续调用可省略，避免“读输出/发按键也要 cwd”误报；并在 interact 出错时尽量附带当前 session cwd。
**下次注意**：把前端/文档/提示词里关于“每次都必须传 cwd”的内容更新为“创建时必传”。
- [x] 6. 实现：长任务声明开关 + 指数退避轮询
**关键做法**：移除硬性的 progressive_wait_required 闸门；增加 `longTask=true` 开关，并把轮询等待改为指数退避（到上限 50s 单次 cap 内）。
**下次注意**：后续可把 wait.mode=idle 的判定改成真正 idle window（目前仍主要依赖 prompt 检测）。
- [x] 7. 实现：会话元数据暴露 + reset_session
**关键做法**：在 `read_CTI` 中返回 session 元数据（stats/readStatus/awaitingInput），并新增 `resetSession` 一键重置（kill+recreate，同名 terminalId，需要 cwd）。
**下次注意**：需要把 reset 的用法写进 api-docs/usage，并补测试覆盖 resetSession（含 cwd 必填）。
- [x] 8. 实现：终止语义（SIGINT/kill 子进程）
**关键做法**：新增 `TerminalManager.signalTerminal()`：非 win32 走 `ptyProcess.kill(SIGINT)`；win32 对 SIGINT 走写入 `\x03` 的 best-effort Ctrl+C；MCP `interact_with_terminal` 新增 `interrupt`/`interruptSignal` 用于“中断前台进程但不杀会话”。
**下次注意**：后续可在 win32 上对 Ctrl+C 做多次重试/延迟策略，并考虑 SIGBREAK 支持（避免误杀）。
- [x] 9. 实现：统一结构化状态返回（running/finished/blocked/timeout）
**关键做法**：在 `src/mcp-server.ts` 的 `interact_with_terminal` 返回中新增统一结构 `resultStatus: { state: running|finished|blocked|timeout, reason, nextAction }`；并同步在 blacklist/未知按键 token 等阻断分支返回同样语义。
**下次注意**：下一步把旧的 `kind`/`status` 字段逐步收敛到 resultStatus（先保持兼容），并让 read_CTI 也返回同样的 resultStatus 结构（用于 read-only 场景）。
- [x] 10. 更新 config.example.yml（如有新增）
**关键做法**：本次新增的 MCP 工具/参数均在代码层实现（schema 内），未引入新的 `config.yml` 配置项，因此无需同步 `config.example.yml`。
**下次注意**：如果后续把 longTask/backoff 的默认值做成可配置，再补 config.yml/example.yml。
- [x] 11. 新增/更新测试脚本覆盖新接口
**关键做法**：更新 `src/tests/test-mcp-client.mjs`：移除过时的 progressive_wait_required 测试，改为 longTask 机制测试；新增 read_CTI/keywordContext/metadata + resetSession + interrupt 的集成测试。
**下次注意**：下一步按项目要求跑后端 build + ct start + test-mcp-client，确认新工具/字段在真实服务进程里可用。
- [x] 12. 按要求运行后端构建与 test-mcp-client 验证
**关键做法**：已按要求执行后端构建与验证：`node start_build_be_cheezmil-terminal-interactive.mjs` 构建通过；并按脚本启动/重载/重启 MCP 后运行 `node src/tests/test-mcp-client.mjs`，新增的 longTask/read_CTI/resetSession/interrupt 测试均通过。
**下次注意**：如果你还希望把旧的 interact schema 里 read/search 字段彻底删掉（而不是报错引导），我可以继续做一次更彻底的破坏性变更并同步 docs/api-docs。
- [x] 13. 修复 boundary token 泄漏：即使未能完整提取 BEGIN/END，也要在返回的 commandOutput/delta 中过滤掉 __CTI_BOUNDARY_* 行；并解释该 token 的用途与触发条件
**关键做法**：`__CTI_BOUNDARY_*` 是我加的命令边界标记，用来把“本次命令真实输出”从提示符/回显/历史碎片里分离出来；已修复：即使 BEGIN/END 未能完整配对（超时/截断等），返回的 `commandOutput`/`delta.text` 也会过滤掉所有 boundary 行，避免你看到这些脏标记。
**下次注意**：注意：该标记仍会写入真实终端会话的缓冲区（用于边界定位）；如果你希望连终端缓冲区里都不出现，需要再加一个开关完全禁用 boundary 包装。
- [x] 14. 让 boundary 标记不再出现在前端：interact 增加可选开关默认关闭；并在 HTTP `/api/terminals/:id/output` 返回时过滤残留 __CTI_BOUNDARY_* 行（兼容已有被污染会话）
**关键做法**：已彻底移除 boundary 注入：`interact_with_terminal` 不再包 BEGIN/END；同时 `read_CTI` 与 HTTP `/api/terminals/:id/output` 会过滤历史残留的 `__CTI_BOUNDARY_` 行，避免前端/读工具继续看到。并已按脚本完成后端构建+测试通过。
**下次注意**：旧会话缓冲区里仍可能保存 boundary 行（历史数据），但现在所有主要读取路径都会过滤；如需彻底清掉历史，可对相关 terminalId 执行 `read_CTI({resetSession:true,...})`。
- [x] 15. 移除终端读取的 auto/smart 模式：更新 MCP read_CTI / HTTP output / TerminalManager 类型与实现，并更新相关测试与验证脚本
**关键做法**：已从类型/实现/工具 schema 中移除 `auto` 和 `smart` 读取模式：`read_CTI` 仅支持 full/head/tail/head-tail；`interact_with_terminal` 的内部增量读取默认改为 tail；`TerminalManager.readFromTerminal` 也不再识别 auto/smart。并已按后端脚本构建+测试通过。
**下次注意**：这会让历史上依赖 mode=smart/auto 的调用直接报 schema 校验失败；如需要兼容可在 schema 里保留并映射到 tail/head-tail，但你刚明确要“去掉”，所以未做兼容映射。
