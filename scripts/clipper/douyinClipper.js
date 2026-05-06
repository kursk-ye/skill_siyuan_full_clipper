/**
 * douyinClipper.js
 *
 * 抖音视频典藏 - 具体实现
 * 提取视频信息/字幕 → LLM 摘要 → 智能分类 → 思源保存
 */

/** @import { ClipperConfig, ClipperResult } from '../types.js' */

const { download } = require('../core/opencli-runner');

/**
 * 抖音视频典藏主函数
 * @param {string} url - 抖音视频 URL
 * @param {ClipperConfig} config - 配置对象
 * @returns {Promise<ClipperResult>} 执行结果
 */
async function douyinClip(url, config) {
    // 1. 使用 opencli 下载抖音视频信息 → { mdPath, title, originalUrl, source: 'douyin' }
    const downloadResult = await download('douyin', url, config.outputDir);

    // 2. 调用 LLM 生成摘要
    // 3. 读取 categories.json，调用 LLM 智能分类
    // 4. 保存到思源笔记
    // 5. 返回 ClipperResult
}

module.exports = {
    douyinClip
};
