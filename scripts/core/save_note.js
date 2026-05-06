/**
 * save_note.js
 *
 * 创建思源笔记文档，支持图片本地化
 */

/** @import { ClipperResult, SiYuanConfig } from '../types.js' */

const fs = require('fs');
const path = require('path');

// node-fetch v3 是 ES 模块，使用动态导入
let _fetch;
async function getFetch() {
    if (!_fetch) {
        const nodeFetch = await import('node-fetch');
        _fetch = nodeFetch.default;
    }
    return _fetch;
}

/**
 * 在思源笔记中创建文档
 * @param {string} notebook - 笔记本名称
 * @param {string} path - 分类路径（如 "/AI/文章标题"）
 * @param {string} markdownPath - Markdown 文件路径（不传递内容，直接读文件）
 * @param {string} title - 文章标题
 * @param {string|null} originalUrl - 原文链接
 * @param {string|null} summary - LLM 生成的摘要
 * @param {SiyuanConfig} config - 思源 API 配置
 * @returns {Promise<CreateResult>} 创建结果
 */
/**
 * 保存笔记到思源笔记
 * 流程：先上传所有图片 → 替换 Markdown 中的图片路径 → 一次性创建文档
 */
async function createNote(notebook, p, markdownPath, title, originalUrl, summary, config) {
    console.log(`📝 正在创建笔记：${title}`);
    console.log(`   笔记本：${notebook}`);
    console.log(`   路径：${p}`);
    console.log(`   标题：${title}`);
    console.log(`    sanitized 标题：${sanitizeFileName(title)}`);

    // 1. 读取 Markdown 文件内容
    let markdownContent = fs.readFileSync(markdownPath, 'utf8');
    console.log(`   Markdown 文件大小：${markdownContent.length} 字节`);

    // 2. 获取笔记本列表，查找笔记本 ID
    const notebooks = await getNotebooks(config);
    const notebookObj = findNotebookById(notebook, notebooks);

    if (!notebookObj) {
        throw new Error(`笔记本不存在：${notebook}`);
    }

    // 3. 确保路径存在（递归创建目录，支持模糊匹配）
    const actualPath = await ensurePathExists(notebookObj.id, p, config);

    // 4. 【新增】先上传本地图片（不需要 docId），获取 assets 路径
    const mdDir = path.dirname(markdownPath);
    // 传递 originalUrl 作为 baseURL，用于解析网页相对路径的图片
    const { updatedContent: markdownWithLocalImages } = await uploadImagesAndReplace(markdownContent, mdDir, config, originalUrl);
    markdownContent = markdownWithLocalImages;

    // 5. 构建带 frontmatter 和摘要的 Markdown
    const fullMarkdown = buildMarkdownWithFrontmatter(title, originalUrl, summary, markdownContent);

    // 6. 构建完整文档路径（包含标题）
    const docPath = actualPath.endsWith('/') ? actualPath + sanitizeFileName(title) : actualPath + '/' + sanitizeFileName(title);

    // 7. 调用思源 API 创建文档（一次性完成，图片已预先上传）
    const fetch = await getFetch();
    const createUrl = `${config.api}/api/filetree/createDocWithMd`;

    const createRequestBody = {
        notebook: notebookObj.id,
        path: docPath,
        title: sanitizeFileName(title),
        markdown: fullMarkdown
    };

    console.log(`   创建文档...`);
    console.log(`   请求 URL: ${createUrl}`);
    console.log(`   请求 body: notebook=${notebookObj.id}, path=${docPath}, title=${sanitizeFileName(title)}`);

    const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${config.token}`
        },
        body: JSON.stringify(createRequestBody)
    });

    console.log(`   响应状态：${createResponse.status}`);

    const responseText = await createResponse.text();
    console.log(`   响应内容：${responseText.substring(0, 500)}`);

    let createResult;
    try {
        createResult = JSON.parse(responseText);
    } catch (err) {
        throw new Error(`思源 API 返回非 JSON 响应：${responseText.substring(0, 200)}`);
    }

    if (createResult.code !== 0) {
        throw new Error(`思源 API 创建失败：${createResult.msg}`);
    }

    const docId = createResult.data;
    console.log(`✅ 笔记创建成功：${docId}`);

    // 8. 【可选】调用思源 API 将网络图片转换为本地图片
    // 这个 API 会扫描文档中的所有外部图片链接，下载并转换为 assets:// 格式
    // 注意：只有当 Markdown 中包含 ![](url) 格式的图片链接时才有效
    if (originalUrl) {
        const converted = await localizeNetworkImages(docId, originalUrl, config);
        if (!converted) {
            console.log(`   ℹ️  如果网页包含动态加载的图片，建议使用思源 Chrome 插件保存`);
        }
    }

    return {
        success: true,
        docId: docId,
        notebook: notebook,
        path: actualPath
    };
}

/**
 * 构建带 frontmatter 和摘要的 Markdown
 * @param {string} title - 文章标题
 * @param {string} originalUrl - 原文链接
 * @param {string|null} summary - LLM 生成的摘要
 * @param {string} markdownContent - Markdown 正文
 * @returns {string} 完整的 Markdown（含 frontmatter 和摘要）
 */
function buildMarkdownWithFrontmatter(title, originalUrl, summary, markdownContent) {
    const frontmatter = `---
title: ${title}
created: ${new Date().toISOString()}
${originalUrl ? `source: ${originalUrl}` : ''}
---

`;

    // 如果有摘要，在 frontmatter 后添加摘要部分
    const summarySection = summary ? `## 摘要\n\n${summary}\n\n---\n\n` : '';

    return frontmatter + summarySection + markdownContent;
}

