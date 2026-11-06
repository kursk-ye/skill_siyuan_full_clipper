#!/bin/bash
# 用于配置系统级的定时任务，使其每月 1 号运行一遍 export.js 刷新 json

set -e

# 定位当前运行路径与 export.js
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPORT_JS_PATH="$SCRIPT_DIR/export.js"

# Linux 下执行 cron 必须给出运行时的绝对二进制路径
NODE_BIN=$(which node)
if [ -z "$NODE_BIN" ]; then
    echo "Error: 当前环境未找到 node 命令，请排查环境变量！"
    exit 1
fi

# Cron 表达式：每月 1 号的 00:00 执行 export.js ("0 0 1 * *")
EXPORT_CRON_SCHEDULE="0 0 1 * *"
EXPORT_JOB_CMD="cd \"$SCRIPT_DIR\" && \"$NODE_BIN\" \"$EXPORT_JS_PATH\" >> \"$SCRIPT_DIR/export_cron_log.txt\" 2>&1"
EXPORT_CRON_JOB="$EXPORT_CRON_SCHEDULE $EXPORT_JOB_CMD"

# Cron 表达式：每周四凌晨1点执行 flushBrowser.js，保持浏览器 cookies 活跃 ("0 9,21 * * *")
FLUSH_CRON_SCHEDULE="0 1 * * 4"
FLUSH_JS_PATH="$SCRIPT_DIR/flushBrowser.js"
FLUSH_JOB_CMD="cd \"$SCRIPT_DIR\" && \"$NODE_BIN\" \"$FLUSH_JS_PATH\" >> \"$SCRIPT_DIR/flush_cron_log.txt\" 2>&1"
FLUSH_CRON_JOB="$FLUSH_CRON_SCHEDULE $FLUSH_JOB_CMD"

# 优雅写入机制：清除旧记录后写入所有 cron 任务
EXISTING_CRON=$(crontab -l 2>/dev/null || true)
# 过滤掉本项目已有的 export 和 flush 记录
FILTERED_CRON=$(echo "$EXISTING_CRON" | grep -v "$EXPORT_JS_PATH" | grep -v "$FLUSH_JS_PATH" || true)
# 写入所有任务
(echo "$FILTERED_CRON"; echo "$EXPORT_CRON_JOB"; echo "$FLUSH_CRON_JOB") | crontab -

echo "✅ 系统级定时任务已搭建成功！"
echo "  export.js : $EXPORT_CRON_JOB"
echo "  flushBrowser.js: $FLUSH_CRON_JOB"
touch "$SCRIPT_DIR/.setup_done"
echo "已产生状态标志文件: .setup_done"
echo "执行 'crontab -l' 即可随时查看。"
