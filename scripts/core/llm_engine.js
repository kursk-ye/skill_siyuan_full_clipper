/**
 * llm_engine.js
 *
 * 调用 LLM 生成摘要 + 智能分类
 */

/** @import { CategoryResult } from '../types.js' */

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
 * 加载 LLM 配置
 * @returns {Object} LLM 配置对象
 */
function loadLLMConfig() {
    const configPath = path.join(__dirname, '..', '..', 'config.json');
    let config = {};

    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    // 环境变量优先
    const baseUrl = process.env.LLM_BASE_URL || config?.llm?.baseUrl;
    const apiKey = process.env.LLM_API_KEY || config?.llm?.apiKey;
    const model = process.env.LLM_MODEL || config?.llm?.model || 'qwen3.5-plus';

    return { baseUrl, apiKey, model };
}

/**
 * 生成文章摘要
 * @param {string} mdPath - Markdown 文件路径
 * @param {Object} options - 配置选项
 * @param {boolean} options.detailed - 是否生成详细总结（含要点提炼）
 * @returns {Promise<string>} 生成的摘要
 */
async function generateSummary(mdPath, options = {}) {
    const { detailed = false } = options;

    // 1. 读取 Markdown 文件内容（只读正文，跳过 frontmatter）
    const content = fs.readFileSync(mdPath, 'utf8');
    const lines = content.split('\n');

    // 跳过 frontmatter（如果有）
    let bodyStart = 0;
    if (lines[0] === '---') {
        for (let i = 1; i < lines.length; i++) {
            if (lines[i] === '---') {
                bodyStart = i + 1;
                break;
            }
        }
    }

    // 提取标题和正文
    let title = '';
    let bodyLines = [];
    let charCount = 0;
    // 详细总结需要更多内容
    const MAX_CHARS = detailed ? 5000 : 2000;

    for (let i = bodyStart; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('# ') && !title) {
            title = line.replace('# ', '').trim();
        } else if (charCount < MAX_CHARS && line.trim()) {
            bodyLines.push(line);
            charCount += line.length;
        }
    }

    const bodyText = bodyLines.join('\n');

    // 2. 构建摘要 Prompt（根据模式选择不同模板）
    const prompt = detailed
        ? buildDetailedSummaryPrompt(title, bodyText)
        : buildSummaryPrompt(title, bodyText);

    // 3. 调用 LLM 生成摘要
    console.log('🧠 正在生成摘要...');
    const summary = await callLLMAPI(prompt);
    console.log(`✅ 摘要完成：${summary.length} 字`);

    return summary;
}

/**
 * 智能选择分类路径
 * @param {string} title - 文章标题
 * @param {string} summary - 文章摘要
 * @param {object} categoriesTree - categories.json 解析后的对象
 * @param {string|null} publishDate - 文章发布时间（YYYY-MM-DD 格式）
 * @returns {Promise<CategoryResult>} 分类结果
 */
async function selectCategory(title, summary, categoriesTree, publishDate) {
    // 1. 将分类树转换为 LLM 可读的文本格式
    const categoriesText = formatCategoriesForLLM(categoriesTree, 5);

    // 2. 构建分类 Prompt（传入发布时间）
    const prompt = buildCategoryPrompt(title, summary, categoriesText, publishDate);

    // 调试：打印完整 prompt
    console.log('📋 分类 Prompt:', prompt);

    // 3. 调用 LLM 选择分类
    console.log('🎯 正在智能分类...');
    const response = await callLLMAPI(prompt);

    // 调试：打印LLM原始响应
    console.log('📤 LLM 原始响应:', response.substring(0, 500));

    // 4. 解析 LLM 响应（期望返回 JSON: { notebook, path, reason }）
    try {
        // 尝试从响应中提取完整的JSON对象
        // 匹配从第一个 { 到最后一个 } 的内容
        const startIndex = response.indexOf('{');
        const endIndex = response.lastIndexOf('}');
        if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
            throw new Error('响应中未找到有效的JSON对象');
        }
        const jsonStr = response.substring(startIndex, endIndex + 1);
        console.log('   解析JSON:', jsonStr);
        const result = JSON.parse(jsonStr);
        console.log(`✅ 分类完成：${result.notebook}${result.path}`);
        if (result.reason) {
            console.log(`   原因：${result.reason}`);
        }
        return result;
    } catch (err) {
        console.warn('⚠️ LLM 返回格式解析失败，使用默认分类');
        console.warn('   解析错误:', err.message);
        return {
            notebook: 'Default',
            path: '/未分类',
            reason: 'LLM 响应解析失败，使用默认分类'
        };
    }
}

