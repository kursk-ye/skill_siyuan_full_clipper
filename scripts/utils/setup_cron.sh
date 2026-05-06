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

# Cron 表达式：默认设置为 每月 1 号的 00:00 执行一次 ("0 0 1 * *")
CRON_SCHEDULE="0 0 1 * *"

# 将输出日志重定向到文件以供排查问题
JOB_CMD="cd \"$SCRIPT_DIR\" && \"$NODE_BIN\" \"$EXPORT_JS_PATH\" >> \"$SCRIPT_DIR/export_cron_log.txt\" 2>&1"
CRON_JOB="$CRON_SCHEDULE $JOB_CMD"

# 优雅写入机制：查阅现存在 cron表，过滤掉包含了本项目路径的旧记录，并追加最新的 CRON_JOB 指令
( crontab -l 2>/dev/null | grep -v "$EXPORT_JS_PATH"; echo "$CRON_JOB" ) | crontab -

echo "✅ 系统级定时任务已搭建成功！"
echo "设定的执行命令：$CRON_JOB"
touch "$SCRIPT_DIR/.setup_done"
echo "已产生状态标志文件: .setup_done"
echo "执行 'crontab -l' 即可随时查看。"
