/**
 * getNotebookPathTree 修复测试
 *
 * 测试使用 SQL 查询 API 获取路径树
 */

const assert = require('assert');
const path = require('path');

// 加载被测试模块
const saveNotePath = path.join(__dirname, '..', 'core', 'save_note.js');
const { getNotebookPathTree } = require(saveNotePath);

console.log('\n=== getNotebookPathTree SQL查询API测试 ===\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${err.message}`);
        failed++;
    }
}

// 测试配置
const config = {
    api: 'http://127.0.0.1:6806',
    token: '4sqj6ccz5fqginzd'
};

// 测试笔记本ID（阅世读己）
const notebookId = '20241011105106-ebikp0h';

// ===== 异步测试 =====

async function runAsyncTests() {
    try {
        const paths = await getNotebookPathTree(notebookId, config);

        runTest('返回路径数组不为空', () => {
            assert.ok(Array.isArray(paths), '应返回数组');
            assert.ok(paths.length > 0, '数组不应为空');
        });

        runTest('路径格式正确（以/开头）', () => {
            paths.forEach(p => {
                assert.ok(p.startsWith('/'), `路径 "${p}" 应以 / 开头`);
            });
        });

        runTest('包含预期的路径（时代切片）', () => {
            const found = paths.some(p => p.includes('时代切片'));
            assert.ok(found, '应包含时代切片路径');
        });

        runTest('包含多层嵌套路径', () => {
            const nested = paths.filter(p => p.split('/').filter(Boolean).length > 1);
            assert.ok(nested.length > 0, '应包含多层嵌套路径');
            console.log(`    多层路径数量: ${nested.length}`);
        });

        runTest('路径不重复', () => {
            const unique = new Set(paths);
            assert.strictEqual(unique.size, paths.length, '路径应不重复');
        });

        // 结果统计
        console.log('\n=== 测试结果 ===');
        console.log(`  通过: ${passed}`);
        console.log(`  失败: ${failed}`);
        console.log('');

        if (failed > 0) {
            console.log('❌ 测试失败');
            process.exit(1);
        } else {
            console.log('✅ 所有测试通过');
        }

    } catch (err) {
        console.log('\n=== 测试执行失败 ===');
        console.log('错误:', err.message);
        console.log('\n注意: 此测试需要思源笔记API正常运行');
        process.exit(1);
    }
}

runAsyncTests();