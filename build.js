#!/usr/bin/env node

/**
 * build.js - 跨平台部署构建脚本
 * 用法：node build.js
 * 输出目录：./build/skill_siyuan_full_clipper
 */

const fs = require('fs');
const path = require('path');

// 源目录（工程根目录）
const SOURCE_DIR = path.resolve(__dirname);

// 目标目录（固定为 ./build/skill_siyuan_full_clipper）
const SKILL_NAME = 'skill_siyuan_full_clipper';
const TARGET_DIR = path.join(SOURCE_DIR, 'build', SKILL_NAME);

// 白名单：要复制的所有文件和目录
const WHITELIST = [
    // 配置文件
    'config.json',
    'package.json',
    'package-lock.json',
    // 技能配置
    'skill.md',
    'README.md',
    // 核心目录
    'scripts',
    // 输出目录（临时文件存放处）
    'output',
    // 图片目录
    'image',
];

console.log('📦 开始构建部署包...');
console.log('');
console.log('   源目录：', SOURCE_DIR);
console.log('   目标目录：', TARGET_DIR);
console.log('');

// 检查白名单中的项目是否至少有一个存在
const existingItems = WHITELIST.filter(item => fs.existsSync(path.join(SOURCE_DIR, item)));
if (existingItems.length === 0) {
    console.error('❌ 错误：白名单中没有任何项目存在！');
    console.error('   请检查白名单配置是否正确。');
    console.error('   白名单：', WHITELIST);
    process.exit(1);
}

// 清理旧目录
console.log('🧹 清理目标目录...');
const buildDir = path.join(SOURCE_DIR, 'build');
if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
}
fs.mkdirSync(TARGET_DIR, { recursive: true });

// 复制白名单中的文件/目录
console.log('📋 复制文件...');
const stats = { files: 0, dirs: 1 }; // dirs=1 是 skill_siyuan_full_clipper 根目录

for (const item of WHITELIST) {
    const srcPath = path.join(SOURCE_DIR, item);
    const destPath = path.join(TARGET_DIR, item);

    if (!fs.existsSync(srcPath)) {
        console.error(`❌ 错误：白名单项不存在，停止复制：${item}`);
        process.exit(1);
    }

    if (fs.statSync(srcPath).isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        stats.dirs++;
        copyDirectory(srcPath, destPath, stats);
    } else {
        fs.copyFileSync(srcPath, destPath);
        stats.files++;
    }
}

// 生成部署清单
console.log('');
console.log('✅ 部署包生成完成！');
console.log('');
console.log('📊 统计信息:');
console.log('   文件数量:', stats.files);
console.log('   目录数量:', stats.dirs);
const totalSize = getDirectorySize(TARGET_DIR);
console.log('   总大小:', formatSize(totalSize));
console.log('');
console.log('📁 文件列表:');
const files = getAllFiles(TARGET_DIR);
files.forEach(f => {
    console.log('   ' + path.relative(TARGET_DIR, f));
});

console.log('');
console.log('📋 下一步操作:');
console.log('   1. 测试部署包：cd ' + TARGET_DIR + ' && npm install');
console.log('   2. 同步到 Orange Pi:');
console.log('      scp -r ' + TARGET_DIR + '/* user@orange-pi:/path/to/skills/' + SKILL_NAME + '/');

/**
 * 递归复制目录
 */
function copyDirectory(src, dest, stats) {
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            stats.dirs++;
            copyDirectory(srcPath, destPath, stats);
        } else if (entry.isFile()) {
            fs.copyFileSync(srcPath, destPath);
            stats.files++;
        }
    }
}

/**
 * 获取目录下所有文件
 */
function getAllFiles(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            getAllFiles(fullPath, files);
        } else {
            files.push(fullPath);
        }
    }
    return files;
}

/**
 * 获取目录总大小
 */
function getDirectorySize(dir) {
    let size = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            size += getDirectorySize(fullPath);
        } else {
            size += fs.statSync(fullPath).size;
        }
    }
    return size;
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
