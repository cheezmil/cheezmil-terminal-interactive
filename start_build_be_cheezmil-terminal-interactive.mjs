import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
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

function buildProject() {
    console.log('Building project...');
    const child = spawn('npm', ['run', 'build'], {
        stdio: 'inherit',
        shell: true,
        cwd: PROJECT_DIR
    });

    child.on('close', (code) => {
        if (code === 0) {
            console.log('Project built successfully.');
        } else {
            console.error(`Project build failed, exit code ${code}`);
        }
        process.exit(code);
    });

    child.on('error', (err) => {
        console.error('Failed to start build process:', err);
        process.exit(1);
    });
}

buildProject();