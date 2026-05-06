/**
 * opencli-runner.js
 *
 * 执行 opencli CLI 命令下载网页为 Markdown 文件
 * 利用 opencli 成熟的爬虫能力处理反爬虫网站（知乎、微信公众号等）
 */

/** @import { DownloadResult, SourceType } from '../types.js' */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * 解析知乎 URL，提取问题 ID 或判断是否为专栏文章
 * @param {string} url - 知乎 URL
 * @returns {{ type: 'article' | 'question', id?: string }} URL 类型信息
 */
function parseZhihuUrl(url) {
    // 专栏文章: zhuanlan.zhihu.com/p/xxx
    const articleMatch = url.match(/zhuanlan\.zhihu\.com\/p\/(\d+)/);
    if (articleMatch) {
        return { type: 'article', id: articleMatch[1] };
    }

    // 问题/回答: zhihu.com/question/xxx 或 question/xxx/answer/xxx
    const questionMatch = url.match(/zhihu\.com\/question\/(\d+)/);
    if (questionMatch) {
        return { type: 'question', id: questionMatch[1] };
    }

    // 默认视为文章
    return { type: 'article' };
}

/**
 * 构建 opencli 命令字符串
 * @param {string} sourceType - 内容类型 ('web' | 'bilibili' | 'youtube' | 'zhihu' | 'wechat' | 'douyin')
 * @param {string} url - 目标网页 URL
 * @param {string} outputDir - 输出目录路径
 * @returns {{ command: string, mdPath: string }} 命令字符串和输出路径
 */
function buildCommand(sourceType, url, outputDir) {
    const mdPath = path.join(outputDir, `${Date.now()}.md`);

    let command;
    if (sourceType === 'zhihu') {
        // 知乎需要特殊处理：专栏用 download，问题用 question
        const parsed = parseZhihuUrl(url);
        if (parsed.type === 'question') {
            // 问题/回答：opencli zhihu question <id> --format md
            command = `opencli zhihu question ${parsed.id} --format md`;
        } else {
            // 专栏文章：opencli zhihu download --url <url> --format md
            command = `opencli zhihu download --url "${url}" --output "${outputDir}" --format md`;
        }
    } else if (sourceType === 'weixin') {
        // 微信公众号文章：opencli weixin download --url <url> --download-images true
        command = `opencli weixin download --url "${url}" --output "${outputDir}" --download-images true --format md`;
    } else {
        // 其他类型：opencli <type> read --url <url>
        command = `opencli ${sourceType} read --url "${url}" --output "${outputDir}" --format md`;
    }

    return { command, mdPath };
}

/**
 * 使用 opencli 下载网页为 Markdown
 * @param {string} sourceType - 内容类型 ('web' | 'bilibili' | 'youtube' | 'zhihu' | 'wechat' | 'douyin')
 * @param {string} url - 目标网页 URL
 * @param {string} outputDir - 输出目录路径（建议使用临时目录，工作结束后由调用方清理）
 * @returns {Promise<DownloadResult>} 下载结果对象（只包含路径和元数据，不包含文件内容）
 *
 * 注意：
 * - Markdown 文件会保存到 outputDir 目录中
 * - 调用方负责在任务完成后清理临时目录
 */
async function download(sourceType, url, outputDir) {
    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // 知乎问题需要特殊处理：命令输出到终端，需要捕获并写入文件
    if (sourceType === 'zhihu') {
        const parsed = parseZhihuUrl(url);
        if (parsed.type === 'question') {
            return downloadZhihuQuestion(parsed.id, url, outputDir);
        }
    }

    // 1. 构建 opencli 命令
    const { command } = buildCommand(sourceType, url, outputDir);

    // 2. 执行命令，下载网页为 Markdown 文件
    console.log(`📥 正在下载：${url}`);
    try {
        execSync(command, { stdio: 'pipe' }); // 使用 pipe 而不是 inherit，避免输出混乱
    } catch (err) {
        console.error(`❌ opencli 执行失败：${err.message}`);
        throw new Error(`opencli 下载失败：${err.message}`);
    }

    // 3. 查找生成的 Markdown 文件（opencli 自动生成文件名）
    const mdFile = findMdFile(outputDir);
    if (!mdFile) {
        throw new Error(`opencli 未生成输出文件，目录：${outputDir}`);
    }
    const mdPath = path.join(outputDir, mdFile);

    // 4. 从下载的 Markdown 文件中提取元数据（标题、原文链接、发布时间）
    const metadata = extractMetadata(mdPath);
    console.log(`✅ 下载完成：${metadata.title}`);

    // 5. 返回结果对象
    return {
        mdPath,
        title: metadata.title,
        originalUrl: metadata.originalUrl,
        publishDate: metadata.publishDate,
        source: sourceType
    };
}

