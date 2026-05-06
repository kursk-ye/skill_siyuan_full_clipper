/**
 * correctPathByLevels 单元测试
 *
 * 测试路径模糊匹配修复：逐级匹配修正路径，解决LLM返回路径包含空格差异的问题
 */

const assert = require('assert');
const path = require('path');

// 加载被测试模块
const saveNotePath = path.join(__dirname, '..', 'core', 'save_note.js');
const { correctPathByLevels, normalizePath, buildPathTreeNode } = require(saveNotePath);

// 模拟思源 API 返回的路径树
const mockPathTree = [
    '/IT历史&行业风向',
    '/IT历史&行业风向/2024',
    '/IT历史&行业风向/2025',
    '/IT历史&行业风向/2024之前',
    '/容器&容器编排',
    '/容器&容器编排/Kubernetes',
    '/容器&容器编排/Docker',
    '/时代切片',
    '/时代切片/2024',
    '/时代切片/2025',
    '/时代切片/2026',
    '/AI',
    '/AI/Agent&MCP&Skill'
];

console.log('\n=== correctPathByLevels 单元测试 ===\n');

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

// ===== Bug场景测试 =====

runTest('Bug场景：父目录带空格，子目录不存在 → 应修正父目录，保留新子目录', () => {
    const input = '/IT 历史&行业风向/2026';
    const output = correctPathByLevels(input, mockPathTree);

    // 父目录应被修正
    const parts = output.split('/').filter(Boolean);
    assert.strictEqual(parts[0], 'IT历史&行业风向', '父目录空格应被修正');
    assert.strictEqual(parts[1], '2026', '新子目录应保留');
    assert.strictEqual(output, '/IT历史&行业风向/2026');
});

runTest('父目录正确，子目录不存在 → 应保持不变', () => {
    const input = '/IT历史&行业风向/2030';
    const output = correctPathByLevels(input, mockPathTree);
    assert.strictEqual(output, '/IT历史&行业风向/2030');
});

runTest('父目录带空格，子目录存在 → 应全部修正', () => {
    const input = '/IT 历史&行业风向/2025';
    const output = correctPathByLevels(input, mockPathTree);
    assert.strictEqual(output, '/IT历史&行业风向/2025');
});

runTest('多个空格 → 应去除所有空格', () => {
    const input = '/IT 历 史&行业风向/2024';
    const output = correctPathByLevels(input, mockPathTree);
    assert.strictEqual(output, '/IT历史&行业风向/2024');
});

runTest('完全不存在的路径 → 应保留原值', () => {
    const input = '/全新分类/新子分类';
    const output = correctPathByLevels(input, mockPathTree);
    assert.strictEqual(output, '/全新分类/新子分类');
});

runTest('空路径 → 应返回根路径', () => {
    assert.strictEqual(correctPathByLevels('', mockPathTree), '/');
    assert.strictEqual(correctPathByLevels('/', mockPathTree), '/');
});

runTest('多层嵌套路径 → 应逐级匹配', () => {
    const input = '/容器 &容器编排/Kuber netes';
    const output = correctPathByLevels(input, mockPathTree);
    assert.strictEqual(output, '/容器&容器编排/Kubernetes');
});

runTest('大小写差异 → normalizePath应忽略大小写', () => {
    const normalized = normalizePath('/ITHistory/2024');
    assert.strictEqual(normalized, '/ithistory/2024');
});

// ===== buildPathTreeNode 测试 =====

console.log('\n=== buildPathTreeNode 单元测试 ===\n');

runTest('应将路径列表构建为树结构', () => {
    const paths = ['/a', '/a/b', '/a/b/c'];
    const tree = buildPathTreeNode(paths);

    assert.ok(tree['/a'], '根节点存在');
    assert.ok(tree['/a']['/a/b'], '子节点存在');
    assert.ok(tree['/a']['/a/b']['/a/b/c'], '叶子节点存在');
});

runTest('应处理乱序路径列表', () => {
    const paths = ['/a/b/c', '/a', '/a/b'];  // 乱序
    const tree = buildPathTreeNode(paths);

    assert.ok(tree['/a'], '仍能正确构建树');
    assert.ok(tree['/a']['/a/b']);
    assert.ok(tree['/a']['/a/b']['/a/b/c']);
});

// ===== 结果统计 =====

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