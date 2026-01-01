- [x] 1. 移除终端tab里显示的shell元素（pwsh.exe）
**关键解决方法**：前端：移除终端tab里shell显示；DELETE终止终端不再发送空JSON Content-Type；新增复制图标复制终端ID；调整历史输出加载与WS连接顺序避免覆盖；设置页保存不再因v-if卸载滚动容器。
- [x] 2. 修复终止终端DELETE 400（空JSON body）
**关键解决方法**：前端：移除终端tab里shell显示；DELETE终止终端不再发送空JSON Content-Type；新增复制图标复制终端ID；调整历史输出加载与WS连接顺序避免覆盖；设置页保存不再因v-if卸载滚动容器。
- [x] 3. 在tab新增复制图标复制终端名称
**关键解决方法**：前端：移除终端tab里shell显示；DELETE终止终端不再发送空JSON Content-Type；新增复制图标复制终端ID；调整历史输出加载与WS连接顺序避免覆盖；设置页保存不再因v-if卸载滚动容器。
- [x] 4. 排查并修复xterm渲染覆盖/换行问题
**关键解决方法**：前端：移除终端tab里shell显示；DELETE终止终端不再发送空JSON Content-Type；新增复制图标复制终端ID；调整历史输出加载与WS连接顺序避免覆盖；设置页保存不再因v-if卸载滚动容器。
- [x] 5. 保存设置后保持页面滚动位置不变
**关键解决方法**：前端：移除终端tab里shell显示；DELETE终止终端不再发送空JSON Content-Type；新增复制图标复制终端ID；调整历史输出加载与WS连接顺序避免覆盖；设置页保存不再因v-if卸载滚动容器。
- [x] 6. 后端强制执行黑名单命令过滤（如 Write-Host）
**关键解决方法**：前端：移除终端tab里shell显示；DELETE终止终端不再发送空JSON Content-Type；新增复制图标复制终端ID；调整历史输出加载与WS连接顺序避免覆盖；设置页保存不再因v-if卸载滚动容器。
- [x] 7. 检测终端进入交互/忙碌状态并对MCP返回提示
**关键解决方法**：前端：移除终端tab里shell显示；DELETE终止终端不再发送空JSON Content-Type；新增复制图标复制终端ID；调整历史输出加载与WS连接顺序避免覆盖；设置页保存不再因v-if卸载滚动容器。
- [x] 8. 按规定脚本构建/启动前后端并用chrome_console检查
**关键解决方法**：前端：移除终端tab里shell显示；DELETE终止终端不再发送空JSON Content-Type；新增复制图标复制终端ID；调整历史输出加载与WS连接顺序避免覆盖；设置页保存不再因v-if卸载滚动容器。
- [x] 9. 检查并修复前端toast的i18n键/文案不一致问题
**关键解决方法**：修复toast使用的i18n key不一致（terminalDeleted/deleteTerminalError -> terminalTerminated/terminateTerminalError），并将只读模式/后端API初始化失败/设置页加载保存重置失败等toast改为统一走i18n；补齐zh/en对应messages文案；已按要求重新build前端并通过chrome_console确认无异常。
- [x] 10. 从config.example.yml与config.yml移除app.name与app.version字段
**关键解决方法**：已从`config.example.yml`与`config.yml`的`app`段落中移除`name`与`version`字段，保留其余配置结构不变。
