<#
.SYNOPSIS
重新加载指定名称的Mcphub服务器

.DESCRIPTION
通过调用本地Mcphub API（http://localhost:1035）的reload接口，重新加载指定名称的服务器实例

.PARAMETER Name
必需参数，指定要重新加载的服务器名称（如CTM）

.EXAMPLE
.\Reload-McphubServer.ps1 -Name 'CTM'
重新加载名为CTM的Mcphub服务器

.NOTES
Author: cheestard
Date: 2025-12-10
API说明：依赖本地运行的Mcphub服务（端口1035）
#>

function Reload-McphubServer {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, HelpMessage="请输入要重新加载的服务器名称（如CTM）")]
        [ValidateNotNullOrEmpty()]
        [string]$Name
    )

    try {
        # 构建API请求URI
        $apiUri = "http://localhost:1035/api/servers/$($Name)/reload"
        
        Write-Host "正在重新加载服务器: $Name" -ForegroundColor Cyan
        Write-Host "请求API地址: $apiUri" -ForegroundColor Gray

        # 发送POST请求到Reload API
        $response = Invoke-RestMethod -Uri $apiUri -Method Post -ErrorAction Stop

        # 处理响应结果
        if ($response) {
            Write-Host "✅ 服务器 $Name 重新加载请求已成功发送" -ForegroundColor Green
            # 如果API有返回数据，输出返回内容
            Write-Host "API返回结果: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
        }
    }
    catch [System.Net.WebException] {
        # 处理网络/API错误
        $errorMessage = $_.Exception.Message
        $statusCode = $_.Exception.Response.StatusCode.value__
        
        Write-Host "❌ 网络错误: 无法连接到Mcphub API" -ForegroundColor Red
        Write-Host "错误代码: $statusCode" -ForegroundColor Red
        Write-Host "错误信息: $errorMessage" -ForegroundColor Red
        exit 1
    }
    catch {
        # 处理其他未知错误
        Write-Host "❌ 未知错误: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# 执行函数（指定要重新加载的服务器名称）
Reload-McphubServer -Name 'CTI'