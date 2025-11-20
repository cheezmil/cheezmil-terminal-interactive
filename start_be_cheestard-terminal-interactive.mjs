import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

// 检查 Node.js 版本并在Windows自动切换
function checkNodeVersion() {
  const requiredVersion = '20.19.5';
  const currentVersion = process.version;
  
  if (currentVersion !== `v${requiredVersion}`) {
    console.log(`当前 Node.js 版本: ${currentVersion}，推荐版本: v${requiredVersion}`);
    
    if (process.platform === 'win32') {
      console.log('Windows系统正在自动切换到正确的 Node.js 版本...');
      try {
        execSync('fnm use 20.19.5', { stdio: 'inherit' });
        console.log(`已切换到 Node.js v${requiredVersion}`);
      } catch (fnmError) {
        console.error('自动切换版本失败，请手动运行: fnm use 20.19.5');
        console.log('继续使用当前版本可能会遇到兼容性问题...');
      }
    } else {
      console.log('Linux/macOS用户无需强制版本要求，继续使用当前版本');
      console.log('如需切换版本，请手动运行: fnm use 20.19.5');
    }
  } else {
    console.log(`Node.js 版本正确: ${currentVersion}`);
  }
  
  return true;
}

// 检查版本并继续执行
checkNodeVersion();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_DIR = path.resolve(__dirname);

// Load environment variables from .env file
function loadEnvConfig() {
  const envPath = path.join(__dirname, '.env');
  const defaultConfig = {
    MCP_PORT: 1106,
    FRONTEND_PORT: 1107
  };
  
  try {
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, 'utf-8');
      const envLines = envContent.split('\n');
      const config = { ...defaultConfig };
      
      envLines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          if (key && valueParts.length > 0) {
            config[key.trim()] = valueParts.join('=').trim();
          }
        }
      });
      
      return config;
    }
  } catch (error) {
    console.warn('Warning: Could not load .env file, using default ports:', error.message);
  }
  
  return defaultConfig;
}

const config = loadEnvConfig();
const PORT = parseInt(config.MCP_PORT) || 1106;

// Execute command helper function
function execCommand(command) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, [], {
            shell: true,
            stdio: 'pipe',
            encoding: 'utf8'
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`Command execution failed, exit code: ${code}\nError: ${stderr}`));
            }
        });
        
        child.on('error', (err) => {
            reject(err);
        });
    });
}

// 跨平台进程终止函数
async function killProcess(pid) {
    const command = process.platform === 'win32'
        ? `taskkill /PID ${pid} /F`
        : `kill -9 ${pid}`;
    
    return execCommand(command);
}

// 跨平台进程查找函数
async function findNodeProcesses() {
    let command, output;
    
    if (process.platform === 'win32') {
        // Windows: 使用wmic
        command = 'wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /format:csv';
        output = await execCommand(command);
        return parseWmicOutput(output);
    } else {
        // Linux/macOS: 使用ps
        command = 'ps aux | grep node';
        output = await execCommand(command);
        return parsePsOutput(output);
    }
}

// 解析Windows wmic输出
function parseWmicOutput(output) {
    const lines = output.split('\n').filter(line => line.trim());
    const processes = [];
    
    // 跳过标题行，只处理包含逗号的数据行
    const dataLines = lines.filter(line => !line.includes('Node,CommandLine,ProcessId') && line.includes(','));
    
    for (const line of dataLines) {
        const parts = line.split(',');
        if (parts.length >= 3) {
            const commandLine = parts[1];
            const processId = parts[2].trim();
            
            if (commandLine && processId) {
                processes.push({
                    pid: parseInt(processId),
                    commandLine: commandLine
                });
            }
        }
    }
    
    return processes;
}

// 解析Linux/macOS ps输出
function parsePsOutput(output) {
    const lines = output.split('\n').filter(line => line.trim() && !line.includes('grep'));
    const processes = [];
    
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
            const pid = parseInt(parts[1]);
            const commandLine = parts.slice(10).join(' '); // 从第10列开始是命令行
            
            if (pid && commandLine) {
                processes.push({
                    pid: pid,
                    commandLine: commandLine
                });
            }
        }
    }
    
    return processes;
}

// Find and terminate backend related processes
async function killBackendProcesses() {
    try {
        console.log('Searching for backend processes occupying the port...');
        
        // Get current process ID to avoid killing ourselves
        const currentPid = process.pid;
        
        // 跨平台查找node进程
        const processes = await findNodeProcesses();
        
        // 过滤出相关的后端进程
        const backendProcesses = processes.filter(process => {
            return parseInt(process.pid) !== currentPid && (
                process.commandLine.includes('dist/http-server.js') ||
                process.commandLine.includes('node') && process.commandLine.includes('dist/http-server.js') ||
                process.commandLine.includes('start_be_cheestard-terminal-interactive.mjs') ||
                process.commandLine.includes(`:${PORT}`) ||
                process.commandLine.includes('cheestard-terminal-interactive')
            );
        });
        
        if (backendProcesses.length > 0) {
            console.log(`Found ${backendProcesses.length} related processes, terminating...`);
            
            // 并发终结所有进程
            const terminatePromises = backendProcesses.map(async (process) => {
                try {
                    console.log(`Terminating process PID: ${process.pid}`);
                    console.log(`Command line: ${process.commandLine.substring(0, 100)}...`);
                    
                    await killProcess(process.pid);
                    console.log(`Process ${process.pid} terminated successfully`);
                    return { pid: process.pid, success: true };
                } catch (error) {
                    console.error(`Failed to terminate process ${process.pid}:`, error.message);
                    return { pid: process.pid, success: false, error: error.message };
                }
            });
            
            // 等待所有进程终结完成
            const results = await Promise.all(terminatePromises);
            
            // 统计结果
            const successCount = results.filter(r => r.success).length;
            const failureCount = results.length - successCount;
            
            console.log(`Process termination completed: ${successCount} successful, ${failureCount} failed`);
            
            // Wait a moment for processes to fully exit
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            console.log('No related processes found occupying the port');
        }
        
    } catch (error) {
        console.error('Error finding or terminating processes:', error.message);
    }
}

async function startBackend() {
  try {
    // Terminate old backend processes
    await killBackendProcesses();
    
    console.log('Starting backend server...');

    // Start the backend server in HTTP mode for mcphub compatibility
    const backendProcess = spawn('node', ['dist/http-server.js'], {
      cwd: PROJECT_DIR,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        MCP_PORT: PORT,
      }
    });

    backendProcess.on('close', (code) => {
      if (code === 0) {
        console.log('Backend server stopped successfully.');
      } else {
        console.error(`Backend server exited with code ${code}`);
      }
      process.exit(code);
    });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend server:', err);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('Error during startup:', error);
    process.exit(1);
  }
}

startBackend().catch(console.error);