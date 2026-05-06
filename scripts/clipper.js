#!/usr/bin/env node

/**
 * clipper.js
 *
 * 统一调度入口 - 抽象层
 * 识别内容类型 → 分发到具体典藏函数 → 统一后续流程
 */

const path = require('path');
const fs = require('fs');

// 导入自动扫描的典藏器
const clippers = require('./clipper/index');

/**
 * 识别内容类型
 * @param {string} input - 网页 URL 或本地文件路径
 * @returns {ContentType} 内容类型
 */
function detectContentType(input) {
    // 检查是否是本地图片文件
    if (fs.existsSync(input)) {
        const ext = path.extname(input).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
            return 'image';
        }
    }

    // 根据 URL 特征判断是网页/B站/油管/知乎/微信/抖音
    if (input.includes('bilibili.com') || input.includes('b23.tv')) return 'bilibili';
    if (input.includes('youtube.com') || input.includes('youtu.be')) return 'youtube';
    if (input.includes('zhihu.com')) return 'zhihu';
    if (input.includes('mp.weixin.qq.com')) return 'wechat';
    if (input.includes('douyin.com') || input.includes('iesdouyin.com')) return 'douyin';
    return 'web'; // 默认网页
}

/**
 * 加载配置文件
 * @param {string} configPath - 配置文件路径（可选）
 * @returns {ClipperConfig} 配置对象
 */
function loadConfig(configPath) {
    // 1. 默认配置文件路径
    const defaultPaths = [
        configPath,
        path.join(process.cwd(), 'config.json'),
        path.join(__dirname, '..', 'config.json')
    ].filter(Boolean);

    // 2. 尝试读取配置文件
    let config = {};
    for (const p of defaultPaths) {
        if (p && fs.existsSync(p)) {
            config = JSON.parse(fs.readFileSync(p, 'utf8'));
            break;
        }
    }

    // 3. 环境变量覆盖
    if (process.env.SIYUAN_API) {
        config.siyuan = config.siyuan || {};
        config.siyuan.api = process.env.SIYUAN_API;
    }
    if (process.env.SIYUAN_TOKEN) {
        config.siyuan = config.siyuan || {};
        config.siyuan.token = process.env.SIYUAN_TOKEN;
    }

    // 4. 默认输出目录
    config.outputDir = config.outputDir || path.join(process.cwd(), 'output');

    // 5. 默认 categories.json 路径
    config.categoriesPath = config.categoriesPath || path.join(__dirname, '..', 'categories.json');

    return config;
}

/**
 * 解析命令行参数
 * @param {string[]} args - 命令行参数
 * @returns {CliArgs} 解析结果
 */
function parseCliArgs(args) {
    const result = {
        url: null,
        config: null,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--help' || arg === '-h') {
            result.help = true;
        } else if (arg === '--config' || arg === '-c') {
            result.config = args[++i];
        } else if (!arg.startsWith('-') && !result.url) {
            result.url = arg;
        }
    }

    return result;
}

/**
 * 主入口函数
 */
async function main() {
    // 1. 解析命令行参数
    const args = parseCliArgs(process.argv.slice(2));

    // 2. 处理帮助
    if (args.help) {
        printHelp();
        return;
    }

    // 3. 验证 URL
    if (!args.url) {
        console.error('❌ 请提供 URL');
        printHelp();
        process.exit(1);
    }

    // 4. 加载配置
    const config = loadConfig(args.config);

    // 5. 验证思源配置
    if (!config.siyuan?.api || !config.siyuan?.token) {
        console.error('❌ 思源配置缺失：需要在 config.json 中设置 siyuan.api 和 siyuan.token');
        console.error('   或使用环境变量：SIYUAN_API 和 SIYUAN_TOKEN');
        process.exit(1);
    }

    // 6. 识别内容类型
    const contentType = detectContentType(args.url);
    console.log(`📋 检测到内容类型：${contentType}`);

    // 7. 分发到对应的典藏函数（动态调用）
    const clipperName = `${contentType}Clip`;
    const clipperFn = clippers[clipperName] || clippers.webClip;

    if (!clipperFn) {
        console.error(`❌ 不支持的内容类型：${contentType}`);
        process.exit(1);
    }

    const result = await clipperFn(args.url, config);

    // 8. 输出结果
    console.log('\\n✅ 典藏完成！');
    console.log(`   文档 ID: ${result.docId}`);
    console.log(`   笔记本：${result.notebook}`);
    console.log(`   路径：${result.path}`);
}

// 命令行入口
if (require.main === module) {
    main().catch(err => {
        console.error('❌ 执行失败:', err.message);
        process.exit(1);
    });
}

module.exports = {
    detectContentType,
    loadConfig,
    parseCliArgs,
    printHelp
};

// =============================================
// 数据结构定义（JSDoc 类型注释）
// =============================================

/**
 * @typedef {'web' | 'bilibili' | 'youtube' | 'zhihu' | 'wechat' | 'douyin'} ContentType
 */

/**
 * @typedef {Object} ClipperConfig
 * @property {Object} siyuan - 思源配置
 * @property {string} siyuan.api - API 端点
 * @property {string} siyuan.token - API Token
 * @property {string} [outputDir] - opencli 输出目录
 * @property {string} [categoriesPath] - categories.json 路径
 */

/**
 * @typedef {Object} CliArgs
 * @property {string} url - 网页 URL
 * @property {string} [config] - 配置文件路径（可选）
 * @property {boolean} [help] - 是否显示帮助
 */

/**
 * @typedef {Object} ClipperResult
 * @property {boolean} success - 是否成功
 * @property {string} docId - 文档 ID
 * @property {string} notebook - 笔记本名称
 * @property {string} path - 分类路径
 * @property {string} markdownPath - Markdown 文件路径
 */

/**
 * 打印帮助信息
 */
function printHelp() {
    console.log(`
思源智能典藏 - 命令行使用指南

用法:
  node scripts/clipper.js <URL> [选项]

参数:
  URL                     要保存的网页链接

选项:
  -c, --config <路径>      配置文件路径（默认：./config.json）
  -h, --help              显示帮助信息

示例:
  node scripts/clipper.js https://example.com
  node scripts/clipper.js https://example.com --config ./my-config.json

环境变量:
  SIYUAN_API              思源笔记 API 地址
  SIYUAN_TOKEN            思源笔记 API Token
`);
}
