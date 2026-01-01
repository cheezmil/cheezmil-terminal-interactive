import fs from 'fs/promises';
import path from 'path';

/**
 * 生成各种命名风格的变体
 * @param {string} name 
 * @returns {Record<string, string>}
 */
function generateNameVariations(name) {
    const parts = name.split('-');
    const camelCase = parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    const pascalCase = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    const snakeCase = parts.join('_');
    const paramCase = name; // original is param-case
    const headerCase = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-');

    return {
        camelCase,
        pascalCase,
        snakeCase,
        paramCase,
        headerCase,
        original: name
    };
}

/**
 * 替换文件内容
 * @param {string} filePath 
 * @param {Map<string, string>} replacements 
 */
async function replaceInFile(filePath, replacements) {
    try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
            return;
        }

        // 仅处理文本文件，这里用一个简单的后缀名列表判断
        const textExtensions = ['.js', '.mjs', '.ts', '.json', '.md', '.html', '.css', '.txt', '.xml', '.yml', '.yaml'];
        if (!textExtensions.includes(path.extname(filePath).toLowerCase())) {
            return;
        }

        let content = await fs.readFile(filePath, 'utf-8');
        let changed = false;

        for (const [oldName, newName] of replacements.entries()) {
            // 使用正则表达式进行全局替换，确保替换所有出现的地方
            const regex = new RegExp(oldName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
            if (regex.test(content)) {
                content = content.replace(regex, newName);
                changed = true;
            }
        }

        if (changed) {
            await fs.writeFile(filePath, content, 'utf-8');
            console.log(`Updated: ${filePath}`);
        }
    } catch (error) {
        // 忽略二进制文件或没有读取权限的文件
        if (error.code !== 'ENOENT' && !error.message.includes('invalid media type')) {
            console.error(`Could not process file ${filePath}: ${error.message}`);
        }
    }
}

/**
 * 递归重构
 * @param {string} dir 
 * @param {Map<string, string>} replacements 
 */
async function refactorDirectory(dir, replacements) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const oldPath = path.join(dir, entry.name);
        
        // 跳过 node_modules 和 .git 目录
        if (entry.isDirectory() && (entry.name === 'node_modules' || entry.name === '.git')) {
            continue;
        }

        let newName = entry.name;
        let changed = false;
        for (const [oldName, newNameVariant] of replacements.entries()) {
             if (newName.includes(oldName)) {
                newName = newName.replace(new RegExp(oldName, 'g'), newNameVariant);
                changed = true;
            }
        }
        const newPath = path.join(dir, newName);

        if (changed && oldPath !== newPath) {
            await fs.rename(oldPath, newPath);
            console.log(`Renamed: ${oldPath} -> ${newPath}`);
        }

        const currentPath = changed ? newPath : oldPath;

        if (entry.isDirectory()) {
            await refactorDirectory(currentPath, replacements);
        } else if (entry.isFile()) {
            await replaceInFile(currentPath, replacements);
        }
    }
}

/**
 * 主函数
 */
async function main() {
    const oldNames = ['cheestard-terminal-interactive', 'cheestard-terminal-interactive'];
    const newName = 'cheestard-terminal-interactive';
    const targetDir = '.'; // 当前目录

    console.log(`Starting refactor...`);
    console.log(`Replacing '${oldNames.join(', ')}' with '${newName}' in directory '${path.resolve(targetDir)}'`);

    const allReplacements = new Map();

    for (const oldName of oldNames) {
        const oldVariations = generateNameVariations(oldName);
        const newVariations = generateNameVariations(newName);

        Object.keys(oldVariations).forEach(key => {
            // original key is for file/folder name replacement
            if (key === 'original') {
                 allReplacements.set(oldVariations[key], newVariations['paramCase']);
            } else {
                allReplacements.set(oldVariations[key], newVariations[key]);
            }
        });
    }
    
    // 为了确保更长的字符串优先被替换，避免 "cheestard-terminal-interactive" 只被替换了 "cheestard-terminal-interactive" 部分
    const sortedReplacements = new Map([...allReplacements.entries()].sort((a, b) => b[0].length - a[0].length));

    await refactorDirectory(targetDir, sortedReplacements);

    // 在所有文件和目录名重命名后，再次遍历进行内容替换，确保一致性
    console.log('\nPerforming final content replacement pass...');
    await finalContentPass(targetDir, sortedReplacements);


    console.log('\nRefactor complete!');
}

async function finalContentPass(dir, replacements) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.git') {
                await finalContentPass(fullPath, replacements);
            }
        } else if (entry.isFile()) {
            await replaceInFile(fullPath, replacements);
        }
    }
}


main().catch(console.error);