/**
 * 从 Markdown 内容中提取本地图片路径并上传到思源
 * opencli 下载的图片保存在 images 子目录中
 * @param {string} mdContent - Markdown 内容
 * @param {string} mdDir - Markdown 文件所在目录
 * @param {string} docId - 文档 ID（用于插入资产）
 * @param {SiyuanConfig} config - 思源 API 配置
 * @returns {Promise<{updatedContent: string, assetMap: Object}>} 更新后的 Markdown 内容和资产映射
 */
async function localizeLocalImages(mdContent, mdDir, docId, config) {
    // 匹配 ![](images/xxx.png) 或 ![](./images/xxx.png) 格式的图片
    const pattern = /(!\[.*?\])\((images\/[^)]+)\)/g;

    const matches = [...mdContent.matchAll(pattern)];
    if (matches.length === 0) {
        console.log('   🖼️  未检测到本地图片');
        return { updatedContent: mdContent, assetMap: {} };
    }

    console.log(`   🖼️  检测到 ${matches.length} 张本地图片，正在上传到思源...`);

    // 收集所有需要上传的图片路径
    const imagePaths = [];
    const pathToMatch = new Map(); // 文件名 -> { fullMatch, altText, relativePath }

    for (const match of matches) {
        const [fullMatch, altText, relativePath] = match;
        const imagePath = path.join(mdDir, relativePath);
        const fileName = path.basename(imagePath);

        // 检查图片文件是否存在
        if (!fs.existsSync(imagePath)) {
            console.warn(`   ⚠️  图片文件不存在：${imagePath}`);
            continue;
        }

        imagePaths.push(imagePath);
        // 用文件名作为 key，因为思源 API 返回的 succMap 键只是文件名
        pathToMatch.set(fileName, { fullMatch, altText, relativePath, imagePath });
    }

    if (imagePaths.length === 0) {
        console.log('   ⚠️  没有有效的图片需要上传');
        return { updatedContent: mdContent, assetMap: {} };
    }

    // 调用思源 API 插入本地资产
    // 注意：succMap 的键是文件名（不是完整路径），值是 assets 相对路径
    const succMap = await insertLocalAssetsToSiYuan(docId, imagePaths, config);

    // 替换 Markdown 中的图片路径
    let updatedContent = mdContent;
    const assetMap = {};

    // succMap: { "xxx.png": "assets/20260420/xxx_abc123.png" }
    for (const [fileName, assetPath] of Object.entries(succMap)) {
        const matchInfo = pathToMatch.get(fileName);

        if (matchInfo) {
            const assetUrl = `assets://${assetPath}`;
            console.log(`      ✓ 已上传：${matchInfo.relativePath} → ${assetUrl}`);
            updatedContent = updatedContent.replace(matchInfo.fullMatch, `${matchInfo.altText}](${assetUrl})`);
            assetMap[matchInfo.imagePath] = assetPath;
        }
    }

    return { updatedContent, assetMap };
}

