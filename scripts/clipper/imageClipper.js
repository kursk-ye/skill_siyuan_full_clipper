/**
 * imageClipper.js
 *
 * 图片典藏 - 具体实现
 * 上传图片到思源 → LLM生成描述 → 智能分类 → 思源保存
 */

/** @import { ClipperConfig, ClipperResult } from '../types.js' */

const { generateImageDescription, selectCategory } = require('../core/llm_engine');
const { createNote, uploadAsset } = require('../core/save_note');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

/**
 * 上传图片到思源资产
 * @param {string} imagePath - 图片文件路径
 * @param {Object} siyuanConfig - 思源配置
 * @returns {Promise<string>} 资产路径（如 "assets/xxx-xxx.jpg"）
 */
async function uploadImageToSiyuan(imagePath, siyuanConfig) {
    const api = siyuanConfig.api || 'http://127.0.0.1:6806';
    const token = siyuanConfig.token || '';

    console.log(`📤 上传图片到思源：${imagePath}`);

    const formData = new FormData();
    formData.append('file[]', fs.createReadStream(imagePath));

    const headers = formData.getHeaders();
    if (token) {
        headers['Authorization'] = `Token ${token}`;
    }

    // 使用 node-fetch
    const fetch = await import('node-fetch');
    const response = await fetch.default(`${api}/api/asset/upload`, {
        method: 'POST',
        headers: headers,
        body: formData
    });

    if (!response.ok) {
        throw new Error(`上传图片失败: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.code !== 0) {
        throw new Error(`上传图片失败: ${data.msg}`);
    }

    // 思源返回格式: { "code": 0, "data": { "succMap": { "文件名": "assets/xxx.jpg" } } }
    const succMap = data.data?.succMap;
    if (!succMap || typeof succMap !== 'object') {
        throw new Error(`思源 API 上传成功但未返回文件路径 (succMap)`);
    }

    // 获取第一个上传成功的资产路径
    const fileName = path.basename(imagePath);
    const assetPath = succMap[fileName];
    if (!assetPath) {
        throw new Error(`思源 API 上传成功但未找到 ${fileName} 的资产路径`);
    }
    console.log(`✅ 图片上传成功：${assetPath}`);

    return assetPath;
}

/**
 * 图片典藏主函数
 * @param {string} imagePath - 本地图片文件路径
 * @param {ClipperConfig} config - 配置对象
 * @returns {Promise<ClipperResult>} 执行结果
 */
async function imageClip(imagePath, config) {
    console.log('\n🖼️ === 开始图片典藏 ===');
    console.log(`图片路径: ${imagePath}`);

    // 0. 验证图片路径在临时下载目录内
    const tempDownloadDir = config.tempDownloadDir;
    if (!tempDownloadDir) {
        throw new Error('config.json 未配置 tempDownloadDir');
    }

    const resolvedPath = path.resolve(imagePath);
    const resolvedTempDir = path.resolve(tempDownloadDir);
    // 确保目录边界，防止前缀绕过（如 /tmp/downloads 被匹配到 /tmp/downloads_other）
    const normalizedTempDir = resolvedTempDir.endsWith(path.sep)
        ? resolvedTempDir
        : resolvedTempDir + path.sep;
    if (!resolvedPath.startsWith(normalizedTempDir) && resolvedPath !== resolvedTempDir) {
        throw new Error(`图片路径不在临时下载目录内，拒绝处理：${imagePath}（期望目录：${tempDownloadDir})`);
    }
    console.log(`✅ 路径验证通过：${imagePath}`);

    // 1. 验证图片文件存在
    if (!fs.existsSync(imagePath)) {
        throw new Error(`图片文件不存在：${imagePath}`);
    }

    try {
        // 2. 上传图片到思源资产
        const assetPath = await uploadImageToSiyuan(imagePath, config.siyuan);
        // 思源使用相对路径 assets/xxx.png，不是 assets:// 协议
        const assetUrl = assetPath;

        // 3. LLM 生成图片描述（同时返回标题）
        const { title, description } = await generateImageDescription(imagePath);

        // 5. 读取 categories.json，调用 LLM 智能分类
        const categoriesPath = config.categoriesPath || path.join(__dirname, '..', '..', 'categories.json');
        if (!fs.existsSync(categoriesPath)) {
            throw new Error(`categories.json 不存在：${categoriesPath}`);
        }
        const categoriesTree = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
        const category = await selectCategory(title, description, categoriesTree, null);

        // 6. 构建笔记内容（图片链接 + 描述）
        const noteContent = `![Image](${assetUrl})

${description}`;

        // 7. 创建临时 Markdown 文件用于 createNote
        const tempDir = path.join('/tmp', 'siyuan_clipper_temp', Date.now().toString());
        fs.mkdirSync(tempDir, { recursive: true });
        const tempMdPath = path.join(tempDir, 'temp_image.md');

        const frontmatter = `---
title: ${title}
source: image
original_path: ${imagePath}
---

`;
        fs.writeFileSync(tempMdPath, frontmatter + noteContent, 'utf8');

        // 8. 保存到思源笔记
        const noteResult = await createNote(
            category.notebook,
            category.path,
            tempMdPath,
            title,
            imagePath,
            noteContent,
            config.siyuan
        );

        // 9. 清理临时 Markdown 目录
        fs.rmSync(tempDir, { recursive: true, force: true });

        // 10. 删除临时图片文件（上传成功后）
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log(`🗑️ 临时图片已删除：${imagePath}`);
        }

        console.log('\n✅ 图片典藏完成！');

        // 11. 返回 ClipperResult
        return {
            success: true,
            docId: noteResult.docId,
            notebook: noteResult.notebook,
            path: noteResult.path,
            markdownPath: tempMdPath
        };
    } catch (err) {
        throw err;
    }
}

module.exports = {
    imageClip
};