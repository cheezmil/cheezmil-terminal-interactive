/**
 * Create test terminal "mcphub-main" via backend REST API.
 * 通过后端 REST API 创建测试终端 "mcphub-main"。
 */

const API_BASE = 'http://localhost:1106';

async function main() {
  try {
    const body = {
      terminalName: 'mcphub-main',
      shell: 'pwsh.exe',
      cwd: 'd:\\\\CodeRelated\\\\cheestard-terminal-interactive'
    };

    const res = await fetch(`${API_BASE}/api/terminals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const text = await res.text();
    // Print raw response for debugging / 打印原始响应便于调试
    console.log('Status:', res.status);
    console.log('Body:', text);
  } catch (error) {
    console.error('Failed to create terminal mcphub-main:', error);
  }
}

main();

