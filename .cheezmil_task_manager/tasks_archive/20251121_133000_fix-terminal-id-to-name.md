### 任务：修复所有文件中的 terminalId 到 terminalName 的迁移

- [x] 1. 修复 mcp-server.ts 中的错误
- [x] 2. 修复 terminal-manager.ts 中的错误
- [x] 3. 修复 rest-api.ts 中的错误
- [x] 4. 修复 web-ui-server.ts 中的错误
- [x] 5. 修复所有 examples 文件中的错误
- [x] 6. 删除不需要的 examples 文件，只保留指定的4个
- [x] 7. 编译后端代码验证修复
  - 关键解决方法：修复了 TypeScript 类型错误，包括 CreateTerminalInput 类型不匹配和 TerminalError 属性问题
- [x] 8. 重启后端服务测试功能
- [x] 9. 测试 interact_with_terminal 工具功能
  - 出错：终端 "test-terminal" 不存在，需要修复 interact_with_terminal 工具
- [x] 9-1. 修复 interact_with_terminal 工具中的参数传递问题
  - 关键解决方法：移除了 createTerminalResponse 中不存在的 terminalName 参数
- [x] 9-2. 按照正确流程重启后端服务使代码生效
  - 关键解决方法：通过服务器管理页面禁用/启用服务，然后执行 restart_roocode_mcp.ps1
- [ ] 9-3. 重新测试 interact_with_terminal 工具功能
  - 出错：工具还是生成了 ID，而不是要求必须传入 terminalName
- [x] 9-4-1. 修复语法错误（多余的闭合大括号）
  - 关键解决方法：移除第597行多余的闭合大括号，修复语法错误
- [x] 9-4-2. 确保interact_with_terminal工具正确验证terminalName参数
  - 关键解决方法：在interact_with_terminal工具中添加严格的terminalName验证，如果不提供则抛出错误
- [x] 9-4. 修改 interact_with_terminal 工具，必须传入 terminalName 参数
  - 关键解决方法：简化工具描述，移除冗长的说明文字，只保留核心功能描述
- [x] 9-5. 重新编译和重启服务
- [x] 9-6. 最终测试 interact_with_terminal 工具功能
- [x] 9-7. 发现MCP服务器连接问题，需要重新启动服务
  - 出错：Error: Server not found: CTI_interact_with_terminal
- [x] 9-8. 重新启动后端服务
  - 关键解决方法：执行完整的重启流程，包括编译、重启服务和刷新MCP连接
- [ ] 10. 验证MCP服务器连接和工具可用性

#### 出错：
- 修改文件时破坏了代码结构，导致多个TypeScript编译错误
- 关键解决方法：重新整理interact_with_terminal工具的完整实现，确保所有语法正确