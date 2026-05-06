/**
 * siyuan_web.js
 *
 * 使用思源扩展方式下载网页内容
 * 基于 skill_siyuan_collection/scripts/fetch_web.js 实现
 *
 * 接口与 opencli-runner.js 的 download 函数保持一致
 */

/** @import { DownloadResult, SourceType } from '../types.js' */

const { chromium } = require('playwright-core');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const fs = require('fs');
const path = require('path');

/**
 * 获取 Chromium 浏览器路径
 * @returns {string}
 */
function getChromiumPath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
        return process.env.CHROMIUM_PATH;
    }
    const paths = [
        // Linux / ARM
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        // Windows
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error('Chromium/Chrome not found. Please set PUPPETEER_EXECUTABLE_PATH or install chromium globally.');
}

/**
 * 获取思源配置
 * @param {Object} config - 配置对象（可选）
 * @returns {{api: string, token: string}}
 */
function getSiyuanConfig(config) {
    const api = config?.siyuan?.api || process.env.SIYUAN_API || 'http://127.0.0.1:6806';
    const token = config?.siyuan?.token || process.env.SIYUAN_TOKEN || '';
    return { api, token };
}

/**
 * 从 Markdown 内容提取标题
 * @param {string} content
 * @returns {string}
 */
function extractTitle(content) {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : 'Untitled';
}

/**
 * 从 Markdown frontmatter 提取原始 URL
 * @param {string} content
 * @returns {string}
 */
function extractOriginalUrl(content, fallbackUrl) {
    const patterns = [
        /^original_url:\s*(.+)$/m,
        /^source:\s*(.+)$/m,
        /^url:\s*(.+)$/m
    ];
    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) return match[1].trim();
    }
    return fallbackUrl;
}

/**
 * 从 Markdown frontmatter 提取发布日期
 * @param {string} content
 * @returns {string | null}
 */
function extractPublishDate(content) {
    const patterns = [
        /^date:\s*(.+)$/m,
        /^publish_date:\s*(.+)$/m,
        /^published:\s*(.+)$/m,
        /^time:\s*(.+)$/m
    ];
    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
            const dateStr = match[1].trim();
            // 尝试解析为 YYYY-MM-DD 格式
            const dateMatch = dateStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
            if (dateMatch) {
                return `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
            }
        }
    }
    return null;
}

/**
 * 使用思源扩展方式下载网页
 * @param {SourceType} sourceType - 固定为 'web'
 * @param {string} url - 网页 URL
 * @param {string} outputDir - 输出目录
 * @param {Object} [config] - 可选配置（包含思源 API 和 Token）
 * @returns {Promise<DownloadResult>}
 */
async function download(sourceType, url, outputDir, config) {
    console.log(`\n📥 [siyuan_web] 开始下载: ${url}`);

    const siyuanConfig = getSiyuanConfig(config);

    if (!siyuanConfig.token) {
        throw new Error('思源 Token 未配置，请设置 SIYUAN_TOKEN 环境变量或在 config.json 中配置');
    }

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // 浏览器持久化数据目录（放在 /tmp 以避免 VMWare 共享文件夹的文件锁问题）
    const userDataDir = path.join('/tmp', 'siyuan_web_browser_profile');
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    try {
        // 启动持久化浏览器上下文
        const context = await chromium.launchPersistentContext(userDataDir, {
            executablePath: getChromiumPath(),
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ],
            viewport: { width: 1280, height: 800 }
        });

        // 抹除 webdriver 标记
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 获取页面
        const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

        // 加载网页
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await Promise.race([
                page.waitForLoadState('networkidle', { timeout: 30000 }),
                page.waitForTimeout(8000)
            ]);
            // 等待正文容器出现
            await page.waitForSelector('.Post-RichTextContainer, .RichText-content, article, main, .article-content, #content', {
                state: 'attached',
                timeout: 15000
            }).catch(() => console.warn('Specific article container not found, proceeding anyway.'));
        } catch (gotoErr) {
            console.warn('Page load interrupted:', gotoErr.message);
        }

        // 获取 HTML
        let html = '';
        try {
            html = await page.evaluate(() => document.documentElement.outerHTML);
        } catch (domErr) {
            html = await page.content().catch(() => '');
        }

        // 检测反爬拦截
        if (html.includes('"code":40362') || html.includes('signin?next=')) {
            throw new Error('检测到反爬拦截 (40362)，请先运行 login_browser.js 解决验证码');
        }

        // 注入 DOM 预处理脚本
        const utilsPath = path.join(__dirname, 'siyuan-dom-utils.js');
        if (fs.existsSync(utilsPath)) {
            try {
                const utilsContent = fs.readFileSync(utilsPath, 'utf8');
                await page.evaluate(`
                    try {
                        ${utilsContent}
                        if (window.runSiyuanPreprocess) {
                            window.runSiyuanPreprocess({ expBold: true, expItalic: true, expUnderline: true, expRemoveImgLink: true, expSpan: true, expSvgToImg: true });
                        }
                    } catch(e) { console.warn("SiyuanPreprocess failed:", e); }
                `);
            } catch (err) {
                console.warn('DOM preprocess failed:', err.message);
            }
        }

        // 再次获取处理后的 HTML
        try {
            html = await page.evaluate(() => document.documentElement.outerHTML);
        } catch (domErr) {
            html = await page.content().catch(() => '');
        }

        await context.close();

        // Readability 解析
        const doc = new JSDOM(html, { url }).window.document;
        const reader = new Readability(doc);
        const article = reader.parse();

        if (!article) {
            throw new Error('Readability 无法解析文章内容');
        }

        console.log(`📄 文章标题: ${article.title}`);

        // 调用思源 API 转换 HTML → Markdown
        const formData = new FormData();
        formData.append('dom', article.content);
        formData.append('notebook', 'temp');
        formData.append('parentHPath', '/');
        formData.append('href', url);
        formData.append('clipType', 'article');

        const mdRes = await fetch(`${siyuanConfig.api}/api/extension/copy`, {
            method: 'POST',
            headers: { 'Authorization': `Token ${siyuanConfig.token}` },
            body: formData
        });

        const mdData = await mdRes.json();
        if (mdData.code !== 0) {
            throw new Error(`思源 API 转换失败: ${mdData.msg}`);
        }

        const markdownContent = mdData.data.md;

        // 保存 Markdown 文件
        const mdFileName = `${Date.now()}.md`;
        const mdPath = path.join(outputDir, mdFileName);

        // 添加 frontmatter
        const frontmatter = `---
title: ${article.title}
original_url: ${url}
source: web
excerpt: ${article.excerpt || ''}
---

`;
        const fullMarkdown = frontmatter + markdownContent;
        fs.writeFileSync(mdPath, fullMarkdown, 'utf8');

        console.log(`✅ Markdown 已保存: ${mdPath}`);

        // 提取元数据
        const title = article.title || extractTitle(markdownContent);
        const originalUrl = url;
        const publishDate = extractPublishDate(markdownContent);

        return {
            mdPath,
            title,
            originalUrl,
            publishDate,
            source: 'web'
        };

    } catch (err) {
        console.error(`❌ [siyuan_web] 下载失败: ${err.message}`);
        throw err;
    }
}

module.exports = {
    download
};