/**
 * 将 categories.json 树转换为 LLM 可读的文本格式
 * @param {object} tree - categories.json 解析后的对象
 * @param {number} maxDepth - 最大递归深度（默认 5）
 * @returns {string} 格式化的目录树文本
 */
function formatCategoriesForLLM(tree, maxDepth = 5) {
    function formatNode(node, prefix, depth) {
        if (depth > maxDepth) return '';

        let result = '';

        if (Array.isArray(node)) {
            // 叶子节点数组
            node.forEach(item => {
                if (typeof item === 'string') {
                    result += `${prefix}  - ${item}\n`;
                } else if (typeof item === 'object') {
                    // 有子节点的分支
                    Object.keys(item).forEach(key => {
                        result += `${prefix}  + ${key}\n`;
                        result += formatNode(item[key], prefix + '    ', depth + 1);
                    });
                }
            });
        } else if (typeof node === 'object' && node !== null) {
            // 对象节点
            Object.keys(node).forEach(key => {
                result += `${prefix}+ ${key}\n`;
                result += formatNode(node[key], prefix + '    ', depth + 1);
            });
        }

        return result;
    }

    return formatNode(tree, '', 0);
}

/**
 * 调用 LLM API 生成响应
 * 从 config.json 读取配置
 * 支持多种API格式：OpenAI兼容（OpenRouter/DeepSeek/阿里云）和Anthropic
 * @param {string} prompt - 提示词
 * @returns {Promise<string>} LLM 响应文本
 */
async function callLLMAPI(prompt) {
    const { baseUrl, apiKey, model } = loadLLMConfig();

    if (!apiKey) {
        throw new Error('callLLMAPI: 缺少 API Key，请在 config.json 中配置 llm.apiKey 或设置 LLM_API_KEY 环境变量');
    }

    if (!baseUrl) {
        throw new Error('callLLMAPI: 缺少 Base URL，请在 config.json 中配置 llm.baseUrl 或设置 LLM_BASE_URL 环境变量');
    }

    const fetch = await getFetch();

    // 判断API类型：OpenAI兼容格式 vs Anthropic格式
    // OpenAI兼容格式的baseUrl通常包含 /v1/chat/completions 或以 /v1 结尾
    const isOpenAICompatible = baseUrl.includes('/chat/completions') ||
                                baseUrl.includes('/compatible-mode') ||
                                baseUrl.includes('openrouter');

    let url, headers, requestBody;

    if (isOpenAICompatible) {
        // OpenAI兼容格式（OpenRouter、DeepSeek、阿里云DashScope）
        url = baseUrl.replace(/\/$/, '');
        headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };
        requestBody = {
            model: model,
            max_tokens: 2048,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        };
    } else {
        // Anthropic格式
        url = baseUrl.replace(/\/$/, '') + '/v1/messages';
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        };
        requestBody = {
            model: model,
            max_tokens: 2048,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        };
    }

    console.log(`   🔗 API URL: ${url}`);
    console.log(`   📦 Model: ${model}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`callLLMAPI: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // 适配多种响应格式
    let text = '';
    if (data.output?.text) {
        text = data.output.text; // 阿里云百炼格式
    } else if (data.choices?.[0]?.message?.content) {
        text = data.choices[0].message.content; // OpenAI 兼容格式（OpenRouter、DeepSeek等）
    } else if (Array.isArray(data.content)) {
        // Anthropic 格式，content数组中包含thinking和text元素
        const textElement = data.content.find(c => c.type === 'text' || c.text);
        text = textElement?.text || '';
    } else if (data.content?.[0]?.text) {
        text = data.content[0].text; // Anthropic 原生格式
    }

    return text || '';
}

/**
 * 构建摘要 Prompt
 * @param {string} title - 文章标题
 * @param {string} content - 文章内容
 * @returns {string} 完整的 Prompt
 */
function buildSummaryPrompt(title, content) {
    return `请为以下文章生成一个简洁的摘要（200-300 字），概括核心内容：

文章标题：${title}

文章内容：
${content.substring(0, 3000)}

请用中文回复，只输出摘要内容，不要有其他说明。`;
}

/**
 * 构建详细总结 Prompt（含要点提炼）
 * @param {string} title - 标题
 * @param {string} content - 内容
 * @returns {string} 完整的 Prompt
 */
