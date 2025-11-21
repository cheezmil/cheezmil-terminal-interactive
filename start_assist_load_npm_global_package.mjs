/**
 * 警告：AI不要删除这块多行注释，这里的注释是我写的重要原则。
 * - 请使用ES模块语法。
 * 
 * - 本脚本可以当某个包没有全局安装时自动安装。
 *
 * - 缓存机制：本脚本已实现跨平台的永久缓存机制，将 'npm root -g' 的结果永久缓存，除非路径错误。
 *   - Windows: 缓存存储在 %TEMP% 或 %TMP% 目录
 *   - Linux/macOS: 缓存存储在 $TMPDIR 或 /tmp 目录
 *   - 缓存文件名: npm_global_root_cache.json
 *   - 缓存策略: 永久缓存，除非路径不存在或错误
 *
 *
 =====================================================================================
 */
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, unlinkSync } from 'fs';

/**
 * 获取跨平台的临时目录路径
 * @returns {string} 临时目录路径
 */
function getTempDir() {
    const os = process.platform;
    if (os === 'win32') {
        return process.env.TEMP || process.env.TMP || 'C:\\temp';
    } else {
        return process.env.TMPDIR || '/tmp';
    }
}

/**
 * 获取缓存文件路径
 * @returns {string} 缓存文件的完整路径
 */
function getCacheFilePath() {
    const tempDir = getTempDir();
    // 确保临时目录存在
    if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
    }
    return join(tempDir, 'npm_global_root_cache.json');
}

/**
 * 检查缓存是否有效（永久缓存，除非路径错误）
 * @param {string} cacheFilePath - 缓存文件路径
 * @returns {boolean} 缓存是否有效
 */
function isCacheValid(cacheFilePath) {
    if (!existsSync(cacheFilePath)) {
        return false;
    }
    
    try {
        const cacheData = readFileSync(cacheFilePath, { encoding: 'utf-8' });
        const parsed = JSON.parse(cacheData);
        const globalNpmRoot = parsed.globalNpmRoot;
        
        // 检查路径是否仍然存在
        return existsSync(globalNpmRoot);
    } catch (error) {
        return false;
    }
}

/**
 * 从缓存中读取全局 npm 根目录
 * @param {string} cacheFilePath - 缓存文件路径
 * @returns {string|null} 缓存的全局 npm 根目录，如果无效则返回 null
 */
function readGlobalNpmRootFromCache(cacheFilePath) {
    try {
        const cacheData = readFileSync(cacheFilePath, { encoding: 'utf-8' });
        const parsed = JSON.parse(cacheData);
        return parsed.globalNpmRoot || null;
    } catch (error) {
        return null;
    }
}

/**
 * 将全局 npm 根目录写入缓存
 * @param {string} cacheFilePath - 缓存文件路径
 * @param {string} globalNpmRoot - 全局 npm 根目录
 */
function writeGlobalNpmRootToCache(cacheFilePath, globalNpmRoot) {
    try {
        const cacheData = JSON.stringify({ globalNpmRoot, timestamp: Date.now() });
        writeFileSync(cacheFilePath, cacheData, { encoding: 'utf-8' });
    } catch (error) {
        // 忽略写入错误，不影响主要功能
        console.warn('[Loader] 无法写入缓存文件:', error.message);
    }
}

/**
 * 获取全局 npm 根目录的路径（带永久缓存）
 * @returns {string} 全局 npm 根目录路径
 */
function getGlobalNpmRoot() {
    const cacheFilePath = getCacheFilePath();
    
    // 尝试从缓存中读取
    if (isCacheValid(cacheFilePath)) {
        const cachedRoot = readGlobalNpmRootFromCache(cacheFilePath);
        if (cachedRoot) {
            return cachedRoot;
        }
    }
    
    // 缓存无效或不存在，重新获取
    const globalNpmRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim();
    
    // 更新缓存
    writeGlobalNpmRootToCache(cacheFilePath, globalNpmRoot);
    
    return globalNpmRoot;
}

