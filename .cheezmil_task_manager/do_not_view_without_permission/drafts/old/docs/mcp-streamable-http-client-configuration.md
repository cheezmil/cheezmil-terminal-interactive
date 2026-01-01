# MCP Streamable HTTP 客户端配置指南

## 概述

本项目已从 stdio 传输方式迁移到 Streamable HTTP 传输方式，提供了更好的网络兼容性和会话管理能力。

## 服务器配置

### 环境变量配置

在项目根目录创建 `.env` 文件，配置以下变量：

```bash
# MCP Streamable HTTP 服务器端口
MCP_PORT=1106

# 前端端口
FRONTEND_PORT=1107
```

### 启动服务器

```bash
# 启动 Streamable HTTP MCP 服务器
node dist/http-server.js
```

服务器将在 `http://localhost:1106` 启动，并提供以下端点：
- `POST /mcp` - MCP 请求处理
- `GET /mcp` - 服务器到客户端通信
- `DELETE /mcp` - 会话清理
- `GET /health` - 健康检查

## 客户端配置

### Claude Desktop 配置

在 Claude Desktop 的 `claude_desktop_config.json` 文件中配置：

```json
{
  "mcpServers": {
    "cheezmil-terminal-interactive": {
      "transport": "streamable_http",
      "url": "http://localhost:1106/mcp",
      "headers": {
        "Content-Type": "application/json"
      }
    }
  }
}
```

### 其他 MCP 客户端配置

对于其他支持 Streamable HTTP 的 MCP 客户端，使用以下配置：

```javascript
{
  "transport": "streamable_http",
  "endpoint": "http://localhost:1106/mcp",
  "options": {
    "timeout": 30000,
    "reconnect": true,
    "maxRetries": 3
  }
}
```

## 功能特性

### 会话管理

- 自动生成唯一会话 ID
- 支持多客户端并发连接
- 会话状态持久化
- 自动清理过期会话

### 安全特性

- DNS 重绑定保护
- 主机白名单验证（仅允许 localhost 和 127.0.0.1）
- 请求头验证

### 错误处理

- 详细的错误日志记录
- 优雅的错误恢复
- 连接状态监控

## 故障排除

### 常见问题

1. **连接被拒绝**
   - 确保服务器正在运行
   - 检查端口 1106 是否被占用
   - 验证防火墙设置

2. **会话超时**
   - 检查网络连接稳定性
   - 调整客户端超时设置
   - 查看服务器日志

3. **权限错误**
   - 确保客户端有访问 localhost 的权限
   - 检查主机白名单配置

### 调试模式

启用调试日志：

```bash
export MCP_DEBUG=true
node dist/http-server.js
```

## 迁移指南

### 从 stdio 迁移

如果您之前使用 stdio 传输方式，请按以下步骤迁移：

1. 更新客户端配置，将 `stdio` 改为 `streamable_http`
2. 添加 `url` 配置指向 `http://localhost:1106/mcp`
3. 移除 `command` 和 `args` 配置
4. 测试连接和功能

### 配置对比

**旧配置 (stdio):**
```json
{
  "mcpServers": {
    "cheezmil-terminal-interactive": {
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}
```

**新配置 (streamable_http):**
```json
{
  "mcpServers": {
    "cheezmil-terminal-interactive": {
      "transport": "streamable_http",
      "url": "http://localhost:1106/mcp"
    }
  }
}
```

## 性能优化

### 建议配置

- 使用 HTTP/2 以提高性能
- 启用连接池
- 配置适当的超时时间
- 监控内存使用情况

### 负载均衡

对于高并发场景，可以配置负载均衡器：

```nginx
upstream mcp_backend {
    server localhost:1106;
    # 可以添加更多服务器实例
}

server {
    listen 80;
    location /mcp {
        proxy_pass http://mcp_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 技术支持

如遇到问题，请：

1. 查看服务器日志
2. 检查网络连接
3. 验证配置文件
4. 提交 Issue 到项目仓库

---

**注意**: Streamable HTTP 是 MCP 协议的新特性，确保您的客户端版本支持此传输方式。