function buildDetailedSummaryPrompt(title, content) {
    return `请为以下内容生成一个详细总结，包含内容概述、关键要点和结论。

标题：${title}

内容：
${content.substring(0, 6000)}

请用中文回复，按以下格式输出：

## 内容概述
（200字概述）

## 关键要点
1. xxx
2. xxx
3. xxx

## 结论
（100字结论）

只输出上述格式内容，不要有其他说明。`;
}

/**
 * 构建分类 Prompt
 * @param {string} title - 文章标题
 * @param {string} summary - 文章摘要
 * @param {string} categoriesText - 格式化后的分类树文本
 * @param {string|null} publishDate - 文章发布时间（YYYY-MM-DD 格式）
 * @returns {string} 完整的 Prompt
 */
function buildCategoryPrompt(title, summary, categoriesText, publishDate) {
    const publishDateInfo = publishDate ? `\n文章发布时间：${publishDate}` : '';

    return `请根据以下文章信息，从给定的分类体系中选择最合适的保存路径。

文章标题：${title}
文章摘要：${summary}${publishDateInfo}

可用的分类体系（思源笔记现有目录结构）：
${categoriesText}

注意：
1. notebook 字段返回笔记本名称（如"阅世读己"、"电力知识库"）
2. path 字段返回**相对于笔记本的路径**，不要包含笔记本名称本身
   - 正确示例：/时代切片/2026
   - 错误示例：/阅世读己/时代切片/2026（× 不要重复笔记本名称）
3. 如果分类路径中包含年份（如 /时代切片/2025、/媒体风向&行业事件/2026），请根据文章发布时间选择对应的年份分支。不要随意选择年份，要确保与文章实际发布时间一致。

请以 JSON 格式返回最佳分类，格式如下：
{
  "notebook": "笔记本名称",
  "path": "/一级分类/二级分类/...",
  "reason": "简要说明选择该分类的原因（50 字以内）"
}

只返回 JSON 对象，不要有其他说明。`;
}

/**
 * 获取图片 MIME 类型
 * @param {string} imagePath - 图片路径
 * @returns {string} MIME 类型
 */
function getMimeType(imagePath) {
    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp'
    };
    return mimeTypes[ext] || 'image/jpeg';
}

/**
 * 压缩图片（如果超过大小限制）
 * @param {string} imagePath - 图片路径
 * @param {number} maxSizeMB - 最大允许大小（MB），默认 4MB
 * @returns {Promise<{path: string, compressed: boolean}>} 处理后的图片路径和是否被压缩
 */
async function compressImageIfNeeded(imagePath, maxSizeMB = 4) {
    const stats = fs.statSync(imagePath);
    const sizeMB = stats.size / (1024 * 1024);

    if (sizeMB <= maxSizeMB) {
        return { path: imagePath, compressed: false };
    }

    console.log(`   📦 图片大小 ${sizeMB.toFixed(1)}MB，超过限制 ${maxSizeMB}MB，正在压缩...`);

    const sharp = require('sharp');
    const tempDir = path.join('/tmp', 'siyuan_clipper_temp', 'compressed');
    fs.mkdirSync(tempDir, { recursive: true });

    const compressedPath = path.join(tempDir, `compressed_${Date.now()}.jpg`);

    try {
        await sharp(imagePath)
            .resize(1920, null, {
                withoutEnlargement: true,
                fit: 'inside'
            })
            .jpeg({ quality: 70 })
            .toFile(compressedPath);

        const newSizeMB = fs.statSync(compressedPath).size / (1024 * 1024);
        console.log(`   ✅ 压缩完成，新大小 ${newSizeMB.toFixed(1)}MB`);

        return { path: compressedPath, compressed: true };
    } catch (err) {
        console.error(`   ❌ 压缩失败：${err.message}`);
        // 压缩失败时返回原图
        return { path: imagePath, compressed: false };
    }
}

/**
 * 构建图片分析 Prompt
 * @returns {string} Prompt 文本
 */
function buildImageDescriptionPrompt() {
    return `请分析这张图片，生成：
1. 一个简洁的标题（10-20字，概括图片主题）
2. 一个描述（200-300字，详细说明图片内容）

返回 JSON 格式：
{
  "title": "图片标题",
  "description": "图片描述"
}

只返回 JSON，不要有其他说明。`;
}

