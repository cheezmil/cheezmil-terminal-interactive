/**
 * Send a test PowerShell command to terminal "mcphub-main".
 * 向终端 "mcphub-main" 发送测试 PowerShell 命令。
 */

const API_BASE = 'http://localhost:1106';

async function main() {
  try {
    const res = await fetch(`${API_BASE}/api/terminals/mcphub-main/input`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: 'Write-Host "Hello PWSH!"',
        appendNewline: true
      })
    });

    const text = await res.text();
    // Print raw response for debugging / 打印原始响应便于调试
    console.log('Status:', res.status);
    console.log('Body:', text);
  } catch (error) {
    console.error('Failed to send Write-Host to mcphub-main:', error);
  }
}

main();

