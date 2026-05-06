/**
 * youtubeClipper.js
 *
 * YouTube视频典藏 - 具体实现
 * 获取视频元数据 → 字幕/评论 → LLM详细总结 → 智能分类 → 思源保存
 */

/** @import { ClipperConfig, ClipperResult } from '../types.js' */

const {
    extractYoutubeId,
    getYoutubeMetadata,
    downloadYoutubeTranscript,
    downloadYoutubeComments
} = require('../core/opencli-runner');
const { generateSummary, selectCategory } = require('../core/llm_engine');
const { createNote } = require('../core/save_note');
const fs = require('fs');
const path = require('path');

/**
 * 构建临时 Markdown 文件（包含元数据 + 字幕/评论内容）
 * @param {Object} metadata - 视频元数据
 * @param {string} contentPath - 字幕或评论文件路径
 * @param {string} contentType - 内容类型 ('transcript' | 'comments')
 * @param {string} outputDir - 输出目录
 * @returns {string} 临时 Markdown 文件路径
 */
function buildTempMd(metadata, contentPath, contentType, outputDir) {
    const tempMdPath = path.join(outputDir, `temp_${Date.now()}.md`);

    // 读取字幕/评论内容
    const content = fs.readFileSync(contentPath, 'utf8');

    // 构建 frontmatter
    const frontmatter = `---
title: ${metadata.title}
author: ${metadata.author}
original_url: ${metadata.originalUrl}
source: youtube
publish_date: ${metadata.publishDate || ''}
content_type: ${contentType}
---

# ${metadata.title}

> 作者: ${metadata.author}
> 原文链接: ${metadata.originalUrl}
> 来源: YouTube

---

## ${contentType === 'transcript' ? '字幕内容' : '热门评论'}

${content}
`;

    fs.writeFileSync(tempMdPath, frontmatter, 'utf8');
    return tempMdPath;
}

/**
 * YouTube视频典藏主函数
 * @param {string} url - YouTube视频 URL（youtube.com/watch?v=xxx 或 youtu.be/xxx）
 * @param {ClipperConfig} config - 配置对象
 * @returns {Promise<ClipperResult>} 执行结果
 */
async function youtubeClip(url, config) {
    console.log('\n▶️ === 开始YouTube典藏 ===');
    console.log(`URL: ${url}`);

    // 1. 解析视频ID
    const videoId = extractYoutubeId(url);
    if (!videoId) {
        throw new Error(`无法从URL提取视频ID：${url}`);
    }
    console.log(`视频ID: ${videoId}`);

    // 2. 创建临时目录
    const outputDir = path.join('/tmp', 'siyuan_clipper_temp', Date.now().toString());
    fs.mkdirSync(outputDir, { recursive: true });

    try {
        // 3. 获取视频元数据
        const metadata = await getYoutubeMetadata(videoId);
        console.log(`✅ 元数据获取完成：${metadata.title} - ${metadata.author}`);

        // 4. 尝试获取字幕（中文优先 → 英语）
        const transcriptResult = await downloadYoutubeTranscript(videoId, outputDir);

        // 5. 构建临时 Markdown（字幕或评论）
        let contentPath;
        let contentType;
        if (transcriptResult.exists) {
            contentPath = transcriptResult.transcriptPath;
            contentType = 'transcript';
            console.log('✅ 使用字幕内容生成总结');
        } else {
            // 无字幕时获取评论
            const commentsResult = await downloadYoutubeComments(videoId, outputDir);
            contentPath = commentsResult.commentsPath;
            contentType = 'comments';
            console.log('✅ 使用评论内容生成总结');
        }

        // 构建临时 Markdown 文件
        const tempMdPath = buildTempMd(metadata, contentPath, contentType, outputDir);

        // 6. 调用 LLM 生成详细总结
        const summary = await generateSummary(tempMdPath, { detailed: true });

        // 7. 读取 categories.json，调用 LLM 智能分类
        const categoriesPath = config.categoriesPath || path.join(__dirname, '..', '..', 'categories.json');
        if (!fs.existsSync(categoriesPath)) {
            throw new Error(`categories.json 不存在：${categoriesPath}`);
        }
        const categoriesTree = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
        const category = await selectCategory(metadata.title, summary, categoriesTree, metadata.publishDate);

        // 8. 保存到思源笔记（传递详细总结作为内容）
        const noteResult = await createNote(
            category.notebook,
            category.path,
            tempMdPath,
            metadata.title,
            metadata.originalUrl,
            summary,  // 详细总结作为笔记内容
            config.siyuan
        );

        // 9. 清理临时目录
        fs.rmSync(outputDir, { recursive: true, force: true });

        console.log('\n✅ YouTube典藏完成！');

        // 10. 返回 ClipperResult
        return {
            success: true,
            docId: noteResult.docId,
            notebook: noteResult.notebook,
            path: noteResult.path,
            markdownPath: tempMdPath
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
    youtubeClip
};