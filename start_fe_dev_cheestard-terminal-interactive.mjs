import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

// 跨平台检查并设置 Node.js 版本
function checkAndSetNodeVersion() {
  const requiredVersion = '20.19.5';
  const currentVersion = process.version;
  const majorVersion = parseInt(currentVersion.slice(1).split('.')[0]);
  
  if (process.platform === 'win32') {
    // Windows系统：自动切换Node.js版本
    if (currentVersion !== `v${requiredVersion}`) {
      console.log(`当前 Node.js 版本: ${currentVersion}，需要版本: v${requiredVersion}`);
      console.log('正在切换到正确的 Node.js 版本...');
      
      // 使用 spawn 而不是 execSync 来避免创建额外的 Node.js 进程
      const fnmProcess = spawn('fnm', ['use', requiredVersion], {
        stdio: 'inherit',
        shell: true
      });
      
      fnmProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`已切换到 Node.js v${requiredVersion}`);
          // 重新启动脚本以使用新的 Node.js 版本
          const newProcess = spawn(process.argv[0], process.argv.slice(1), {
            stdio: 'inherit',
            shell: true
          });
          newProcess.on('close', (code) => {
            process.exit(code);
          });
        } else {
          console.error(`切换 Node.js 版本失败，退出码: ${code}`);
          process.exit(1);
        }
      });
      
      // 等待 fnm 命令完成
      return false;
    }
  } else {
    // Linux/macOS系统：检查版本但不强制切换
    if (majorVersion < 20) {
      console.log(`⚠️  检测到Node.js版本: ${currentVersion} (推荐使用v${requiredVersion}或更高版本)`);
      console.log('💡 提示: 如需切换版本，可以使用以下命令:');
      console.log('   - 使用fnm: fnm use 20.19.5');
      console.log('   - 使用nvm: nvm use 20.19.5');
      console.log('   - 继续使用当前版本可能会遇到兼容性问题\n');
    } else {
      console.log(`✅ Node.js版本检查通过: ${currentVersion}`);
    }
  }
  
  return true;
}

// 只有版本正确时才继续执行
if (!checkAndSetNodeVersion()) {
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_DIR = path.resolve(__dirname, 'frontend');

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
const PORT = parseInt(config.FRONTEND_PORT) || 5173;

// 跨平台执行命令函数
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

// 跨平台查找并终止前端相关进程
async function killFrontendProcesses() {
    try {
        console.log('Searching for frontend processes occupying the port...');
        
        // 获取当前进程ID以避免杀死自己
        const currentPid = process.pid;
        
        if (process.platform === 'win32') {
            // Windows系统：使用wmic查找所有node.exe进程及其命令行
            const wmicOutput = await execCommand('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /format:csv');
            
            // 解析输出，查找相关的前端进程
            const lines = wmicOutput.split('\n').filter(line => line.trim());
            const processes = [];
            
            // 跳过标题行，只处理包含逗号的数据行
            const dataLines = lines.filter(line => !line.includes('Node,CommandLine,ProcessId') && line.includes(','));
            
            for (const line of dataLines) {
                // CSV格式：Node,CommandLine,ProcessId
                const parts = line.split(',');
                if (parts.length >= 3) {
                    const commandLine = parts[1];
                    const processId = parts[2].trim();
                    
                    // 查找前端相关进程，但排除当前进程
                    if (commandLine && parseInt(processId) !== currentPid && (
                        commandLine.includes('vite') ||
                        commandLine.includes('dev') ||
                        commandLine.includes('frontend') ||
                        commandLine.includes(`:${PORT}`) ||
                        commandLine.includes('start_fe_dev_cheestard-terminal-interactive.mjs')
                    )) {
                        processes.push({
                            pid: parseInt(processId),
                            commandLine: commandLine
                        });
                    }
                }
            }
            
            if (processes.length > 0) {
                console.log(`Found ${processes.length} related processes, terminating...`);
                
                // 并发终止所有进程
                const terminatePromises = processes.map(async (process) => {
                    try {
                        console.log(`Terminating process PID: ${process.pid}`);
                        console.log(`Command line: ${process.commandLine.substring(0, 100)}...`);
                        
                        await execCommand(`taskkill /PID ${process.pid} /F`);
                        console.log(`Process ${process.pid} terminated successfully`);
                        return { pid: process.pid, success: true };
                    } catch (error) {
                        console.error(`Failed to terminate process ${process.pid}:`, error.message);
                        return { pid: process.pid, success: false, error: error.message };
                    }
                });
                
                // 等待所有进程终止完成
                const results = await Promise.all(terminatePromises);
                
                // 统计结果
                const successCount = results.filter(r => r.success).length;
                const failureCount = results.length - successCount;
                
                console.log(`Process termination completed: ${successCount} successful, ${failureCount} failed`);
                
                // 等待进程完全退出
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                console.log('No related processes found occupying the port');
            }
        } else {
            // Linux/macOS系统：使用ps查找进程
            try {
                const psOutput = await execCommand('ps aux | grep node');
                const lines = psOutput.split('\n').filter(line => line.trim() && !line.includes('grep'));
                const processes = [];
                
                for (const line of lines) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 2) {
                        const pid = parseInt(parts[1]);
                        const commandLine = parts.slice(10).join(' ');
                        
                        if (pid && pid !== currentPid && (
                            commandLine.includes('vite') ||
                            commandLine.includes('dev') ||
                            commandLine.includes('frontend') ||
                            commandLine.includes(`:${PORT}`) ||
                            commandLine.includes('start_fe_dev_cheestard-terminal-interactive.mjs')
                        )) {
                            processes.push({
                                pid: pid,
                                commandLine: commandLine
                            });
                        }
                    }
                }
                
                if (processes.length > 0) {
                    console.log(`Found ${processes.length} related processes, terminating...`);
                    
                    for (const process of processes) {
                        try {
                            console.log(`Terminating process PID: ${process.pid}`);
                            console.log(`Command line: ${process.commandLine.substring(0, 100)}...`);
                            
                            await execCommand(`kill -9 ${process.pid}`);
                            console.log(`Process ${process.pid} terminated successfully`);
                        } catch (error) {
                            console.error(`Failed to terminate process ${process.pid}:`, error.message);
                        }
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    console.log('No related processes found occupying the port');
                }
            } catch (psError) {
                console.error('Failed to find processes using ps command:', psError.message);
            }
        }
        
    } catch (error) {
        console.error('Error finding or terminating processes:', error.message);
    }
}

async function startFrontendDev() {
  try {
    // 终止旧的前端进程
    await killFrontendProcesses();
    
    console.log('Starting frontend in development mode...');

    // 启动前端开发服务器，支持热重载
    const frontendProcess = spawn('npm', ['run', 'dev'], {
      cwd: FRONTEND_DIR,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        PORT: PORT,
      }
    });

    frontendProcess.on('close', (code) => {
      if (code === 0) {
        console.log('Frontend development server stopped successfully.');
      } else {
        console.error(`Frontend development server exited with code ${code}`);
      }
      process.exit(code);
    });

    frontendProcess.on('error', (err) => {
      console.error('Failed to start frontend development server:', err);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('Error during startup:', error);
    process.exit(1);
  }
}

startFrontendDev().catch(console.error);