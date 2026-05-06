#!/usr/bin/env node

/**
 * 步骤1测试：下载网页为Markdown文件
 *
 * 用法：node scripts/tests/step1-download.js <URL>
 */

const path = require('path');
const fs = require('fs');
const { download, extractMetadata } = require('../core/opencli-runner.js');

async function main() {
    const url = process.argv[2];

    if (!url) {
        console.log('用法：node scripts/tests/step1-download.js <URL>');
        console.log('示例：node scripts/tests/step1-download.js https://www.guancha.cn/...');
        process.exit(1);
    }

    // 创建输出目录
    const outputDir = path.join(process.cwd(), 'output', 'step1_test');
    fs.mkdirSync(outputDir, { recursive: true });

    console.log('\n=== 步骤1：下载网页为Markdown ===\n');
    console.log('URL:', url);
    console.log('输出目录:', outputDir);

    try {
        // 执行下载
        const result = await download('web', url, outputDir);

        console.log('\n=== 下载结果 ===');
        console.log('Markdown路径:', result.mdPath);
        console.log('标题:', result.title);
        console.log('原文链接:', result.originalUrl);
        console.log('发布时间:', result.publishDate);

        // 显示Markdown文件内容（前500字符）
        const content = fs.readFileSync(result.mdPath, 'utf8');
        console.log('\n=== Markdown内容预览 ===');
        console.log(content.substring(0, 500));
        console.log('\n... (共', content.length, '字符)');

        console.log('\n✅ 步骤1测试完成');
        console.log('\n提示：Markdown文件保存在:', result.mdPath);
        console.log('可用于步骤2测试：node scripts/tests/step2-save.js <mdPath>');

    } catch (err) {
        console.error('\n❌ 下载失败:', err.message);
        process.exit(1);
    }
}

main();