/**
 * 下载知乎问题内容（opencli zhihu question 输出到终端）
 * @param {string} questionId - 问题 ID
 * @param {string} originalUrl - 原始 URL
 * @param {string} outputDir - 输出目录
 * @returns {Promise<DownloadResult>}
 */
async function downloadZhihuQuestion(questionId, originalUrl, outputDir) {
    console.log(`📥 正在下载知乎问题：${questionId}`);

    // 执行 opencli zhihu question 命令，捕获输出
    const command = `opencli zhihu question ${questionId} --format md --limit 10`;
    let stdout;
    try {
        stdout = execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
        // 即使有 stderr，stdout 可能仍有内容
        stdout = err.stdout || '';
        if (!stdout && err.stderr) {
            console.error(`❌ opencli 执行失败：${err.stderr}`);
            throw new Error(`opencli 知乎问题下载失败：${err.message}`);
        }
    }

    if (!stdout || stdout.trim().length === 0) {
        throw new Error(`opencli 知乎问题无输出内容`);
    }

    // 从表格输出中提取第一个回答的标题
    const title = extractTitleFromZhihuTable(stdout) || `知乎问题 ${questionId}`;

    // 写入 Markdown 文件
    const mdPath = path.join(outputDir, `zhihu_question_${questionId}.md`);

    // 添加 frontmatter（使用提取的标题）
    const frontmatter = `---
title: ${title}
original_url: ${originalUrl}
source: zhihu
---

`;
    const fullContent = frontmatter + stdout;
    fs.writeFileSync(mdPath, fullContent, 'utf8');

    console.log(`✅ 下载完成：${title}`);

    return {
        mdPath,
        title,
        originalUrl,
        publishDate: null,
        source: 'zhihu'
    };
}

/**
 * 从知乎表格输出中提取第一个回答的标题
 * @param {string} tableOutput - opencli zhihu question 的表格输出
 * @returns {string|null} 提取的标题，失败返回 null
 */
function extractTitleFromZhihuTable(tableOutput) {
    // 解析 Markdown 表格，找到第一个回答的 content
    const lines = tableOutput.split('\n');

    // 找到数据行（跳过 header 和 separator 行）
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('|') || line.includes('---')) continue;

        // 解析表格列
        const cols = line.split('|').map(c => c.trim()).filter(c => c);
        if (cols.length < 4) continue;

        // 第一列是 rank，检查是否是数据行（rank 是数字）
        const rank = parseInt(cols[0]);
        if (isNaN(rank) || rank !== 1) continue;

        // content 在最后一列
        const content = cols[cols.length - 1];
        if (!content) continue;

        // 从 content 提取标题
        // 模式1: "作者名：标题" 格式
        const colonMatch = content.match(/^([^：]+)：(.+)$/);
        if (colonMatch) {
            // 取冒号后面的部分作为标题
            let titlePart = colonMatch[2];

            // 如果有破折号，取破折号后的部分（最多20字）
            if (titlePart.includes('—') || titlePart.includes('-') || titlePart.includes('–')) {
                // 用正则分割，合并连续破折号，取第一个非空部分之后的内容
                const parts = titlePart.split(/[—\-–]+/);
                // 取破折号后的部分（跳过空字符串）
                for (let j = 1; j < parts.length; j++) {
                    if (parts[j].trim()) {
                        titlePart = parts[j].trim();
                        break;
                    }
                }
            }

            // 最终截取最多 25 字
            return titlePart.substring(0, 25).trim();
        }

        // 模式2: 直接截取前 20 字
        return content.substring(0, 20).trim();
    }

    return null;
}

/**
 * 查找输出目录中最新生成的 Markdown 文件
 * opencli web read 会创建 {outputDir}/{标题}/{标题}.md 结构
 * @param {string} outputDir - 输出目录
 * @returns {string|null} 文件路径（相对于 outputDir），未找到返回 null
 */
