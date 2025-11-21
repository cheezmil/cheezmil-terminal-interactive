# Restart RooCode MCP Script
# 用于重启RooCode MCP的PowerShell脚本
# Restart RooCode MCP PowerShell Script

# 获取RooCode的用户配置目录路径
# Get RooCode user config directory path
$userConfigPath = "$env:APPDATA\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings"

# 定义RooCode MCP设置文件路径
# Define RooCode MCP settings file paths
$mcpSettingsFile = Join-Path $userConfigPath "mcp_settings.json"
$mcpSettingsStartFile = Join-Path $userConfigPath "mcp_settings_for_start.json"
$mcpSettingsStopFile = Join-Path $userConfigPath "mcp_settings_for_stop.json"
# 检查RooCode MCP必要的文件是否存在
# Check if necessary RooCode MCP files exist
if (-not (Test-Path $mcpSettingsFile)) {
    Write-Host "错误：找不到RooCode MCP设置文件 $mcpSettingsFile" -ForegroundColor Red
    Write-Host "Error: RooCode MCP settings file not found $mcpSettingsFile" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $mcpSettingsStopFile)) {
    Write-Host "错误：找不到RooCode MCP停止设置文件 $mcpSettingsStopFile" -ForegroundColor Red
    Write-Host "Error: RooCode MCP stop settings file not found $mcpSettingsStopFile" -ForegroundColor Red
    exit 1
}

# 步骤1：备份当前的RooCode MCP设置
# Step 1: Backup current RooCode MCP settings
Write-Host "步骤1：备份当前RooCode MCP设置..." -ForegroundColor Yellow
Write-Host "Step 1: Backing up current RooCode MCP settings..." -ForegroundColor Yellow
try {
    Copy-Item $mcpSettingsFile $mcpSettingsStartFile -Force
    Write-Host "RooCode MCP设置备份成功完成" -ForegroundColor Green
    Write-Host "RooCode MCP settings backup completed successfully" -ForegroundColor Green
}
catch {
    Write-Host "RooCode MCP设置备份失败: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "RooCode MCP settings backup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 步骤2：应用RooCode MCP停止设置（停止MCP服务）
# Step 2: Apply RooCode MCP stop settings (stop MCP service)
Write-Host "步骤2：应用RooCode MCP停止设置..." -ForegroundColor Yellow
Write-Host "Step 2: Applying RooCode MCP stop settings..." -ForegroundColor Yellow
try {
    Copy-Item $mcpSettingsStopFile $mcpSettingsFile -Force
    Write-Host "RooCode MCP停止设置应用成功" -ForegroundColor Green
    Write-Host "RooCode MCP stop settings applied successfully" -ForegroundColor Green
}
catch {
    Write-Host "应用RooCode MCP停止设置失败: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Failed to apply RooCode MCP stop settings: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 步骤3：等待1秒（确保MCP服务完全停止）
# Step 3: Wait 1 seconds (ensure MCP service is fully stopped)
Write-Host "步骤3：等待秒确保RooCode MCP完全停止..." -ForegroundColor Yellow
Write-Host "Step 3: Waiting 1 seconds to ensure RooCode MCP is fully stopped..." -ForegroundColor Yellow
Start-Sleep -Seconds 1

# 步骤4：恢复原始的RooCode MCP设置（重启MCP服务）
# Step 4: Restore original RooCode MCP settings (restart MCP service)
Write-Host "步骤4：恢复原始RooCode MCP设置（重启MCP服务）..." -ForegroundColor Yellow
Write-Host "Step 4: Restoring original RooCode MCP settings (restart MCP service)..." -ForegroundColor Yellow
try {
    Copy-Item $mcpSettingsStartFile $mcpSettingsFile -Force
    Write-Host "RooCode MCP设置恢复成功，MCP服务已重启" -ForegroundColor Green
    Write-Host "RooCode MCP settings restored successfully, MCP service restarted" -ForegroundColor Green
}
catch {
    Write-Host "恢复RooCode MCP设置失败: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Failed to restore RooCode MCP settings: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "RooCode MCP重启完成！" -ForegroundColor Cyan
Write-Host "RooCode MCP restart completed!" -ForegroundColor Cyan