/**
 * clipper/index.js
 *
 * 自动扫描并导出所有典藏器
 * 新增典藏器时，只需创建 *Clipper.js 文件，无需修改此文件
 *
 * 约定：每个 Clipper 文件必须导出一个与文件名同名的主函数
 * 例如：webClipper.js 导出 webClip() 函数
 */

const fs = require('fs');
const path = require('path');

const clippers = {};

// 扫描当前目录下所有 *Clipper.js 文件
fs.readdirSync(__dirname)
    .filter(file => file.endsWith('Clipper.js') && file !== 'index.js')
    .forEach(file => {
        const clipperModule = require(`./${file}`);
        // 获取模块导出的所有函数，合并到 clippers 对象
        Object.assign(clippers, clipperModule);
    });

module.exports = clippers;