function findMdFile(outputDir) {
    if (!fs.existsSync(outputDir)) {
        return null;
    }

    const allMdFiles = [];

    // 递归查找所有 .md 文件
    function searchDir(dir) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    searchDir(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.md')) {
                    allMdFiles.push(fullPath);
                }
            }
        } catch (err) {
            // 忽略目录读取错误
        }
    }

    searchDir(outputDir);

    if (allMdFiles.length === 0) {
        return null;
    }

    // 按修改时间排序，返回最新的文件
    allMdFiles.sort((a, b) => {
        const statA = fs.statSync(a);
        const statB = fs.statSync(b);
        return statB.mtimeMs - statA.mtimeMs;
    });

    // 返回相对于 outputDir 的路径
    return path.relative(outputDir, allMdFiles[0]);
}

/**
 * 从 Markdown 文件中提取元数据（标题、原文链接）
 * @param {string} mdPath - Markdown 文件路径
 * @returns {MarkdownMetadata} 元数据对象
 */
function extractMetadata(mdPath) {
    // 实现：读取文件头部，提取标题、原文链接等元数据
    // 不读取完整文件内容，只解析 frontmatter 部分
    const content = fs.readFileSync(mdPath, 'utf8');
    const lines = content.split('\n').slice(0, 30); // 只读前 30 行，增加行数以获取时间信息
    const headerContent = lines.join('\n');

    return {
        title: extractTitle(headerContent),
        originalUrl: extractOriginalUrl(headerContent),
        publishDate: extractPublishDate(headerContent)
    };
}

/**
 * 从 Markdown 内容中提取标题
 * @param {string} content - Markdown 内容（仅头部前几行）
 * @returns {string} 标题
 */
function extractTitle(content) {
    // 实现：提取第一个 # 开头的行
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : '无标题';
}

/**
 * 从 Markdown 内容中提取原文链接
 * @param {string} content - Markdown 内容（仅头部前几行）
 * @returns {string|null} 原文 URL，未找到返回 null
 */
function extractOriginalUrl(content) {
    // 实现：提取原文链接（通常在 frontmatter 或注释中）
    const match = content.match(/(?:original_url|source|url):\s*(.+)$/m) ||
                  content.match(/\[原文\]\((.+)\)/) ||
                  content.match(/<!--\s*original_url:\s*(.+?)\s*-->/);
    return match ? match[1].trim() : null;
}

/**
 * 从 Markdown 内容中提取发布时间
 * @param {string} content - Markdown 内容（仅头部前几行）
 * @returns {string|null} 发布时间（YYYY-MM-DD 格式），未找到返回 null
 */
function extractPublishDate(content) {
    // 尝试多种日期格式
    const patterns = [
        /(?:publish(?:ed)?_?(?:date|time)|date|time|created(?:_?(?:at))?):\s*(\d{4}-\d{2}-\d{2})/i,  // key: YYYY-MM-DD
        /(\d{4}[-/]\d{2}[-/]\d{2})/,  // 直接匹配日期
        /(\d{4}年\d{1,2}月\d{1,2}日)/  // 中文日期
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
            let dateStr = match[1];
            // 统一转换为 YYYY-MM-DD 格式
            dateStr = dateStr.replace(/[年.]/g, '-').replace(/月/g, '-').replace(/日/g, '');
            return dateStr;
        }
    }
    return null;
}

/**
 * 从 URL 中提取 B站 BV号
 * @param {string} url - B站视频 URL（支持 bilibili.com/video/BVxxx 或 b23.tv/xxx）
 * @returns {string|null} BV号，未找到返回 null
 */
function extractBvid(url) {
    // 标准 URL: bilibili.com/video/BVxxx
    const bvidMatch = url.match(/(BV[a-zA-Z0-9]+)/);
    if (bvidMatch) {
        return bvidMatch[1];
    }
    return null;
}

/**
 * 获取 B站视频元数据
 * @param {string} bvid - BV号
 * @returns {Promise<{title: string, author: string, originalUrl: string, publishDate: string|null}>}
 */