/**
 * 调用思源 API 插入本地资产到指定文档
 * @param {string} docId - 文档 ID
 * @param {string[]} localPaths - 本地文件路径数组
 * @param {SiyuanConfig} config - 思源 API 配置
 * @returns {Promise<Object>} 映射关系 { 本地路径：思源资产路径 }
 */
async function insertLocalAssetsToSiYuan(docId, localPaths, config) {
    const fetch = await getFetch();

    const url = `${config.api}/api/asset/insertLocalAssets`;

    const requestBody = {
        id: docId,
        assetPaths: localPaths,
        isUpload: true  // true 表示复制文件到思源 assets 目录
    };

    console.log(`   插入本地资产：${localPaths.length} 个文件`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${config.token}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`思源 API 插入资产失败：HTTP ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (result.code !== 0) {
        throw new Error(`思源 API 插入资产失败：${result.msg}`);
    }

    // 思源 API 返回：{ "code": 0, "data": { "succMap": { "本地路径": "assets/20260420/xxx.png" } } }
    const succMap = result.data?.succMap;
    if (!succMap || typeof succMap !== 'object') {
        throw new Error(`思源 API 插入资产成功但未返回文件路径 (succMap)`);
    }

    console.log(`   资产映射：`, JSON.stringify(succMap, null, 2));

    return succMap;
}

/**
 * 上传本地图片并替换 Markdown 中的路径（不需要 docId）
 * 支持两种图片：
 * 1. 本地图片：![](images/xxx.png) - opencli 下载到本地 images 目录
 * 2. 网络图片：![](/images/xxx.jpg) 或 ![](https://xxx.jpg) - 需要下载后上传
 * @param {string} mdContent - Markdown 内容
 * @param {string} mdDir - Markdown 文件所在目录
 * @param {SiyuanConfig} config - 思源 API 配置
 * @param {string} baseUrl - 原文 baseURL（用于解析相对路径）
 * @returns {Promise<{updatedContent: string, assetMap: Object}>} 更新后的 Markdown 内容和资产映射
 */
async function uploadImagesAndReplace(mdContent, mdDir, config, baseUrl) {
    // 匹配三种图片格式：
    // 1. ![](images/xxx.png) - 本地图片
    // 2. ![](/images/xxx.jpg) - 网站相对路径
    // 3. ![](https://xxx.jpg) - 绝对 URL
    const pattern = /(!\[.*?\])\(((images\/[^)]+)|\/[^)]+|(https?:\/\/[^)]+))\)/g;

    const matches = [...mdContent.matchAll(pattern)];
    if (matches.length === 0) {
        console.log('   🖼️  未检测到图片');
        return { updatedContent: mdContent, assetMap: {} };
    }

    console.log(`   🖼️  检测到 ${matches.length} 张图片，正在处理...`);

    const fetch = await getFetch();
    const FormData = (await import('form-data')).default;

    // 收集所有需要上传的图片（本地路径或下载后的临时路径）
    const imagePaths = [];
    const pathToMatch = new Map(); // 唯一 key -> { fullMatch, altText, originalPath }
    const tempFiles = []; // 需要清理的临时文件

    for (const match of matches) {
        const [fullMatch, altText, , localPath, absPath] = match;
        const imagePath = localPath || absPath;

        let finalPath;
        let key;

        if (localPath && localPath.startsWith('images/')) {
            // 本地图片：opencli 已下载到 images 目录
            finalPath = path.join(mdDir, localPath);
            key = 'local:' + localPath;

            if (!fs.existsSync(finalPath)) {
                console.warn(`   ⚠️  图片文件不存在：${finalPath}`);
                continue;
            }
        } else if (absPath) {
            // 网络图片：需要下载
            let imageUrl = absPath;
            if (absPath.startsWith('/')) {
                // 相对 URL，需要拼接 baseURL
                imageUrl = baseUrl ? baseUrl.replace(/\/$/, '') + absPath : absPath;
            }

            console.log(`   📥 下载图片：${imageUrl}`);
            try {
                const response = await fetch(imageUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const buffer = await response.buffer();
                const fileName = path.basename(new URL(imageUrl, 'http://example.com').pathname);
                const tempPath = path.join(mdDir, 'temp_' + fileName);
                fs.writeFileSync(tempPath, buffer);

                finalPath = tempPath;
                key = 'web:' + fileName;
                tempFiles.push(tempPath);
                console.log(`      ✓ 下载完成：${fileName} (${buffer.length} 字节)`);
            } catch (err) {
                console.warn(`   ⚠️  图片下载失败：${imageUrl} - ${err.message}`);
                continue;
            }
        } else {
            continue;
        }

        imagePaths.push(finalPath);
        pathToMatch.set(key, { fullMatch, altText, originalPath: imagePath });
    }

    if (imagePaths.length === 0) {
        console.log('   ⚠️  没有有效的图片需要上传');
        return { updatedContent: mdContent, assetMap: {} };
    }

    // 使用 /api/asset/upload API 上传图片（不需要 docId）
    const formData = new FormData();
    for (const imagePath of imagePaths) {
        formData.append('file[]', fs.createReadStream(imagePath));
    }

    const url = `${config.api}/api/asset/upload`;

    // 注意：使用 FormData 时，让 form-data 自动设置 Content-Type（包含 boundary）
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Token ${config.token}`,
            ...formData.getHeaders()
        },
        body: formData
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`思源 API 上传失败：HTTP ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (result.code !== 0) {
        throw new Error(`思源 API 上传失败：${result.msg}`);
    }

    // 思源 API 返回：{ "code": 0, "data": { "errFiles": null, "succMap": { "文件名": "assets/xxx.png" } } }
    const succMap = result.data?.succMap;
    if (!succMap || typeof succMap !== 'object') {
        throw new Error(`思源 API 上传成功但未返回文件路径 (succMap)`);
    }

    console.log(`   资产映射：`, JSON.stringify(succMap, null, 2));

    // 替换 Markdown 中的图片路径
    let updatedContent = mdContent;
    const assetMap = {};

    console.log(`   开始替换图片路径，succMap 包含 ${Object.keys(succMap).length} 个文件`);

    for (const [fileName, assetPath] of Object.entries(succMap)) {
        // 查找匹配的图片（可能是 local:xxx 或 web:xxx）
        // fileName 只是文件名（如 img_001.jpg），需要查找 pathToMatch 中包含该文件名的条目
        let matchInfo = null;
        let matchedKey = null;

        for (const [key, info] of pathToMatch.entries()) {
            const keyFileName = path.basename(key.replace(/^local:/, '').replace(/^web:/, ''));
            if (keyFileName === fileName) {
                matchInfo = info;
                matchedKey = key;
                break;
            }
        }

        if (matchInfo) {
            // assetPath 格式： "assets/xxx.png"
            // 思源使用相对路径 assets/xxx.png，不是 assets:// 协议
            const assetUrl = assetPath;
            console.log(`      ✓ 已上传：${matchInfo.originalPath} → ${assetUrl}`);
            updatedContent = updatedContent.replace(matchInfo.fullMatch, `${matchInfo.altText}](${assetUrl})`);
            assetMap[matchInfo.originalPath] = assetPath;
        } else {
            console.warn(`   ⚠️  未找到匹配项：${fileName}`);
        }
    }

    console.log(`   图片替换完成，updatedContent 大小：${updatedContent.length} 字节`);

    // 清理临时文件
    for (const tempFile of tempFiles) {
        try {
            fs.unlinkSync(tempFile);
        } catch (e) {
            // 忽略清理错误
        }
    }

    return { updatedContent, assetMap };
}

/**
 * 确保思源路径存在（递归创建目录）
 * 支持模糊匹配：如果 LLM 生成的路径包含空格差异，会自动匹配现有路径
 * 改进：逐级匹配修正路径，解决子目录不存在时路径错误的问题
 * @param {string} notebook - 笔记本 ID
 * @param {string} parentPath - 父路径
 * @param {SiyuanConfig} config - 思源 API 配置
 * @returns {Promise<string>} 匹配后的实际路径
 */
async function ensurePathExists(notebook, parentPath, config) {
    // 获取笔记本的完整路径树
    const pathTree = await getNotebookPathTree(notebook, config);

    // 先尝试完整路径匹配
    const normalizedTarget = normalizePath(parentPath);
    const matchedPath = findMatchingPath(normalizedTarget, pathTree);

    if (matchedPath) {
        console.log(`   路径完整匹配： "${parentPath}" → "${matchedPath}"`);
        return matchedPath;
    }

    // 完整路径未匹配，尝试逐级匹配修正
    const correctedPath = correctPathByLevels(parentPath, pathTree);

    if (correctedPath !== parentPath) {
        console.log(`   路径逐级修正： "${parentPath}" → "${correctedPath}"`);
    } else {
        console.log(`   未匹配到现有路径，将创建新路径：${parentPath}`);
    }

    return correctedPath;
}

/**
 * 规范化路径：去除空格，统一为小写
 * @param {string} path - 原始路径
 * @returns {string} 规范化后的路径
 */
function normalizePath(p) {
    return p.replace(/\s+/g, '').toLowerCase();
}

/**
 * 在路径树中查找匹配的路径（模糊匹配，忽略空格）
 * @param {string} normalizedTarget - 规范化后的目标路径
 * @param {string[]} pathTree - 现有路径列表
 * @returns {string|null} 匹配的路径，未找到返回 null
 */
function findMatchingPath(normalizedTarget, pathTree) {
    for (const existingPath of pathTree) {
        const normalizedExisting = normalizePath(existingPath);
        if (normalizedExisting === normalizedTarget) {
            return existingPath;
        }
    }
    return null;
}

/**
 * 逐级匹配修正路径
 * 解决 LLM 返回路径包含空格差异，但目标子目录不存在的问题
 * 例如：/IT 历史&行业风向/2026 → /IT历史&行业风向/2026（修正父目录，保留子目录）
 * @param {string} targetPath - 目标路径
 * @param {string[]} pathTree - 现有路径列表
 * @returns {string} 修正后的路径
 */
function correctPathByLevels(targetPath, pathTree) {
    // 拆分路径为各级目录
    const levels = targetPath.split('/').filter(Boolean);

    if (levels.length === 0) {
        return '/';
    }

    // 构建路径树的结构化表示，便于查找
    // pathTreeNode: { '/IT历史&行业风向': { '/IT历史&行业风向/2024': {...}, ... } }
    const pathTreeNode = buildPathTreeNode(pathTree);

    // 逐级匹配修正
    let correctedPath = '';
    let currentNode = pathTreeNode;

    for (let i = 0; i < levels.length; i++) {
        const level = levels[i];
        const normalizedLevel = normalizePath(level);

        // 在当前节点的子节点中查找模糊匹配
        let matchedChild = null;
        for (const childPath of Object.keys(currentNode)) {
            const childName = childPath.split('/').filter(Boolean).pop();
            if (normalizePath(childName) === normalizedLevel) {
                matchedChild = childName;
                currentNode = currentNode[childPath];
                break;
            }
        }

        if (matchedChild) {
            // 匹配成功，使用真实名称
            correctedPath += '/' + matchedChild;
        } else {
            // 匹配失败，保留原值（可能是新目录）
            correctedPath += '/' + level;
            // 后续级别都无法匹配，直接添加
            for (let j = i + 1; j < levels.length; j++) {
                correctedPath += '/' + levels[j];
            }
            break;
        }
    }

    return correctedPath || '/';
}

/**
 * 将路径列表构建为树结构
 * @param {string[]} pathTree - 路径列表 ['/a', '/a/b', '/a/b/c']
 * @returns {Object} 树结构 { '/a': { '/a/b': { '/a/b/c': {} } } }
 */
function buildPathTreeNode(pathTree) {
    const root = {};

    // 按路径长度排序，确保父路径先处理
    const sortedPaths = [...pathTree].sort((a, b) => {
        const aLen = a.split('/').filter(Boolean).length;
        const bLen = b.split('/').filter(Boolean).length;
        return aLen - bLen;
    });

    for (const path of sortedPaths) {
        const parts = path.split('/').filter(Boolean);
        let current = root;

        // 逐级构建树
        let accumulatedPath = '';
        for (const part of parts) {
            accumulatedPath += '/' + part;
            if (!current[accumulatedPath]) {
                current[accumulatedPath] = {};
            }
            current = current[accumulatedPath];
        }
    }

    return root;
}

/**
 * 获取笔记本的完整路径树（所有文件夹路径列表）
 * 使用 SQL 查询 API 获取所有文档的层级路径 (hpath)
 * @param {string} notebookId - 笔记本 ID
 * @param {SiyuanConfig} config - 思源 API 配置
 * @returns {Promise<string[]>} 路径列表
 */
async function getNotebookPathTree(notebookId, config) {
    const fetch = await getFetch();

    // 使用 SQL 查询获取所有文档的层级路径
    // type = "d" 表示文档，hpath 是层级路径
    const sql = `SELECT hpath FROM blocks WHERE type = 'd' AND box = '${notebookId}'`;
    const url = `${config.api}/api/query/sql`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${config.token}`
        },
        body: JSON.stringify({ stmt: sql })
    });

    if (!response.ok) {
        console.warn(`   获取笔记本路径树失败：HTTP ${response.status}`);
        return [];
    }

    const result = await response.json();
    if (result.code !== 0) {
        console.warn(`   获取笔记本路径树失败：${result.msg}`);
        return [];
    }

    // 从文档路径中提取文件夹路径
    // 例如：文档路径 "/时代切片/2024/某文章" 提取文件夹 "/时代切片" 和 "/时代切片/2024"
    const allPaths = new Set();

    if (result.data && Array.isArray(result.data)) {
        for (const row of result.data) {
            const hpath = row.hpath || '';
            if (!hpath || hpath === '/') continue;

            // 提取每一级路径
            const parts = hpath.split('/').filter(Boolean);
            let currentPath = '';
            for (let i = 0; i < parts.length - 1; i++) {  // 不包含最后一个（文档标题）
                currentPath += '/' + parts[i];
                allPaths.add(currentPath);
            }
        }
    }

    return Array.from(allPaths);
}

