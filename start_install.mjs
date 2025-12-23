import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { execSync } from 'child_process';

// IMPORTANT / 重要说明：
// This project forbids the agent from deleting files/folders automatically.
// 本项目禁止我自动删除文件/文件夹；若需要清理依赖，必须生成“待确认删除脚本”让你手动执行确认。

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

function formatTimestampForFilename(date = new Date()) {
    const pad2 = (n) => String(n).padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad2(date.getMonth() + 1);
    const dd = pad2(date.getDate());
    const hh = pad2(date.getHours());
    const mi = pad2(date.getMinutes());
    const ss = pad2(date.getSeconds());
    return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

// Generate "need_to_confirm_delete" script instead of deleting directly /
// 生成“待确认删除脚本”替代直接删除
function writeNeedConfirmDeleteScript(targets) {
    const dir = path.join(PROJECT_DIR, '.cheezmil_task_manager', 'need_to_confirm_delete');
    fs.mkdirSync(dir, { recursive: true });

    const filename = `${formatTimestampForFilename()}.mjs`;
    const scriptPath = path.join(dir, filename);

    const script = `import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const selfPath = fileURLToPath(import.meta.url);
// 禁止访问这个index.js的内部逻辑。
const cliEntry = 'D:\\\\CodeRelated\\\\cheezmil-task-manager\\\\ctm-cli\\\\src\\\\index.js';
const targets = ${JSON.stringify(targets, null, 2)}.map((p) => path.resolve(p));
const result = spawnSync(
  process.execPath,
  [cliEntry, 'recycle-to-trash-confirm', '--self-delete', selfPath, ...targets],
  { stdio: 'inherit' }
);
process.exit(result.status ?? 1);
`;

    fs.writeFileSync(scriptPath, script, 'utf8');
    return scriptPath;
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
            
            // 检查是否存在前端目录并安装前端依赖 / Check frontend directory and install its dependencies
            const frontendDir = path.join(PROJECT_DIR, 'frontend');
            if (fs.existsSync(frontendDir)) {
                console.log('Installing frontend dependencies (using --legacy-peer-deps for peer conflicts)... / 正在安装前端依赖（使用 --legacy-peer-deps 处理 peer 依赖冲突）');
                const frontendChild = spawn('npm', ['install', '--legacy-peer-deps'], {
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

                // IMPORTANT / 重要：不要在这里退出主进程，否则前端安装会被中断。
                // Wait for `frontendChild` events above. / 等待上面的 `frontendChild` 事件回调。
                return;
            } else {
                console.log('All dependencies have been installed successfully!');
                process.exit(0);
            }
        } else {
            console.error(`Main project dependency installation failed, exit code ${code}`);
            process.exit(code);
        }
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
    const noDelete = process.argv.includes('--no-delete');

    const hasDependencies = nodeModulesExists || frontendNodeModulesExists;

    if (hasDependencies) {
        if (noDelete) {
            console.log('Detected --no-delete, will run installation without deleting anything.');
            installDependencies();
            rl.close();
            return;
        }

        if (forceReinstall) {
            console.log('Detected --force parameter, but deletion requires manual confirmation.');
            const targets = [
                path.join(PROJECT_DIR, 'node_modules'),
                path.join(PROJECT_DIR, 'package-lock.json'),
                path.join(PROJECT_DIR, 'frontend', 'node_modules'),
                path.join(PROJECT_DIR, 'frontend', 'package-lock.json'),
            ].filter((p) => fs.existsSync(p));

            const scriptPath = writeNeedConfirmDeleteScript(targets);
            console.log(`Generated confirm-delete script: ${scriptPath}`);
            console.log('Please run it manually, then re-run: node start_install.mjs --no-delete');
            rl.close();
            process.exit(2);
        } else {
            let message = 'Detected installed dependencies (';
            if (nodeModulesExists) message += 'main node_modules';
            if (nodeModulesExists && frontendNodeModulesExists) message += ' and ';
            if (frontendNodeModulesExists) message += 'frontend node_modules';
            message += '). Do you want to delete and reinstall? (y/N): ';
            
            rl.question(message, async (answer) => {
                if (answer.toLowerCase() === 'y') {
                    const targets = [
                        path.join(PROJECT_DIR, 'node_modules'),
                        path.join(PROJECT_DIR, 'package-lock.json'),
                        path.join(PROJECT_DIR, 'frontend', 'node_modules'),
                        path.join(PROJECT_DIR, 'frontend', 'package-lock.json'),
                    ].filter((p) => fs.existsSync(p));

                    const scriptPath = writeNeedConfirmDeleteScript(targets);
                    console.log(`Generated confirm-delete script: ${scriptPath}`);
                    console.log('Please run it manually, then re-run: node start_install.mjs --no-delete');
                    rl.close();
                    process.exit(2);
                } else {
                    console.log('Skip deletion. Continue with installation without deleting.');
                    installDependencies();
                    rl.close();
                }
            });
        }
    } else {
        installDependencies();
    }
}

main().catch(console.error);
