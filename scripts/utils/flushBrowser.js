#!/usr/bin/env node
/**
 * flushBrowser.js
 *
 * 用 opencli 周期性下载微信/知乎文章、B站历史，保持浏览器 cookies 活跃。
 * 下载完成后立即删除临时文件。
 *
 * 用法:
 *   node flushBrowser.js              # 刷新所有已配置的平台
 *   node flushBrowser.js weixin       # 仅刷新微信
 *   node flushBrowser.js bilibili     # 仅刷新B站
 *   node flushBrowser.js zhihu        # 仅刷新知乎
 *
 * URL 来源：config.json 中的 keepalive 配置。
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', '..', 'config.json');
let config = {};
if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

const keepalive = config?.keepalive || {};

/**
 * 执行一次 opencli 刷新任务
 * @param {string} name - 平台名称（日志用）
 * @param {string} command - opencli 命令
 * @param {string|null} url - 可选 URL
 * @param {boolean} stdoutOnly - 是否只输出到终端（不需要 --output）
 */
function runFlush(name, command, url = null, stdoutOnly = false) {
    console.log(`\n🔄 flushBrowser: 刷新 ${name} cookies...`);

    try {
        let cmd;
        if (stdoutOnly) {
            cmd = url
                ? `opencli ${command} --url "${url}" --format md`
                : `opencli ${command} --format md`;
        } else {
            const tmpDir = path.join('/tmp', 'siyuan_clipper_keepalive', name, Date.now().toString());
            fs.mkdirSync(tmpDir, { recursive: true });
            cmd = url
                ? `opencli ${command} --url "${url}" --output "${tmpDir}" --download-images false --format md`
                : `opencli ${command} --output "${tmpDir}" --format md`;
        }

        execSync(cmd, { stdio: 'pipe', timeout: 60000 });
        console.log(`✅ ${name}: 刷新完成`);
    } catch (err) {
        console.log(`⚠️ ${name}: opencli 退出（${err.message}）`);
    } finally {
        // 清理非 stdoutOnly 平台的临时文件
        if (!stdoutOnly) {
            try {
                const tmpDir = path.join('/tmp', 'siyuan_clipper_keepalive', name);
                // 只清理本次运行创建的子目录（以时间戳命名的目录）
                if (fs.existsSync(tmpDir)) {
                    const entries = fs.readdirSync(tmpDir);
                    for (const entry of entries) {
                        try {
                            fs.rmSync(path.join(tmpDir, entry), { recursive: true, force: true });
                        } catch (e) { /* 忽略 */ }
                    }
                }
            } catch (e) {
                // 忽略清理错误
            }
        }
    }
}

// 平台配置
const platforms = {
    weixin: {
        enabled: !!keepalive?.weixin?.url,
        url: keepalive?.weixin?.url,
        command: 'weixin download',
        stdoutOnly: false
    },
    bilibili: {
        enabled: !!keepalive?.bilibili,
        url: null,
        command: 'bilibili history --limit 1',
        stdoutOnly: true
    },
    zhihu: {
        enabled: !!keepalive?.zhihu?.url,
        url: keepalive?.zhihu?.url,
        command: 'zhihu download',
        stdoutOnly: false
    }
};

// 命令行指定平台时，只刷新指定的
const cliPlatforms = process.argv.slice(2).filter(p => platforms[p]);
const targetPlatforms = cliPlatforms.length > 0
    ? cliPlatforms.filter(p => platforms[p].enabled)
    : Object.keys(platforms).filter(p => platforms[p].enabled);

if (targetPlatforms.length === 0) {
    console.error('❌ 未配置任何平台，请在 config.json 中添加 keepalive 配置');
    console.error('   示例: { "keepalive": { "weixin": { "url": "https://..." }, "bilibili": {}, "zhihu": { "url": "https://..." } } }');
    process.exit(1);
}

// 依次刷新
for (const name of targetPlatforms) {
    const { url, command, stdoutOnly } = platforms[name];
    runFlush(name, command, url, stdoutOnly);
}

console.log('\n✅ flushBrowser: 全部刷新完成');