/**
 * 调用思源 API 将文档中的网络图片转换为本地图片
 * /api/format/netImg2LocalAssets 会扫描文档中的所有外部图片链接，下载并转换为 assets:// 格式
 * @param {string} docId - 文档 ID
 * @param {string} url - 原文 URL（用于提高下载成功率）
 * @param {SiyuanConfig} config - 思源 API 配置
 * @returns {Promise<boolean>} 是否成功
 */
async function localizeNetworkImages(docId, url, config) {
    const fetch = await getFetch();
    const apiUrl = `${config.api}/api/format/netImg2LocalAssets`;

    console.log(`   🌐 正在转换网络图片为本地资产...`);

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${config.token}`
        },
        body: JSON.stringify({
            id: docId,
            url: url  // 传递原文 URL 可以提高下载成功率（Referer）
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.warn(`   ⚠️  网络图片转换失败：HTTP ${response.status} - ${errorText}`);
        return false;
    }

    const result = await response.json();

    if (result.code !== 0) {
        console.warn(`   ⚠️  网络图片转换失败：${result.msg}`);
        return false;
    }

    // result.data 包含转换的图片数量等信息
    const convertedCount = result.data?.convertedCount || result.data?.count || '未知';
    console.log(`   ✅ 网络图片转换完成，转换了 ${convertedCount} 张图片`);
    return true;
}

/**
 * 清理文件名中的非法字符
 * @param {string} name - 原始文件名
 * @returns {string} 清理后的文件名
 */
function sanitizeFileName(name) {
    // 移除 Windows 和 Linux 文件名非法字符
    return name
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 50); // 限制长度
}

/**
 * 获取思源笔记本列表
 * @param {SiyuanConfig} config - 思源 API 配置
 * @returns {Promise<Notebook[]>} 笔记本列表
 */
async function getNotebooks(config) {
    const fetch = await getFetch();
    const url = `${config.api}/api/notebook/lsNotebooks`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Token ${config.token}`
        }
    });

    const result = await response.json();
    if (result.code !== 0) {
        throw new Error(`获取笔记本列表失败：${result.msg}`);
    }

    return result.data.notebooks;
}

/**
 * 根据名称查找笔记本 ID
 * @param {string} notebookName - 笔记本名称
 * @param {Array} notebooks - 笔记本列表
 * @returns {Object|null} 找到的笔记本或 null
 */
function findNotebookById(notebookName, notebooks) {
    return notebooks.find(nb => nb.name === notebookName) || null;
}

module.exports = {
    createNote,
    buildMarkdownWithFrontmatter,
    localizeLocalImages,
    uploadImagesAndReplace,
    insertLocalAssetsToSiYuan,
    ensurePathExists,
    localizeNetworkImages,
    sanitizeFileName,
    getNotebooks,
    findNotebookById,
    normalizePath,
    getNotebookPathTree,
    findMatchingPath,
    correctPathByLevels,
    buildPathTreeNode
};
