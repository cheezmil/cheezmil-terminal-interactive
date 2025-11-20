import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
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
const PROJECT_DIR = path.resolve(__dirname);

// Display usage instructions
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage:
  node start_install.mjs [options]

Options:
  --force, -f    Force delete node_modules and reinstall without confirmation
  --help, -h     Display this help information

Examples:
  node start_install.mjs          # Interactive installation
  node start_install.mjs --force  # Force reinstall
`);
    process.exit(0);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// 跨平台删除依赖函数
async function deleteDependencies() {
    console.log('Deleting node_modules and package-lock.json...');
    try {
        const nodeModulesPath = path.join(PROJECT_DIR, 'node_modules');
        if (fs.existsSync(nodeModulesPath)) {
            // 使用Node.js内置方法删除目录（跨平台兼容）
            await fs.promises.rm(nodeModulesPath, { recursive: true, force: true });
            console.log('node_modules has been deleted.');
        }
        
        const packageLockPath = path.join(PROJECT_DIR, 'package-lock.json');
        if (fs.existsSync(packageLockPath)) {
            await fs.promises.unlink(packageLockPath);
            console.log('package-lock.json has been deleted.');
        }
        
        // 同时删除前端的依赖（如果存在）
        const frontendNodeModulesPath = path.join(PROJECT_DIR, 'frontend', 'node_modules');
        if (fs.existsSync(frontendNodeModulesPath)) {
            await fs.promises.rm(frontendNodeModulesPath, { recursive: true, force: true });
            console.log('frontend/node_modules has been deleted.');
        }
        
        const frontendPackageLockPath = path.join(PROJECT_DIR, 'frontend', 'package-lock.json');
        if (fs.existsSync(frontendPackageLockPath)) {
            await fs.promises.unlink(frontendPackageLockPath);
            console.log('frontend/package-lock.json has been deleted.');
        }
        
        console.log('Old dependencies have been successfully cleaned up.');
    } catch (error) {
        console.error('Error deleting dependencies:', error);
        process.exit(1);
    }
}

// 跨平台安装依赖函数
function installDependencies() {
    console.log('Installing project dependencies...');
    
    // 首先安装主项目依赖
    const mainChild = spawn('npm', ['install'], {
        stdio: 'inherit',
        shell: true,
        cwd: PROJECT_DIR
    });

    mainChild.on('close', (code) => {
        if (code === 0) {
            console.log('Main project dependencies installed successfully.');
            
            // 检查是否存在前端目录并安装前端依赖
            const frontendDir = path.join(PROJECT_DIR, 'frontend');
            if (fs.existsSync(frontendDir)) {
                console.log('Installing frontend dependencies...');
                const frontendChild = spawn('npm', ['install'], {
                    stdio: 'inherit',
                    shell: true,
                    cwd: frontendDir
                });

                frontendChild.on('close', (frontendCode) => {
                    if (frontendCode === 0) {
                        console.log('Frontend dependencies installed successfully.');
                        console.log('All dependencies have been installed successfully!');
                    } else {
                        console.error(`Frontend dependency installation failed, exit code ${frontendCode}`);
                    }
                    process.exit(frontendCode);
                });

                frontendChild.on('error', (err) => {
                    console.error('Failed to start frontend installation process:', err);
                    process.exit(1);
                });
            } else {
                console.log('All dependencies have been installed successfully!');
                process.exit(0);
            }
        } else {
            console.error(`Main project dependency installation failed, exit code ${code}`);
        }
        process.exit(code);
    });

    mainChild.on('error', (err) => {
        console.error('Failed to start installation process:', err);
        process.exit(1);
    });
}

async function main() {
    const nodeModulesExists = fs.existsSync(path.join(PROJECT_DIR, 'node_modules'));
    const frontendNodeModulesExists = fs.existsSync(path.join(PROJECT_DIR, 'frontend', 'node_modules'));
    const forceReinstall = process.argv.includes('--force') || process.argv.includes('-f');

    const hasDependencies = nodeModulesExists || frontendNodeModulesExists;

    if (hasDependencies) {
        if (forceReinstall) {
            console.log('Detected --force parameter, directly deleting and reinstalling dependencies...');
            await deleteDependencies();
            installDependencies();
        } else {
            let message = 'Detected installed dependencies (';
            if (nodeModulesExists) message += 'main node_modules';
            if (nodeModulesExists && frontendNodeModulesExists) message += ' and ';
            if (frontendNodeModulesExists) message += 'frontend node_modules';
            message += '). Do you want to delete and reinstall? (y/N): ';
            
            rl.question(message, async (answer) => {
                if (answer.toLowerCase() === 'y') {
                    await deleteDependencies();
                    installDependencies();
                } else {
                    console.log('Operation cancelled.');
                    rl.close();
                }
            });
        }
    } else {
        installDependencies();
    }
}

main().catch(console.error);