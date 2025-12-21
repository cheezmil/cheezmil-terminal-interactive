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
const PORT = parseInt(config.MCP_PORT) || 3000;

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

// Find and terminate backend related processes
async function killBackendProcesses() {
    try {
        console.log('Searching for backend processes occupying the port...');
        
        // Get current process ID to avoid killing ourselves
        const currentPid = process.pid;
        
        // Use wmic to find all node.exe processes and their command lines
        const wmicOutput = await execCommand('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /format:csv');
        
        // Parse output, find related backend processes
        const lines = wmicOutput.split('\n').filter(line => line.trim());
        const processes = [];
        
        // Skip header lines, only process data lines containing commas
        const dataLines = lines.filter(line => !line.includes('Node,CommandLine,ProcessId') && line.includes(','));
        
        for (const line of dataLines) {
            // CSV format: Node,CommandLine,ProcessId
            const parts = line.split(',');
            if (parts.length >= 3) {
                const commandLine = parts[1];
                const processId = parts[2].trim();
                
                // Find backend-related processes, but exclude current process
                if (commandLine && parseInt(processId) !== currentPid && !commandLine.includes('start_be_dev_cheezmil-terminal-interactive.mjs')) {
                    const isRelatedProcess = commandLine.includes('dist/index.js') ||
                                           commandLine.includes('dist/http-server.js');
                    const isCurrentProject = commandLine.includes('cheezmil-terminal-interactive');
                    
                    if (isRelatedProcess && isCurrentProject) {
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
            
            // 并发终结所有进程
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

async function startBackendDev() {
  try {
    // Terminate old backend processes
    await killBackendProcesses();
    
    console.log('Starting backend in development mode...');

    // Start the backend development server with hot reload
    const backendProcess = spawn('npm', ['run', 'dev'], {
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
        console.log('Backend development server stopped successfully.');
      } else {
        console.error(`Backend development server exited with code ${code}`);
      }
      process.exit(code);
    });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend development server:', err);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('Error during startup:', error);
    process.exit(1);
  }
}

startBackendDev().catch(console.error);