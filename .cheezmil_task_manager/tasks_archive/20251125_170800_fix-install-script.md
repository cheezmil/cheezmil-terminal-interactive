- [x] 1. 分析现有的start_install.mjs脚本
    - [x] 1-1. 检查脚本是否包含前端安装逻辑
    - [x] 1-2. 对比start_be_cheezmil-terminal-interactive.mjs和start_fe_cheezmil-terminal-interactive.mjs中的进程终止逻辑
    - [x] 1-3. 确定需要在安装脚本中添加的进程终止功能

- [x] 2. 修正start_install.mjs脚本
    - [x] 2-1. 添加前端安装逻辑确认
    - [x] 2-2. 添加进程终止功能（参考其他启动脚本的实现）
    - [x] 2-3. 确保在删除node_modules之前先终止相关进程
    - [x] 2-4. 测试修正后的安装脚本

- [x] 3. 验证脚本功能
    - [x] 3-1. 测试安装脚本能正确终止前后端进程
    - [x] 3-2. 测试安装脚本能正确删除node_modules
    - [x] 3-3. 测试安装脚本能正确安装前后端依赖