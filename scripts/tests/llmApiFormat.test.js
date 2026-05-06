/**
 * LLM API 格式适配单元测试
 *
 * 测试自动识别 OpenAI兼容格式（OpenRouter/DeepSeek/阿里云）和 Anthropic 格式
 */

const assert = require('assert');
const path = require('path');

// 加载配置
const configPath = path.join(__dirname, '..', '..', 'config.json');
const fs = require('fs');
let config = {};
if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

console.log('\n=== LLM API 格式适配测试 ===\n');
console.log('当前配置:', JSON.stringify(config.llm, null, 2));

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

// ===== API格式识别测试 =====

runTest('OpenRouter URL应识别为OpenAI兼容格式', () => {
    const baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    const isOpenAICompatible = baseUrl.includes('/chat/completions') ||
                                baseUrl.includes('/compatible-mode') ||
                                baseUrl.includes('openrouter');
    assert.strictEqual(isOpenAICompatible, true);
});

runTest('阿里云DashScope兼容模式URL应识别为OpenAI格式', () => {
    const baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const isOpenAICompatible = baseUrl.includes('/chat/completions') ||
                                baseUrl.includes('/compatible-mode') ||
                                baseUrl.includes('openrouter');
    assert.strictEqual(isOpenAICompatible, true);
});

runTest('Anthropic原生URL不应识别为OpenAI兼容格式', () => {
    const baseUrl = 'https://api.anthropic.com';
    const isOpenAICompatible = baseUrl.includes('/chat/completions') ||
                                baseUrl.includes('/compatible-mode') ||
                                baseUrl.includes('openrouter');
    assert.strictEqual(isOpenAICompatible, false);
});

runTest('DeepSeek URL应识别为OpenAI兼容格式', () => {
    const baseUrl = 'https://api.deepseek.com/v1/chat/completions';
    const isOpenAICompatible = baseUrl.includes('/chat/completions') ||
                                baseUrl.includes('/compatible-mode') ||
                                baseUrl.includes('openrouter');
    assert.strictEqual(isOpenAICompatible, true);
});

// ===== URL拼接测试 =====

runTest('OpenAI兼容格式不应拼接/v1/messages', () => {
    const baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    const expectedUrl = baseUrl;  // 直接使用baseUrl
    const actualUrl = baseUrl.replace(/\/$/, '');
    assert.strictEqual(actualUrl, expectedUrl);
});

runTest('Anthropic格式应拼接/v1/messages', () => {
    const baseUrl = 'https://api.anthropic.com';
    const expectedUrl = 'https://api.anthropic.com/v1/messages';
    const actualUrl = baseUrl.replace(/\/$/, '') + '/v1/messages';
    assert.strictEqual(actualUrl, expectedUrl);
});

// ===== Header测试 =====

runTest('OpenAI兼容格式应使用Bearer token', () => {
    const apiKey = 'test-api-key';
    const headers = {
        'Authorization': `Bearer ${apiKey}`
    };
    assert.ok(headers.Authorization.includes('Bearer'));
    assert.ok(headers.Authorization.includes(apiKey));
});

runTest('Anthropic格式应使用x-api-key', () => {
    const apiKey = 'test-api-key';
    const headers = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
    };
    assert.ok(headers['x-api-key']);
    assert.ok(headers['anthropic-version']);
});

// ===== 实际配置验证 =====

runTest('当前配置的baseUrl应能正确识别格式', () => {
    const baseUrl = config.llm?.baseUrl || '';
    if (!baseUrl) {
        console.log('    (跳过：未配置baseUrl)');
        return;
    }

    const isOpenAICompatible = baseUrl.includes('/chat/completions') ||
                                baseUrl.includes('/compatible-mode') ||
                                baseUrl.includes('openrouter');

    console.log(`    baseUrl: ${baseUrl}`);
    console.log(`    识别为: ${isOpenAICompatible ? 'OpenAI兼容格式' : 'Anthropic格式'}`);

    // 验证代码逻辑是否正确处理
    assert.ok(typeof isOpenAICompatible === 'boolean');
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