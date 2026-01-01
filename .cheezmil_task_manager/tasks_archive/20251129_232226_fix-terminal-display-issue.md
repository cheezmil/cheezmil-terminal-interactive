- [x] 1. 检查前端首页代码，了解终端列表的显示逻辑
- [x] 2. 检查后端API，确认终端管理相关的接口
- [x] 3. 检查CTI创建的终端是否正确注册到系统中
- [x] 4. 修复终端在首页不显示的问题
- [ ] 5. 测试修复后的功能
- [x] 4-1. 问题分析：CTI创建的终端和后端API的终端是分开管理的，需要统一管理
- [x] 4-2. 修复前端访问问题：http://127.0.0.1:1107/ 访问不了，但 http://localhost:1107/ 可以
- [ ] 5-1. 修复WebSocket连接问题：前端WebSocket仍使用127.0.0.1而非localhost

**问题分析：**
通过检查代码发现，MCP服务器中的TerminalManager和后端API中的TerminalManager是两个独立的实例，这导致CTI创建的终端无法在后端API中显示。

**修复方案：**
1. 创建一个共享的TerminalManager实例，让MCP服务器和后端API都使用同一个实例来管理终端
2. 修改前端API服务，使用localhost替代127.0.0.1，解决访问问题
3. 修复前端WebSocket连接，将127.0.0.1改为localhost

**已完成的修改：**
1. 修改了src/http-server.ts，将TerminalManager实例存储到全局变量中
2. 修改了src/mcp-server.ts，让MCP服务器使用共享的TerminalManager实例
3. 修改了frontend/src/services/api-service.ts，将所有127.0.0.1替换为localhost