// 获取全局 npm 根目录的路径（使用缓存版本）
// 这是最可靠的、跨平台的方式来找到全局 node_modules
const globalNpmRoot = getGlobalNpmRoot();

// 基于全局 npm 根目录创建一个 require 函数
// 这个 require 函数的解析行为将和在命令行中一样
const globalRequire = createRequire(globalNpmRoot);

/**
 * 内部辅助函数：使用创建的 require 函数加载模块。
 * @param {string} moduleName - 要加载的模块名。
 * @returns {any} 加载的模块。
 */
function load(moduleName) {
    try {
        return globalRequire(moduleName);
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            console.warn(`[Loader] 全局模块 '${moduleName}' 未找到，正在尝试自动安装...`);
            try {
                execSync(`npm install -g ${moduleName}`, { stdio: 'inherit' });
                console.log(`[Loader] 模块 '${moduleName}' 已成功安装。`);
                
                // 安装新模块后清除缓存，因为全局目录结构可能已改变
                try {
                    const cacheFilePath = getCacheFilePath();
                    if (existsSync(cacheFilePath)) {
                        // 删除缓存文件，强制下次重新获取
                        unlinkSync(cacheFilePath);
                        console.log('[Loader] 已清除缓存，因为全局模块结构已更新。');
                    }
                } catch (cacheError) {
                    // 忽略清除缓存的错误
                    console.warn('[Loader] 清除缓存时出现警告:', cacheError.message);
                }
                
                // 安装后再次尝试加载
                return globalRequire(moduleName);
            } catch (installError) {
                console.error(`[Loader] 自动安装模块 '${moduleName}' 失败。`);
                console.error(`请手动执行 'npm install -g ${moduleName}' 进行安装。`);
                console.error('安装错误:', installError);
                process.exit(1);
            }
        } else {
            console.error(`[Loader] 加载全局模块 '${moduleName}' 时发生未知错误。`);
            console.error(`全局目录: ${globalNpmRoot}`);
            console.error('原始错误:', error);
            process.exit(1);
        }
    }
}

// 创建一个智能的模块加载器，可以按需加载任何模块
const moduleLoader = {
    // 获取模块（自动加载）
    get: function(moduleName) {
        const loadedModule = load(moduleName);
        
        // 特殊处理某些模块
        if (moduleName === 'find-process') {
            return loadedModule.default || loadedModule;
        }
        
        return loadedModule;
    },
    
    // 检查模块是否可用（不自动安装）
    isAvailable: function(moduleName) {
        try {
            globalRequire(moduleName);
            return true;
        } catch (error) {
            return false;
        }
    },
    
    // 强制重新加载模块
    reload: function(moduleName) {
        // 清除require缓存
        try {
            delete require.cache[require.resolve(moduleName)];
        } catch (e) {
            // 忽略清除缓存错误
        }
        return load(moduleName);
    },
    
    // 获取全局npm根目录
    getGlobalNpmRoot: function() {
        return globalNpmRoot;
    },
    
    // 清除缓存
    clearCache: function() {
        try {
            const cacheFilePath = getCacheFilePath();
            if (existsSync(cacheFilePath)) {
                unlinkSync(cacheFilePath);
                console.log('[Loader] 缓存已清除。');
            }
        } catch (error) {
            console.warn('[Loader] 清除缓存时出现警告:', error.message);
        }
    }
};

// 导出模块加载器
export default moduleLoader;

// 提供一个通用的模块导入函数
export function importModule(moduleName) {
    return moduleLoader.get(moduleName);
}

// 提供一个检查模块可用性的函数
export function isModuleAvailable(moduleName) {
    return moduleLoader.isAvailable(moduleName);
}

// 提供一个重新加载模块的函数
export function reloadModule(moduleName) {
    return moduleLoader.reload(moduleName);
}

// 导出全局npm根目录获取函数
export function getGlobalNpmRootPath() {
    return moduleLoader.getGlobalNpmRoot();
}

// 导出缓存清除函数
export function clearModuleCache() {
    return moduleLoader.clearCache();
}