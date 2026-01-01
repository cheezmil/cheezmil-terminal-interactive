- [x] 1. 读取README-ZH.md文件内容
- [x] 2. 将README-ZH.md翻译成英文README.md
- [x] 3. 保持原文结构和意思不变
- [x] 4. 清理config.example.yml与config.yml中的多余language字段（避免重复/被自动回填）
**关键解决方法**：已确认`config.example.yml`与`config.yml`存在重复language字段（根级language与app.language），现已移除根级language并统一仅保留`app.language`；同时修正前端设置页/设置store不再写入根级language并自动迁移旧字段，后端默认配置也不再回填多余字段。
- [x] 5. 访问 /settings 时后端重载 config.yml（让外部修改立即生效）
**关键解决方法**：新增后端`GET /api/settings/reload`从磁盘重载config.yml（并同步DISABLED_TOOLS）；前端设置页进入时调用该接口后再拉取配置，确保外部修改立即生效；同时补充`settings.reload`默认路径与`no-store`获取API docs，避免端点缓存问题。
