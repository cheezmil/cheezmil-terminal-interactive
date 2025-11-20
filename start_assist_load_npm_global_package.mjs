import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 全局模块加载函数
function loadGlobalModule(moduleName) {
    try {
        // 尝试直接导入模块
        const module = require(moduleName);
        console.log(`✅ 成功加载全局模块: ${moduleName}`);
        return module;
    } catch (error) {
        console.log(`❌ 全局模块 ${moduleName} 未找到，尝试安装...`);
        
        try {
            // 尝试全局安装模块
            execSync(`npm install -g ${moduleName}`, { stdio: 'inherit' });
            console.log(`✅ 成功安装并加载全局模块: ${moduleName}`);
            return require(moduleName);
        } catch (installError) {
            console.error(`❌ 安装全局模块 ${moduleName} 失败:`, installError.message);
            throw installError;
        }
    }
}

// 只保留实际使用的模块
const modulesToLoad = [
    'rimraf'
];

// 加载所有需要的模块
const loadedModules = {};

for (const moduleName of modulesToLoad) {
    try {
        const loadedModule = loadGlobalModule(moduleName);
        
        // 处理 find-process 模块的特殊情况（如果需要的话）
        if (moduleName === 'find-process') {
            loadedModules['findProcess'] = loadedModule.default || loadedModule;
        } else {
            loadedModules[moduleName] = loadedModule;
        }
    } catch (error) {
        console.error(`❌ 无法加载模块 ${moduleName}:`, error.message);
        process.exit(1);
    }
}

// 导出加载的模块
export const {
    rimraf
} = loadedModules;

// 提供一个检查模块是否已加载的函数
export function isModuleLoaded(moduleName) {
    return moduleName in loadedModules;
}

// 提供一个获取已加载模块列表的函数
export function getLoadedModules() {
    return Object.keys(loadedModules);
}

// 提供一个重新加载模块的函数
export function reloadModule(moduleName) {
    if (modulesToLoad.includes(moduleName)) {
        try {
            const loadedModule = loadGlobalModule(moduleName);
            if (moduleName === 'find-process') {
                loadedModules['findProcess'] = loadedModule.default || loadedModule;
            } else {
                loadedModules[moduleName] = loadedModule;
            }
            console.log(`✅ 成功重新加载模块: ${moduleName}`);
            return loadedModules[moduleName];
        } catch (error) {
            console.error(`❌ 重新加载模块 ${moduleName} 失败:`, error.message);
            throw error;
        }
    } else {
        throw new Error(`模块 ${moduleName} 不在预定义的模块列表中`);
    }
}