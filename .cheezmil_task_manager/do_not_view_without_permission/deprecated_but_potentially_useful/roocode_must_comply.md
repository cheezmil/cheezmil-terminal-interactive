# 必须遵守的规则

## 在执行任何操作前必须更改任务列表，然后再依据任务列表进行下一步的操作。在进行下一步前必须把刚才的操作记录进去才能执行下一步！如果用户没有明确表示，一般是新建一个任务列表来记录。

## 禁止用powershell.exe ，要用pwsh.exe。

## 不能更换任何镜像源！不能设置代理！

## 务必使用系统提示词自带的use_mcp_tool来调用MCP工具。注意在mcphub中用MCP工具，比如：
<use_mcp_tool>
<server_name>mcphub</server_name>
<tool_name>MCP工具的名称</tool_name>
<arguments>

</arguments>
</use_mcp_tool>


## 禁止在linux中执行ps1脚本，100%报错。请在pwsh执行powershell脚本。

## 务必使用项目中启动脚本来启动项目，禁止直接输入命令来启动项目。若没有脚本则询问我是否要创建。

## 若你要删掉node_moudules和package-lock.json，务必参考D:\CodeRelated\ElectronProjects\xdx_toolbox\start_fe_install_xdx_toolbox.mjs是怎么写的，然后带上参数来直接删除node_moudules和package-lock.json。

## 当出现错误后，用你自身的能力进行尝试更改一次次，若还是报错，就必须用mcp工具exa上网搜索解决办法再修正，有时候mcp工具会请求失败所以至少要尝试8次直到请求成功。