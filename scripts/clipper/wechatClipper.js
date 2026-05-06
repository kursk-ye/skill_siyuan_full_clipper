/**
 * wechatClipper.js
 *
 * 微信公众号文章典藏 - 具体实现
 * 提取公众号文章内容 → LLM 摘要 → 智能分类 → 思源保存
 */

/** @import { ClipperConfig, ClipperResult } from '../types.js' */

const { download } = require('../core/opencli-runner');
const { generateSummary, selectCategory } = require('../core/llm_engine');
const { createNote } = require('../core/save_note');
const fs = require('fs');
const path = require('path');

/**
 * 微信公众号文章典藏主函数
 * @param {string} url - 微信公众号文章 URL (mp.weixin.qq.com/s/xxx)
 * @param {ClipperConfig} config - 配置对象
 * @returns {Promise<ClipperResult>} 执行结果
 */
async function wechatClip(url, config) {
    console.log('\n📱 === 开始微信典藏 ===');
    console.log(`URL: ${url}`);

    // 1. 创建临时目录（使用 /tmp 避免 VMWare 共享文件夹的文件锁问题）
    const outputDir = path.join('/tmp', 'siyuan_clipper_temp', Date.now().toString());
    fs.mkdirSync(outputDir, { recursive: true });

    try {
        // 2. 使用 opencli 下载微信公众号文章 → { mdPath, title, originalUrl, source: 'weixin' }
        const downloadResult = await download('weixin', url, outputDir);

        // 3. 调用 LLM 生成摘要
        const summary = await generateSummary(downloadResult.mdPath);

        // 4. 读取 categories.json，调用 LLM 智能分类（传递发布时间）
        const categoriesPath = config.categoriesPath || path.join(__dirname, '..', '..', 'categories.json');
        if (!fs.existsSync(categoriesPath)) {
            throw new Error(`categories.json 不存在：${categoriesPath}`);
        }
        const categoriesTree = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
        const category = await selectCategory(downloadResult.title, summary, categoriesTree, downloadResult.publishDate);

        // 5. 保存到思源笔记（传递摘要）
        const originalUrl = downloadResult.originalUrl || url;
        const noteResult = await createNote(
            category.notebook,
            category.path,
            downloadResult.mdPath,
            downloadResult.title,
            originalUrl,
            summary,
            config.siyuan
        );

        // 6. 清理临时目录
        fs.rmSync(outputDir, { recursive: true, force: true });

        console.log('\n✅ 微信典藏完成！');

        // 7. 返回 ClipperResult
        return {
            success: true,
            docId: noteResult.docId,
            notebook: noteResult.notebook,
            path: noteResult.path,
            markdownPath: downloadResult.mdPath
        };
    } catch (err) {
        // 发生错误时也要清理临时目录
        try {
            fs.rmSync(outputDir, { recursive: true, force: true });
        } catch (e) {
            // 忽略清理错误
        }
        throw err;
    }
}

module.exports = {
    wechatClip
};