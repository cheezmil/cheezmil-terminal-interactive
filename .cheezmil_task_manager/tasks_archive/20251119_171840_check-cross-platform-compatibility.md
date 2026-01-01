### 任务：检查脚本的跨平台兼容性

- [x] 1. 分析所有脚本中的Windows特定命令和功能
- [x] 2. 识别Linux/macOS不兼容的部分
- [x] 3. 提供跨平台兼容性改进建议
- [x] 4. 总结哪些脚本需要修改才能在Linux/macOS上运行
- [x] 5. 修改start_assist_load_npm_global_package.mjs实现跨平台兼容
- [x] 6. 修改start_be_cheezmil-terminal-interactive.mjs实现跨平台兼容
- [ ] 7. 修改start_be_dev_cheezmil-terminal-interactive.mjs实现跨平台兼容
- [ ] 8. 修改start_build_be_cheezmil-terminal-interactive.mjs实现跨平台兼容
- [ ] 9. 修改start_build_fe_cheezmil-terminal-interactive.mjs实现跨平台兼容
- [ ] 10. 修改start_fe_cheezmil-terminal-interactive.mjs实现跨平台兼容
- [ ] 11. 修改start_fe_dev_cheezmil-terminal-interactive.mjs实现跨平台兼容
- [ ] 12. 修改start_install.mjs实现跨平台兼容

### 分析结果：

#### Windows特定命令和功能：
1. **fnm命令** - 所有脚本都使用了`fnm use 20.19.5`来设置Node.js版本
2. **进程管理命令** - 在后端和前端脚本中：
   - `wmic process` - Windows管理工具命令
   - `taskkill /PID ${pid} /F` - Windows进程终止命令
   - `netstat -ano | findstr :${PORT}` - Windows网络端口检查
   - `tasklist /FI "PID eq ${pid}"` - Windows进程列表命令
3. **路径分隔符** - 在`start_assist_load_npm_global_package.mjs`中的`'C:\\temp'`

#### Linux/macOS不兼容的部分：
1. Node.js版本管理 - fnm在不同平台的差异
2. 进程管理 - 需要使用ps/kill/pkill替代wmic/taskkill
3. 网络端口检查 - 需要使用lsof/netstat替代Windows特定命令
4. 路径处理 - 需要使用path.join()和跨平台路径

### 3. 跨平台兼容性改进建议：

#### A. Node.js版本管理改进
```javascript
// 替换fnm命令，使用跨平台方式检查Node.js版本
function checkAndSetNodeVersion() {
  const requiredVersion = '20.19.5';
  const currentVersion = process.version;
  
  if (currentVersion !== `v${requiredVersion}`) {
    console.log(`当前 Node.js 版本: ${currentVersion}，需要版本: v${requiredVersion}`);
    console.log('请手动切换到正确的 Node.js 版本，或确保已安装 v${requiredVersion}');
    
    // 跨平台提示，而不是自动切换
    if (process.platform === 'win32') {
      console.log('Windows用户请运行: fnm use 20.19.5');
    } else {
      console.log('Linux/macOS用户请运行: fnm use 20.19.5');
    }
    
    process.exit(1);
  }
  return true;
}
```

#### B. 进程管理改进
```javascript
// 跨平台进程终止函数
async function killProcess(pid) {
  const command = process.platform === 'win32'
    ? `taskkill /PID ${pid} /F`
    : `kill -9 ${pid}`;
  
  return execCommand(command);
}

// 跨平台进程查找函数
async function findProcessesByName(name) {
  if (process.platform === 'win32') {
    // Windows: 使用wmic
    const output = await execCommand(`wmic process where "name='${name}'" get ProcessId,CommandLine /format:csv`);
    return parseWmicOutput(output);
  } else {
    // Linux/macOS: 使用ps
    const output = await execCommand(`ps aux | grep ${name}`);
    return parsePsOutput(output);
  }
}
```

#### C. 网络端口检查改进
```javascript
// 跨平台端口检查函数
async function findProcessesUsingPort(port) {
  let command;
  if (process.platform === 'win32') {
    command = `netstat -ano | findstr :${port}`;
  } else if (process.platform === 'darwin') {
    command = `lsof -i :${port}`;
  } else {
    // Linux
    command = `netstat -tulpn | grep :${port}`;
  }
  
  const output = await execCommand(command);
  return parsePortOutput(output, process.platform);
}
```

#### D. 路径处理改进
```javascript
// 在start_assist_load_npm_global_package.mjs中
function getTempDir() {
  const os = process.platform;
  if (os === 'win32') {
    return process.env.TEMP || process.env.TMP || path.join(process.env.LOCALAPPDATA || 'C:\\temp');
  } else {
    return process.env.TMPDIR || '/tmp';
  }
}
```

### 4. 总结：需要修改的脚本

**所有8个脚本都需要修改才能在Linux/macOS上运行：**

1. **start_assist_load_npm_global_package.mjs** - 需要修改路径处理
2. **start_be_cheezmil-terminal-interactive.mjs** - 需要修改进程管理和Node.js版本检查
3. **start_be_dev_cheezmil-terminal-interactive.mjs** - 需要修改进程管理和Node.js版本检查
4. **start_build_be_cheezmil-terminal-interactive.mjs** - 需要修改Node.js版本检查
5. **start_build_fe_cheezmil-terminal-interactive.mjs** - 需要修改Node.js版本检查
6. **start_fe_cheezmil-terminal-interactive.mjs** - 需要修改进程管理、端口检查和Node.js版本检查
7. **start_fe_dev_cheezmil-terminal-interactive.mjs** - 需要修改进程管理和Node.js版本检查
8. **start_install.mjs** - 需要修改Node.js版本检查

**主要问题：**
- 所有脚本都依赖Windows特定的fnm使用方式
- 4个脚本（前后端启动和开发脚本）使用Windows进程管理命令
- 1个脚本（前端启动脚本）使用Windows网络检查命令
- 1个脚本（全局包加载脚本）使用Windows特定路径格式

**结论：**
这些脚本目前**不能**在Linux或macOS上直接运行，需要进行上述的跨平台兼容性修改。最关键的问题是所有脚本都使用了Windows特定的进程管理命令和fnm版本管理方式。
