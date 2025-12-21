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
          // 添加防递归重启检查，避免无限循环
          const restartCount = parseInt(process.env.FE_RESTART_COUNT || '0');
          if (restartCount >= 2) {
            console.error('检测到多次重启，停止自动重启以避免递归问题');
            process.exit(1);
          }
          
          // 重新启动脚本以使用新的 Node.js 版本
          const newProcess = spawn(process.argv[0], process.argv.slice(1), {
            stdio: 'inherit',
            shell: true,
            env: {
              ...process.env,
              FE_RESTART_COUNT: (restartCount + 1).toString()
            }
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
const PORT = parseInt(config.FRONTEND_PORT);

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
            // Windows系统：使用netstat和taskkill
            try {
                const netstatOutput = await execCommand(`netstat -ano | findstr :${PORT}`);
                const lines = netstatOutput.split('\n').filter(line => line.trim());
                const pids = new Set();
                
                for (const line of lines) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 5) {
                        const pid = parts[parts.length - 1];
                        if (pid && /^\d+$/.test(pid) && parseInt(pid) !== currentPid) {
                            pids.add(parseInt(pid));
                        }
                    }
                }
                
                if (pids.size > 0) {
                    console.log(`Found ${pids.size} processes using port ${PORT}, terminating...`);
                    
                    for (const pid of pids) {
                        try {
                            // 获取进程名以验证是否与我们的前端相关
                            const tasklistOutput = await execCommand(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
                            if (tasklistOutput.includes('node.exe')) {
                                console.log(`Terminating node process PID: ${pid}`);
                                await execCommand(`taskkill /PID ${pid} /F`);
                                console.log(`Process ${pid} terminated successfully`);
                            } else {
                                console.log(`Skipping non-node process PID: ${pid}`);
                            }
                        } catch (error) {
                            console.error(`Failed to terminate process ${pid}:`, error.message);
                        }
                    }
                    
                    // 等待进程完全退出
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    console.log('No processes found using the specified port');
                }
            } catch (netstatError) {
                console.log('Netstat command failed, trying alternative method...');
                
                // 备用方法：使用wmic但更具体
                const wmicOutput = await execCommand('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /format:csv');
                const lines = wmicOutput.split('\n').filter(line => line.trim());
                const processes = [];
                
                const dataLines = lines.filter(line => !line.includes('Node,CommandLine,ProcessId') && line.includes(','));
                
                for (const line of dataLines) {
                    const parts = line.split(',');
                    if (parts.length >= 3) {
                        const commandLine = parts[1];
                        const processId = parts[2].trim();
                        
                        // 更具体 - 只针对与我们的项目明显相关的进程
                        if (commandLine && parseInt(processId) !== currentPid && !commandLine.includes('start_fe_cheezmil-terminal-interactive.mjs')) {
                            const isFrontendProcess = commandLine.includes('vite') ||
                                                    commandLine.includes('npm') && commandLine.includes('dev') ||
                                                    commandLine.includes(`:${PORT}`);
                            const isCurrentProject = commandLine.includes('cheezmil-terminal-interactive') ||
                                                   commandLine.includes('frontend');
                            
                            if (isFrontendProcess && isCurrentProject) {
                                processes.push({
                                    pid: parseInt(processId),
                                    commandLine: commandLine
                                });
                            }
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
                    
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    console.log('No related processes found');
                }
            }
        } else {
            // Linux/macOS系统：使用lsof和kill
            try {
                const lsofOutput = await execCommand(`lsof -ti:${PORT}`);
                const pids = lsofOutput.split('\n').filter(pid => pid.trim() && parseInt(pid.trim()) !== currentPid);
                
                if (pids.length > 0) {
                    console.log(`Found ${pids.length} processes using port ${PORT}, terminating...`);
                    
                    for (const pid of pids) {
                        try {
                            // 检查进程是否为node进程
                            const psOutput = await execCommand(`ps -p ${pid} -o comm=`);
                            if (psOutput.includes('node')) {
                                console.log(`Terminating node process PID: ${pid}`);
                                await execCommand(`kill -9 ${pid}`);
                                console.log(`Process ${pid} terminated successfully`);
                            } else {
                                console.log(`Skipping non-node process PID: ${pid}`);
                            }
                        } catch (error) {
                            console.error(`Failed to terminate process ${pid}:`, error.message);
                        }
                    }
                    
                    // 等待进程完全退出
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    console.log('No processes found using the specified port');
                }
            } catch (lsofError) {
                console.log('lsof command failed, trying alternative method...');
                
                // 备用方法：使用ps查找node进程
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
                                (commandLine.includes('vite') && commandLine.includes('frontend')) ||
                                (commandLine.includes('npm') && commandLine.includes('dev') && commandLine.includes('frontend')) ||
                                commandLine.includes('start_fe_cheezmil-terminal-interactive.mjs') ||
                                (commandLine.includes(`:${PORT}`) && (commandLine.includes('vite') || commandLine.includes('frontend')))
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
                        console.log('No related processes found');
                    }
                } catch (psError) {
                    console.error('Failed to find processes using ps command:', psError.message);
                }
            }
        }
        
    } catch (error) {
        console.error('Error finding or terminating processes:', error.message);
    }
}

async function startFrontend() {
  try {
    // 终止旧的前端进程
    await killFrontendProcesses();
    
    console.log('Starting frontend production server...');

    // 检查是否存在编译后的产物
    const distPath = path.join(FRONTEND_DIR, 'dist');
    if (!existsSync(distPath)) {
      console.error('Error: Frontend build not found. Please run "node start_build_fe_cheezmil-terminal-interactive.mjs" first.');
      process.exit(1);
    }

    // 启动前端生产服务器（使用编译后的产物）
    const frontendProcess = spawn('npm', ['run', 'preview'], {
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
        console.log('Frontend production server stopped successfully.');
      } else {
        console.error(`Frontend production server exited with code ${code}`);
      }
      process.exit(code);
    });

    frontendProcess.on('error', (err) => {
      console.error('Failed to start frontend production server:', err);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('Error during startup:', error);
    process.exit(1);
  }
}

startFrontend().catch(console.error);