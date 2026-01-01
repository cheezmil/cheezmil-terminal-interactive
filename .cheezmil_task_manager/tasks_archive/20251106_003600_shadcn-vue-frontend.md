- [x] 1. 搜索shadcn-vue的使用方法和文档
- [x] 2. 检查项目当前的shadcn-vue配置和安装状态
- [x] 3. 分析现有前端代码结构，确定需要改造的部分
- [x] 4. 添加更多shadcn-vue组件到项目中
- [x] 5. 重构现有前端代码使用shadcn-vue组件
- [x] 6. 测试改造后的前端功能
- [x] 7. 修正启动脚本中的fnm use命令
- [x] 8. 修复前端启动时的tw-animate-css导入错误
- [x] 9. 使用chrome-mcp访问http://localhost:1106/检查是否有其他报错
    - 出错：MCP连接在截图时断开，但确认前端服务在端口1106正常运行
    - 发现问题：HTML中有<vite-error-overlay>元素，表明Vite检测到错误但未显示
- [x] 10. 检查并修复前端组件导入错误
    - 关键解决方法：修复了两个问题：
    1. HomeScreen.vue中的Sonner组件导入不匹配，改为import { Toaster as Sonner }
    2. tsconfig.app.json缺少路径别名配置，添加了baseUrl和paths配置
- [ ] 11. 重新检查网页确认修复效果