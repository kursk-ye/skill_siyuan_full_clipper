/**
 * JSON 解析修复单元测试
 *
 * 测试正确提取嵌套JSON对象，解决原有正则表达式无法匹配嵌套JSON的问题
 */

const assert = require('assert');

console.log('\n=== JSON 解析修复测试 ===\n');

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

// 模拟JSON提取函数（与llm_engine.js中的逻辑一致）
function extractJSON(response) {
    const startIndex = response.indexOf('{');
    const endIndex = response.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error('响应中未找到有效的JSON对象');
    }
    return response.substring(startIndex, endIndex + 1);
}

// ===== 原有正则表达式问题验证 =====

runTest('旧正则(/\{[^}]*\}/s)匹配简单JSON正常', () => {
    const response = '{"notebook": "test"}';
    const jsonMatch = response.match(/\{[^}]*\}/s);
    assert.ok(jsonMatch, '应能匹配简单JSON');
    assert.strictEqual(jsonMatch[0], '{"notebook": "test"}');
});

runTest('旧正则无法正确处理嵌套JSON对象', () => {
    // 真正的嵌套JSON：{"outer": {"inner": "value"}}
    const response = '{"outer": {"inner": "value"}}';
    const jsonMatch = response.match(/\{[^}]*\}/s);

    // 旧正则会匹配到第一个 } 字符（inner对象后面的那个）
    // 结果是 '{"outer": {"inner": "value"}'，缺少最后一个 }
    const expectedPartial = '{"outer": {"inner": "value"}';
    assert.strictEqual(jsonMatch[0], expectedPartial, '旧正则无法正确匹配嵌套JSON');
});

// ===== 新JSON提取方法测试 =====

runTest('新方法能正确提取完整JSON', () => {
    const response = '{"notebook": "计算机知识库", "path": "/容器&容器编排/Kubernetes", "reason": "测试"}';
    const result = extractJSON(response);

    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.notebook, '计算机知识库');
    assert.strictEqual(parsed.path, '/容器&容器编排/Kubernetes');
    assert.strictEqual(parsed.reason, '测试');
});

runTest('新方法能处理包含额外文本的响应', () => {
    const response = '这是一些额外文本\n{"notebook": "阅世读己", "path": "/时代切片/2024"}\n更多文本';
    const result = extractJSON(response);

    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.notebook, '阅世读己');
    assert.strictEqual(parsed.path, '/时代切片/2024');
});

runTest('新方法能处理多层嵌套JSON', () => {
    const response = '{"outer": {"inner": {"deep": "value"}}}';
    const result = extractJSON(response);

    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.outer.inner.deep, 'value');
});

runTest('新方法能处理包含引号的JSON内容', () => {
    // JSON中引号需要用 \" 转义
    const response = '{"reason": "这是\\"重要\\"内容"}';
    const result = extractJSON(response);

    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.reason, '这是"重要"内容');
});

runTest('新方法对无JSON响应应抛出错误', () => {
    const response = '这段文本没有任何JSON';

    try {
        extractJSON(response);
        throw new Error('应该抛出错误但没有');
    } catch (err) {
        assert.strictEqual(err.message, '响应中未找到有效的JSON对象');
    }
});

runTest('新方法对不完整的JSON应抛出错误', () => {
    const response = '{"notebook": "测试"';  // 缺少闭合 }

    try {
        extractJSON(response);
        throw new Error('应该抛出错误但没有');
    } catch (err) {
        assert.strictEqual(err.message, '响应中未找到有效的JSON对象');
    }
});

runTest('新方法能处理LLM实际响应格式', () => {
    // 模拟真实的LLM响应
    const response = `
根据文章内容，最合适的分类如下：

{
  "notebook": "计算机知识库",
  "path": "/容器&容器编排/Kubernetes",
  "reason": "文章是关于KubeCon和Kubernetes技术的回顾"
}

以上是分类建议。
`;
    const result = extractJSON(response);

    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.notebook, '计算机知识库');
    assert.strictEqual(parsed.path, '/容器&容器编排/Kubernetes');
});

runTest('对比新旧方法处理路径中的斜杠', () => {
    const response = '{"path": "/一级/二级/三级"}';

    // 旧方法
    const oldResult = response.match(/\{[^}]*\}/s)[0];
    // 新方法
    const newResult = extractJSON(response);

    // 旧方法获取 '{"path": "/一级/二级/三级"' (缺少最后一个 })
    // 新方法获取完整JSON

    try {
        JSON.parse(oldResult);
        console.log('    旧方法意外成功了');
    } catch (e) {
        console.log('    旧方法解析失败（预期行为）');
    }

    const parsedNew = JSON.parse(newResult);
    assert.strictEqual(parsedNew.path, '/一级/二级/三级');
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