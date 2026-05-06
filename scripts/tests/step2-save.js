#!/usr/bin/env node

/**
 * 步骤2测试：将Markdown文件保存到思源笔记
 *
 * 用法：node scripts/tests/step2-save.js <mdPath> [notebook] [path]
 *
 * 参数：
 *   mdPath    - Markdown文件路径（步骤1生成的）
 *   notebook  - 笔记本名称（可选，默认"阅世读己"）
 *   path      - 分类路径（可选，默认"/时代切片/2026"）
 */

const path = require('path');
const fs = require('fs');
const { createNote, sanitizeFileName } = require('../core/save_note.js');
const { generateSummary } = require('../core/llm_engine.js');

// 加载配置
const configPath = path.join(__dirname, '..', '..', 'config.json');
let config = {};
if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

async function main() {
    const mdPath = process.argv[2];
    const notebook = process.argv[3] || '阅世读己';
    const targetPath = process.argv[4] || '/时代切片/2026';

    if (!mdPath) {
        console.log('用法：node scripts/tests/step2-save.js <mdPath> [notebook] [path]');
        console.log('示例：node scripts/tests/step2-save.js output/step1_test/xxx/xxx.md');
        process.exit(1);
    }

    // 检查文件是否存在
    if (!fs.existsSync(mdPath)) {
        console.error('❌ 文件不存在:', mdPath);
        process.exit(1);
    }

    console.log('\n=== 步骤2：保存Markdown到思源笔记 ===\n');
    console.log('Markdown路径:', mdPath);
    console.log('笔记本:', notebook);
    console.log('目标路径:', targetPath);

    // 检查配置
    if (!config.siyuan?.api || !config.siyuan?.token) {
        console.error('❌ 思源配置缺失，请检查config.json');
        process.exit(1);
    }

    try {
        // 读取Markdown文件
        const content = fs.readFileSync(mdPath, 'utf8');

        // 提取标题（第一个#开头的行）
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : path.basename(mdPath, '.md');

        console.log('标题:', title);

        // 生成摘要（可选）
        console.log('\n生成摘要...');
        let summary = null;
        try {
            summary = await generateSummary(mdPath);
            console.log('摘要:', summary.substring(0, 100), '...');
        } catch (err) {
            console.log('摘要生成失败，跳过:', err.message);
        }

        // 提取原文链接（从frontmatter或内容中）
        const urlMatch = content.match(/(?:source|url|original_url):\s*(.+)$/m) ||
                        content.match(/<!--\s*source:\s*(.+?)\s*-->/);
        const originalUrl = urlMatch ? urlMatch[1].trim() : null;

        console.log('原文链接:', originalUrl || '未找到');

        // 执行保存
        console.log('\n正在保存到思源笔记...');
        const result = await createNote(
            notebook,
            targetPath,
            mdPath,
            title,
            originalUrl,
            summary,
            config.siyuan
        );

        console.log('\n=== 保存结果 ===');
        console.log('文档ID:', result.docId);
        console.log('笔记本:', result.notebook);
        console.log('路径:', result.path);
        console.log('\n✅ 步骤2测试完成');

    } catch (err) {
        console.error('\n❌ 保存失败:', err.message);
        console.error('堆栈:', err.stack);
        process.exit(1);
    }
}

main();