/**
 * 生成图片描述（多模态）
 * @param {string} imagePath - 图片文件路径
 * @returns {Promise<{title: string, description: string}>} 图片标题和描述
 */
async function generateImageDescription(imagePath) {
    const { baseUrl, apiKey, model } = loadLLMConfig();

    if (!apiKey) {
        throw new Error('generateImageDescription: 缺少 API Key');
    }
    if (!baseUrl) {
        throw new Error('generateImageDescription: 缺少 Base URL');
    }

    // 压缩图片（如果超过 4MB）
    const { path: processedPath, compressed } = await compressImageIfNeeded(imagePath, 4);

    // 读取图片转为 base64
    const imageBase64 = fs.readFileSync(processedPath, 'base64');
    const mimeType = compressed ? 'image/jpeg' : getMimeType(imagePath);

    const fetch = await getFetch();

    // 判断 API 类型
    const isOpenAICompatible = baseUrl.includes('/chat/completions') ||
                                baseUrl.includes('/compatible-mode') ||
                                baseUrl.includes('openrouter');

    let url, headers, requestBody;

    const imageDescriptionPrompt = buildImageDescriptionPrompt();

    if (isOpenAICompatible) {
        // OpenAI 兼容格式
        url = baseUrl.replace(/\/$/, '');
        headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };
        requestBody = {
            model: model,
            max_tokens: 1024,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${imageBase64}`
                            }
                        },
                        {
                            type: 'text',
                            text: imageDescriptionPrompt
                        }
                    ]
                }
            ]
        };
    } else if (baseUrl.includes('/apps/anthropic')) {
        // 阿里云 DashScope Anthropic 格式 - 多模态需要使用 /v1/messages 端点
        url = baseUrl.replace(/\/$/, '') + '/v1/messages';
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        };
        requestBody = {
            model: model,
            max_tokens: 1024,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mimeType,
                                data: imageBase64
                            }
                        },
                        {
                            type: 'text',
                            text: imageDescriptionPrompt
                        }
                    ]
                }
            ]
        };
    } else {
        // 标准 Anthropic 格式
        url = baseUrl.replace(/\/$/, '') + '/v1/messages';
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        };
        requestBody = {
            model: model,
            max_tokens: 1024,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mimeType,
                                data: imageBase64
                            }
                        },
                        {
                            type: 'text',
                            text: imageDescriptionPrompt
                        }
                    ]
                }
            ]
        };
    }

    console.log('🧠 正在生成图片描述...');
    console.log(`   🔗 API URL: ${url}`);
    console.log(`   📦 Model: ${model}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`generateImageDescription: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // 提取响应文本
    let responseText = '';
    if (data.output?.text) {
        responseText = data.output.text;
    } else if (data.choices?.[0]?.message?.content) {
        responseText = data.choices[0].message.content;
    } else if (Array.isArray(data.content)) {
        const textElement = data.content.find(c => c.type === 'text' || c.text);
        responseText = textElement?.text || '';
    } else if (data.content?.[0]?.text) {
        responseText = data.content[0].text;
    }

    // 解析 JSON 响应
    let title, description;
    try {
        // 提取 JSON 对象
        const startIndex = responseText.indexOf('{');
        const endIndex = responseText.lastIndexOf('}');
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            const jsonStr = responseText.substring(startIndex, endIndex + 1);
            const result = JSON.parse(jsonStr);
            title = result.title;
            description = result.description;
        } else {
            throw new Error('响应中未找到 JSON 对象');
        }
    } catch (err) {
        console.warn('⚠️ LLM 返回格式解析失败，使用默认标题');
        console.warn('   解析错误:', err.message);
        // fallback：从图片路径提取标题，使用原始响应作为描述
        title = path.basename(imagePath, path.extname(imagePath));
        description = responseText || '无法生成图片描述';
    }

    console.log(`✅ 图片分析完成：标题 "${title}"，描述 ${description.length} 字`);

    // 清理压缩临时文件
    if (compressed && processedPath !== imagePath) {
        try {
            fs.unlinkSync(processedPath);
        } catch (e) {
            // 忽略清理失败
        }
    }

    return { title, description };
}

module.exports = {
    generateSummary,
    selectCategory,
    formatCategoriesForLLM,
    callLLMAPI,
    buildSummaryPrompt,
    buildDetailedSummaryPrompt,
    buildCategoryPrompt,
    generateImageDescription,
    getMimeType,
    compressImageIfNeeded
};