async function getBilibiliMetadata(bvid) {
    const command = `opencli bilibili video ${bvid} --format json`;
    console.log(`📥 获取B站视频元数据：${bvid}`);

    try {
        const stdout = execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        const data = JSON.parse(stdout);

        // opencli bilibili video 返回的是表格格式，需要解析
        // 格式: [{field: 'title', value: 'xxx'}, {field: 'author', value: 'xxx'}, ...]
        const metadata = {};
        if (Array.isArray(data)) {
            data.forEach(item => {
                if (item.field && item.value) {
                    metadata[item.field] = item.value;
                }
            });
        }

        return {
            title: metadata.title || metadata.Title || '无标题',
            author: metadata.author || metadata.Author || metadata.uploader || '未知UP主',
            originalUrl: `https://www.bilibili.com/video/${bvid}`,
            publishDate: metadata.pubdate || metadata.Publish_time || null
        };
    } catch (err) {
        console.error(`❌ 获取B站元数据失败：${err.message}`);
        return {
            title: '无标题',
            author: '未知UP主',
            originalUrl: `https://www.bilibili.com/video/${bvid}`,
            publishDate: null
        };
    }
}

/**
 * 下载 B站视频字幕
 * @param {string} bvid - BV号
 * @param {string} outputDir - 输出目录
 * @returns {Promise<{subtitlePath: string|null, exists: boolean}>}
 */
async function downloadBilibiliSubtitle(bvid, outputDir) {
    const subtitlePath = path.join(outputDir, `subtitle_${bvid}.md`);
    const command = `opencli bilibili subtitle ${bvid} --format md`;

    console.log(`📥 获取B站字幕：${bvid}`);

    try {
        const stdout = execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

        if (!stdout || stdout.trim().length === 0 || stdout.includes('无字幕')) {
            console.log('⚠️ 该视频无字幕');
            return { subtitlePath: null, exists: false };
        }

        // 写入字幕文件
        fs.writeFileSync(subtitlePath, stdout, 'utf8');
        console.log(`✅ 字幕已保存：${subtitlePath}`);

        return { subtitlePath, exists: true };
    } catch (err) {
        // 无字幕时 opencli 可能返回错误
        console.log('⚠️ 该视频无字幕');
        return { subtitlePath: null, exists: false };
    }
}

/**
 * 下载 B站视频评论（热门前20条）
 * @param {string} bvid - BV号
 * @param {string} outputDir - 输出目录
 * @returns {Promise<{commentsPath: string}>}
 */
async function downloadBilibiliComments(bvid, outputDir) {
    const commentsPath = path.join(outputDir, `comments_${bvid}.md`);
    const command = `opencli bilibili comments ${bvid} --limit 20 --format md`;

    console.log(`📥 获取B站评论：${bvid}`);

    try {
        const stdout = execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

        if (!stdout || stdout.trim().length === 0) {
            // 如果没有评论，写入提示
            fs.writeFileSync(commentsPath, '暂无评论', 'utf8');
            console.log('⚠️ 该视频暂无评论');
        } else {
            fs.writeFileSync(commentsPath, stdout, 'utf8');
            console.log(`✅ 评论已保存：${commentsPath}`);
        }

        return { commentsPath };
    } catch (err) {
        console.error(`❌ 获取评论失败：${err.message}`);
        fs.writeFileSync(commentsPath, '获取评论失败', 'utf8');
        return { commentsPath };
    }
}

/**
 * 从 URL 中提取 YouTube 视频 ID
 * @param {string} url - YouTube 视频 URL（支持 youtube.com/watch?v=xxx 和 youtu.be/xxx）
 * @returns {string|null} 视频ID，未找到返回 null
 */
function extractYoutubeId(url) {
    // 标准 URL: youtube.com/watch?v=VIDEO_ID
    const standardMatch = url.match(/v=([a-zA-Z0-9_-]+)/);
    if (standardMatch) {
        return standardMatch[1];
    }
    // 短链接: youtu.be/VIDEO_ID
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) {
        return shortMatch[1];
    }
    return null;
}

/**
 * 获取 YouTube 视频元数据
 * @param {string} videoId - 视频ID
 * @returns {Promise<{title: string, author: string, originalUrl: string, publishDate: string|null}>}
 */
