/**
 * 运行所有单元测试
 */

const path = require('path');
const { execSync } = require('child_process');

console.log('\n========================================');
console.log('  思源智能典藏 - 单元测试套件');
console.log('========================================\n');

const tests = [
    'correctPathByLevels.test.js',
    'llmApiFormat.test.js',
    'jsonParsing.test.js',
    'getNotebookPathTree.test.js'
];

let totalPassed = 0;
let totalFailed = 0;

for (const testFile of tests) {
    const testPath = path.join(__dirname, testFile);

    try {
        console.log(`\n运行 ${testFile}...`);
        execSync(`node "${testPath}"`, { stdio: 'inherit' });
        console.log('');
    } catch (err) {
        // 测试失败会设置exit code 1
        totalFailed++;
    }
}

console.log('\n========================================');
console.log('  测试完成');
console.log('========================================\n');