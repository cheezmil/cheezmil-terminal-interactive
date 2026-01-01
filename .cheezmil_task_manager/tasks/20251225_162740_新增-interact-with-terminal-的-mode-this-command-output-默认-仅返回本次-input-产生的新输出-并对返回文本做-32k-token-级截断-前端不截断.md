- [x] 1. 定位 mcp-server.ts 的 interact_with_terminal schema/实现与 readFromTerminal 轮询
**关键做法**：用 rg 一次性定位 schema 的 mode 枚举与 write->wait->poll->finalOutput 的关键变量（currentCursor/nextSince/effectiveMode）。
**下次注意**：实现 this_command_output 时要区分：readFromTerminal 的内部 mode vs 对外的 mode 语义。
- [x] 2. 设计 this_command_output：记录写入前 cursor，读取时 since=cursorBeforeWrite 只取增量
**关键做法**：用 `currentCursor` 作为写入前基线 cursor，并把 `nextSince` 初始化为该基线，从而只读到本次新增输出。
**下次注意**：keys/keySequence 同样会触发基线逻辑；如果未来要区分多段写入，可在每段写入前更新基线。
- [x] 3. 实现返回输出截断：限制约 32k token 的可读文本（中间截断+标记 truncated）
**关键做法**：对返回给 MCP 调用方的 `finalOutput` 做中间截断（`MAX_RETURN_CHARS=128000`），并在 `structuredContent.truncated` 标记。
**下次注意**：如果要更贴近 32k token，可把限制改为按 UTF-8 bytes 或可配置环境变量。
- [x] 4. 将工具参数 mode 默认改为 this_command_output，并保持现有 full/tail/head/head-tail/smart 行为
**关键做法**：schema 的 `mode` 枚举新增 `this_command_output`，并把实现侧默认 `mode || 'this_command_output'`。
**下次注意**：无 input 的 read-only 分支仍按 `mode || 'smart'`，避免“默认只看增量”导致读不到历史。
- [x] 5. 运行后端构建/启动脚本链并用 test-mcp-client 冒烟验证
**关键做法**：按后端要求脚本链（build + 后台 ct start + reload + restart MCP + test-mcp-client）验证工具可用。
**下次注意**：如需专门验证默认 mode 行为，可在 test-mcp-client 增加不传 mode 的调用并断言输出非空。
