- [x] 1. 分析当前架构问题：Fastify和StreamableHTTP服务器分离运行
- [x] 2. 设计解决方案：将StreamableHTTP服务器内嵌到Fastify中

## 解决方案设计：
1. 修改 `src/http-server.ts`，将 `src/web-interface.ts` 中的WebSocket功能集成进去
2. 确保只有一个Fastify服务器实例运行在端口1106
3. 让MCP StreamableHTTP和WebSocket功能在同一个服务器中协同工作
4. 启动脚本 `start_be_cheezmil-terminal-interactive.mjs` 已经正确启动 `dist/http-server.js`

## 实现步骤：
1. 在 `src/http-server.ts` 中添加WebSocket支持
2. 将 `src/web-interface.ts` 中的API路由和WebSocket功能迁移到 `src/http-server.ts`
3. 确保静态文件服务和前端路由正常工作
4. 测试MCP协议和WebSocket功能是否协同工作
- [ ] 3. 实现WebSocket功能与MCP StreamableHTTP的集成
- [x] 3-1. 修改src/http-server.ts，添加WebSocket支持和静态文件服务
- [x] 3-2. 将web-interface.ts中的API路由迁移到http-server.ts
- [ ] 3-3. 测试服务器启动和基本功能
- [ ] 3-3-1. 修复静态文件服务路由冲突问题

**完成的工作：**
1. 已将WebSocket功能集成到src/http-server.ts中
2. 已将web-interface.ts中的所有API路由迁移到http-server.ts
3. 添加了静态文件服务支持
4. 确保只有一个Fastify服务器实例运行在端口1106

**发现的问题：**
- 静态文件服务路由冲突：Method 'HEAD' already declared for route '/*'
- 这是因为我们注册了多个静态文件服务，导致路由冲突

下一步：修复路由冲突问题
- [ ] 4. 测试终端连接和WebSocket通信
- [ ] 5. 验证前端能够正常显示终端内容

## 分析结果：
当前架构问题：
- `src/http-server.ts` 中有一个独立的Fastify服务器，运行在端口1106
- `src/web-interface.ts` 中有另一个独立的Fastify服务器，也尝试运行在端口1106
- StreamableHTTP服务器通过 `/mcp` 路由提供MCP协议支持
- WebSocket服务器通过 `/ws` 路由提供实时通信
- 两个服务器独立运行，导致资源冲突和功能无法协同工作

解决方案：
1. 将 `src/web-interface.ts` 中的WebSocket功能集成到 `src/http-server.ts` 中
2. 确保只有一个Fastify服务器实例运行在端口1106
3. 让MCP StreamableHTTP和WebSocket功能在同一个服务器中协同工作