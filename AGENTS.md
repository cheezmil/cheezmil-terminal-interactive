

---


## 技术栈
### 前端必须用vue3，shadcn-vue，pinia，xtermjs
### 后端必须用fastify
### 代码文件必须使用中英文双语注释！！！终端输出只需要英文即可。
### 注意i18n的更改。
### 禁止写黑名单命令的任何测试脚本！！！黑名单命令极其危险，不能测试！！！

## 本项目禁止用CTI工具执行脚本！！！！！！！！！！！！！！！！！！！！！！！！！因为它就是CTI项目的源码!用CTI执行它自己是会出错的，你得用你系统提示词自带的其他执行命令的函数。

## 每次修改完前端代码必须做的事情：
必须只能用excute_command或shell_command执行：
```bash
node start_build_fe_cheezmil-terminal-interactive.mjs; ct start -- node start_fe_cheezmil-terminal-interactive.mjs
```
执行这些脚本不需要记录在任务列表中。
注意区分./和node前缀区别。

然后通过mcphub-chrome-mcp调用chrome_console检查是否有报错啊！chrome_get_web_content工具获取htmlContent从而检查页面的样式啊，注意刷新网页，因为有缓存！
注意刷新{
  "refresh": true
}
否则前端的更改不会生效

## 每次修改完后端代码必须做的事情：
必须只能用excute_command或shell_command执行：
先
```bash
node start_build_be_cheezmil-terminal-interactive.mjs
```
然后
```bash
ct start -- node start_be_cheezmil-terminal-interactive.mjs; Start-Sleep -Seconds 30; & 'D:\CodeRelated\cheezmil-terminal-interactive\reload_mcphub_CTI.ps1'; & 'D:\CodeRelated\cheezmil-terminal-interactive\restart_roocode_mcp.ps1'; node src/tests/test-mcp-client.mjs
```
执行这些脚本不需要记录在任务列表中。
注意区分./和node前缀区别。
若你不执行，后端的代码修改是不会生效的，白修改了。
禁止使用其他方式启动后端，必须这样执行脚本才行，若后端代码有修改影响了启动脚本则需要修正启动脚本。

## 禁止盲目执行npm run dev，npm run build，npm install，不是让你不安装依赖，而是我已经给你写好了一些脚本你没看见嘛？必须用我写好的来install依赖。

## 前端端口1107，后端端口1106，是不会变的。

## 遇到你不懂的问题务必用mcphub exa搜解决办法啊！

## 不准运行前端dev服务器啊！必须运行的是前端编译的产物啊！

## chrome-mcp_chrome_inject_script是用来找到错误的，它可能能解决问题，但是不能不修改项目源码啊，用它找到问题后务必修改源码，而不是任务完成。

## 禁止用chrome-mcp进行网络搜索，否则会崩溃！

## cd frontend && echo y | npx shadcn-vue@latest add 来添加shadcn-vue的某些组件。

## 若出问题了，请查看start_be_cheezmil-terminal-interactive.log
start_fe_cheezmil-terminal-interactive.log这两个文件的日志，自行查看日志并修正代码。

## 注意你写的代码需要跨平台兼容。

## 不管后端和MCP工具如何截断消息返回给MCP客户端，都不能让前端截断显示终端的输出内容，这点非常重要！！

## 用户提出什么功能，你就必须修正或新增对应的测试脚本。

## 未经允许不准更改我的任何README！

## 未经允许禁止执行任何git命令。

## 若config.yml新增了新的东西，config.example.yml必须同步更改，否则问题很严重。
