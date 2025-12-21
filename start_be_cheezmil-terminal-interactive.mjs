import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import moduleLoader, { importModule } from './start_assist_load_npm_global_package.mjs';

// 在ES模块中创建require函数
const require = createRequire(import.meta.url);

// 动态加载iconv-lite模块
let iconv = null;
try {
    iconv = importModule('iconv-lite');
    console.log('✅ iconv-lite loaded successfully via dynamic module loader');
} catch (error) {
    console.log('Warning: iconv-lite not available, Chinese error messages may not display correctly');
}

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

// 检查并复制.env文件（如果不存在）
function ensureEnvFile() {
  const envPath = path.join(__dirname, '.env');
  const envExamplePath = path.join(__dirname, '.env.example');
  
  if (!existsSync(envPath)) {
    if (existsSync(envExamplePath)) {
      try {
        const fs = require('fs');
        fs.copyFileSync(envExamplePath, envPath);
        console.log('✅ 已从.env.example复制创建.env文件');
      } catch (error) {
        console.warn('Warning: Could not copy .env.example to .env:', error.message);
      }
    } else {
      console.warn('Warning: .env.example file not found');
    }
  }
}

// Load environment variables from .env file
function loadEnvConfig() {
  // 首先确保.env文件存在
  ensureEnvFile();
  
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

// 为 MCP 工具禁用配置提供环境变量支持 / Provide environment variable support for disabling specific MCP tools
// 当前仅用于控制「选择 MCP 服务器」相关工具是否启用 / Currently used only to control whether MCP server selection tools are enabled

// Execute command helper function
function execCommand(command) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, [], {
            shell: true,
            stdio: 'pipe',
            encoding: 'utf8',
            env: {
                ...process.env,
                // 设置Windows控制台编码为UTF-8
                PYTHONIOENCODING: 'utf-8',
                LANG: 'zh_CN.UTF-8',
                LC_ALL: 'zh_CN.UTF-8',
                CHCP: '65001' // 设置Windows控制台代码页为UTF-8
            }
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
            stdout += data.toString('utf8');
        });
        
        child.stderr.on('data', (data) => {
            stderr += data.toString('utf8');
        });
        
        child.on('close', (code) => {
            // 尝试修复Windows系统错误信息的编码问题
            let fixedStderr = stderr;
            if (process.platform === 'win32' && stderr && iconv) {
                try {
                    // 方法1: 尝试多种编码方式解码
                    const encodings = ['gbk', 'cp936', 'gb2312', 'big5'];
                    let decodedSuccessfully = false;
                    
                    for (const encoding of encodings) {
                        try {
                            // 创建一个新的Buffer尝试解码
                            const buffer = Buffer.from(stderr, 'binary');
                            const decoded = iconv.decode(buffer, encoding);
                            
                            // 检查解码结果是否包含中文字符且没有乱码
                            if (/[\u4e00-\u9fff]/.test(decoded) && !/[��]/.test(decoded)) {
                                fixedStderr = decoded;
                                console.log(`✅ Successfully decoded Windows error message from ${encoding.toUpperCase()} to UTF-8`);
                                decodedSuccessfully = true;
                                break;
                            }
                        } catch (encodingError) {
                            // 继续尝试下一种编码
                            continue;
                        }
                    }
                    
                    // 方法2: 如果所有编码都失败，尝试修复部分乱码
                    if (!decodedSuccessfully) {
                        try {
                            // 尝试逐个字符修复
                            const buffer = Buffer.from(stderr, 'binary');
                            const gbkDecoded = iconv.decode(buffer, 'gbk');
                            
                            // 替换常见的乱码字符
                            const cleaned = gbkDecoded
                                .replace(/[��]/g, '错误')
                                .replace(/[��]/g, '进程')
                                .replace(/[��]/g, '终止')
                                .replace(/[��]/g, '无法')
                                .replace(/[��]/g, '找到')
                                .replace(/[��]/g, '权限');
                                
                            if (cleaned !== gbkDecoded) {
                                fixedStderr = cleaned;
                                console.log('✅ Partially fixed Windows error message encoding');
                            }
                        } catch (e3) {
                            console.log('Warning: Could not decode Windows error message, using original');
                        }
                    }
                } catch (e) {
                    console.log('Warning: Error during encoding conversion, using original error message');
                }
            } else if (process.platform === 'win32' && stderr && !iconv) {
                console.log('Warning: iconv-lite not available, Chinese error messages may not display correctly');
            }
            
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`Command execution failed, exit code: ${code}\nError: ${fixedStderr}`));
            }
        });
        
        child.on('error', (err) => {
            reject(err);
        });
    });
}