async function getYoutubeMetadata(videoId) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const command = `opencli youtube video "${url}" --format json`;
    console.log(`📥 获取YouTube视频元数据：${videoId}`);

    try {
        const stdout = execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        const data = JSON.parse(stdout);

        // opencli youtube video 返回的是 [{field: 'xxx', value: 'xxx'}, ...] 格式
        const metadata = {};
        if (Array.isArray(data)) {
            data.forEach(item => {
                if (item.field && item.value) {
                    // 转换字段名（opencli 返回的字段名可能与我们的不一致）
                    const field = item.field.toLowerCase().replace(/_/g, '');
                    metadata[field] = item.value;
                }
            });
        }

        // 提取标题、作者、发布时间
        return {
            title: metadata.title || '无标题',
            author: metadata.author || metadata.channel || metadata.uploader || '未知作者',
            originalUrl: url,
            publishDate: metadata.publishdate || metadata.date || metadata.published || null
        };
    } catch (err) {
        console.error(`❌ 获取YouTube元数据失败：${err.message}`);
        return {
            title: '无标题',
            author: '未知作者',
            originalUrl: url,
            publishDate: null
        };
    }
}

/**
 * 下载 YouTube 视频字幕（中文优先，英语备选）
 * @param {string} videoId - 视频ID
 * @param {string} outputDir - 输出目录
 * @returns {Promise<{transcriptPath: string|null, exists: boolean}>}
 */
async function downloadYoutubeTranscript(videoId, outputDir) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const transcriptPath = path.join(outputDir, `transcript_${videoId}.md`);

    console.log(`📥 获取YouTube字幕：${videoId}`);

    // 1. 先尝试中文字幕
    const zhCommand = `opencli youtube transcript "${url}" --lang zh-Hans --format md`;
    try {
        const stdout = execSync(zhCommand, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        if (stdout && stdout.trim().length > 0) {
            fs.writeFileSync(transcriptPath, stdout, 'utf8');
            console.log(`✅ 中文字幕已保存：${transcriptPath}`);
            return { transcriptPath, exists: true };
        }
    } catch (err) {
        console.log('⚠️ 无中文字幕，尝试英语字幕...');
    }

    // 2. 尝试英语字幕
    const enCommand = `opencli youtube transcript "${url}" --lang en --format md`;
    try {
        const stdout = execSync(enCommand, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        if (stdout && stdout.trim().length > 0) {
            fs.writeFileSync(transcriptPath, stdout, 'utf8');
            console.log(`✅ 英语字幕已保存：${transcriptPath}`);
            return { transcriptPath, exists: true };
        }
    } catch (err) {
        console.log('⚠️ 无英语字幕');
    }

    // 3. 都没有字幕
    console.log('⚠️ 该视频无字幕');
    return { transcriptPath: null, exists: false };
}

/**
 * 下载 YouTube 视频评论（热门前20条）
 * @param {string} videoId - 视频ID
 * @param {string} outputDir - 输出目录
 * @returns {Promise<{commentsPath: string}>}
 */
async function downloadYoutubeComments(videoId, outputDir) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const commentsPath = path.join(outputDir, `comments_${videoId}.md`);
    const command = `opencli youtube comments "${url}" --limit 20 --format md`;

    console.log(`📥 获取YouTube评论：${videoId}`);

    try {
        const stdout = execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

        if (!stdout || stdout.trim().length === 0) {
            fs.writeFileSync(commentsPath, '暂无评论', 'utf8');
            console.log('⚠️ 该视频暂无评论');
        } else {
            fs.writeFileSync(commentsPath, stdout, 'utf8');
            console.log(`✅ 评论已保存：${commentsPath}`);
        }

        return { commentsPath };
    } catch (err) {
        console.error(`❌ 获取评论失败：${err.message}`);
        fs.writeFileSync(commentsPath, '获取评论失败', 'utf8');
        return { commentsPath };
    }
}

module.exports = {
    buildCommand,
    download,
    downloadZhihuQuestion,
    parseZhihuUrl,
    extractMetadata,
    extractTitleFromZhihuTable,
    extractBvid,
    getBilibiliMetadata,
    downloadBilibiliSubtitle,
    downloadBilibiliComments,
    extractYoutubeId,
    getYoutubeMetadata,
    downloadYoutubeTranscript,
    downloadYoutubeComments
};
