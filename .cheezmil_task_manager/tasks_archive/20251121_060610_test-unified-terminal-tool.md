# 任务：测试统一终端交互工具

## 任务目标
测试新实现的 `interact_with_terminal` 统一工具，验证其是否能够正确整合 create_terminal、write_terminal 和 read_terminal 的功能。

## 任务列表

- [ ] 1. 测试创建终端功能
- [ ] 2. 测试写入和读取功能
- [ ] 3. 测试智能读取模式
- [ ] 4. 测试友好名称映射
- [ ] 5. 测试不同操作模式
- [ ] 6. 验证工具的完整性和稳定性

## 执行记录

- [x] 1. 测试创建终端功能
  - 成功创建名为 "test-terminal" 的终端
  - 终端ID: 7190c9f9-5abd-464d-8f88-948ff3dc256c
  - PID: 169440
  - Shell: pwsh.exe
  - 工作目录: D:\CodeRelated\cheezmil-terminal-interactive
- [ ] 2-2. 修复友好名称映射逻辑

问题记录：
- 2-1. 友好名称映射问题：当使用friendlyName参数时，工具创建了新终端而不是使用现有的
- [ ] 2-2. 修复友好名称映射逻辑

用户反馈：
- 需要将friendlyName改为terminalName
- 移除terminalId字段
- 只保留interact_with_terminal统一工具，移除其他6个工具
  - 状态: active