// 跨平台进程终止函数 - 优雅终止
async function killProcess(pid, graceful = true) {
    try {
        if (process.platform === 'win32') {
            // Windows: 先尝试优雅终止，再强制终止
            if (graceful) {
                await execCommand(`taskkill /PID ${pid} /T`);
                // 等待一段时间让进程优雅退出
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            // 强制终止
            return await execCommand(`taskkill /PID ${pid} /F /T`);
        } else {
            // Unix-like: 先发送SIGTERM，再发送SIGKILL
            if (graceful) {
                await execCommand(`kill -TERM ${pid}`);
                // 等待一段时间让进程优雅退出
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            // 强制终止
            return await execCommand(`kill -KILL ${pid}`);
        }
    } catch (error) {
        console.warn(`Warning: Failed to terminate process ${pid}: ${error.message}`);
        throw error;
    }
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
        
        // 获取当前工作目录的绝对路径
        const currentWorkingDir = process.cwd().toLowerCase();
        
        // 调试：打印所有找到的进程
        console.log(`找到 ${processes.length} 个node进程:`);
        processes.forEach(process => {
            console.log(`  PID ${process.pid}: ${process.commandLine}`);
        });
        
        // 过滤出相关的后端进程，但避免误杀当前启动链中的进程
        const backendProcesses = processes.filter(process => {
            const processPid = parseInt(process.pid);
            if (processPid === currentPid) return false;
            
            const cmdLine = process.commandLine.toLowerCase();
            
            // 调试信息
            console.log(`\n检查进程 ${processPid}: ${cmdLine}`);
            
            // 避免杀死当前启动脚本进程（通过PID已经排除了自己）
            // 但允许杀死同名的其他进程实例
            const isCurrentScript = cmdLine.includes('start_be_cheezmil-terminal-interactive.mjs') &&
                                  processPid === currentPid;
            if (isCurrentScript) {
                console.log(`  -> 跳过当前启动脚本进程`);
                return false;
            }
            
            // 避免杀死系统Node.js进程和其他无关进程
            const isSystemProcess = cmdLine.includes('npm') ||
                                  cmdLine.includes('yarn') ||
                                  cmdLine.includes('pnpm') ||
                                  cmdLine.includes('npx') ||
                                  cmdLine.includes('node_modules') ||
                                  cmdLine.includes('vscode') ||
                                  cmdLine.includes('electron') ||
                                  cmdLine.includes('mcp-chrome-bridge') ||
                                  cmdLine.includes('mcp-remote') ||
                                  cmdLine.includes('mcphub');
            if (isSystemProcess) {
                console.log(`  -> 跳过系统进程`);
                return false;
            }
            
            // 精确匹配逻辑：检查是否包含项目特定的后端文件或启动脚本
            const projectPathPatterns = [
                'dist/http-server.js',
                'dist/index.js',
                'dist/mcp-server.js',
                'src/http-server.js',
                'src/index.js',
                'src/mcp-server.js',
                'start_be_cheezmil-terminal-interactive.mjs'
            ];
            
            const isRelatedProcess = projectPathPatterns.some(pattern =>
                cmdLine.includes(pattern.toLowerCase())
            ) || (cmdLine.includes('node') && cmdLine.includes('1106'));
            
            console.log(`  -> 匹配相关文件: ${isRelatedProcess}`);
            if (!isRelatedProcess) return false;
            
            // 额外安全检查：确保进程确实在运行我们的项目
            // 通过检查命令行中是否包含项目相关关键词或者路径
            const projectKeywords = ['cheezmil', 'terminal', 'interactive'];
            const hasProjectKeyword = projectKeywords.some(keyword =>
                cmdLine.includes(keyword.toLowerCase())
            ) || cmdLine.includes('cheezmil-terminal-interactive');
            
            if (!hasProjectKeyword) {
                console.log(`  -> 缺少项目关键词，跳过`);
                return false;
            }
            
            console.log(`  -> 将被标记为目标进程进行清理`);
            
            return true;
        });
        
        if (backendProcesses.length > 0) {
            console.log(`Found ${backendProcesses.length} related processes, terminating...`);
            
            // 并发终结所有进程，添加重试机制
            const terminatePromises = backendProcesses.map(async (process) => {
                const maxRetries = 3;
                let lastError = null;
                
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        console.log(`Terminating process PID: ${process.pid} (attempt ${attempt}/${maxRetries})`);
                        console.log(`Command line: ${process.commandLine.substring(0, 100)}...`);
                        
                        // 第一次尝试优雅终止，后续尝试强制终止
                        const graceful = attempt === 1;
                        await killProcess(process.pid, graceful);
                        
                        // 验证进程是否真的被终止
                        if (process.platform === 'win32') {
                            try {
                                await execCommand(`tasklist /FI "PID eq ${process.pid}" /FI "IMAGENAME eq node.exe"`);
                                // 如果命令成功执行，说明进程还在运行
                                if (attempt === maxRetries) {
                                    throw new Error('Process still running after all termination attempts');
                                }
                                console.log(`Process ${process.pid} still running, will retry...`);
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                continue;
                            } catch (tasklistError) {
                                // 如果tasklist失败，说明进程可能已经不存在了
                                if (tasklistError.message.includes('not found') || tasklistError.message.includes('INFO: No tasks')) {
                                    console.log(`Process ${process.pid} terminated successfully`);
                                    return { pid: process.pid, success: true };
                                }
                            }
                        } else {
                            // Unix-like systems: 使用ps检查进程是否还存在
                            try {
                                await execCommand(`ps -p ${process.pid}`);
                                // 如果命令成功执行，说明进程还在运行
                                if (attempt === maxRetries) {
                                    throw new Error('Process still running after all termination attempts');
                                }
                                console.log(`Process ${process.pid} still running, will retry...`);
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                continue;
                            } catch (psError) {
                                // 如果ps失败，说明进程可能已经不存在了
                                if (psError.message.includes('process') || psError.message.includes('not found')) {
                                    console.log(`Process ${process.pid} terminated successfully`);
                                    return { pid: process.pid, success: true };
                                }
                            }
                        }
                        
                        console.log(`Process ${process.pid} terminated successfully`);
                        return { pid: process.pid, success: true };
                    } catch (error) {
                        lastError = error;
                        console.warn(`Attempt ${attempt} failed for process ${process.pid}: ${error.message}`);
                        
                        if (attempt < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }
                
                console.error(`Failed to terminate process ${process.pid} after ${maxRetries} attempts:`, lastError.message);
                return { pid: process.pid, success: false, error: lastError.message };
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
