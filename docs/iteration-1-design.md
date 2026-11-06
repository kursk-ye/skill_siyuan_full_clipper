# 迭代一：思源笔记知识目录周期性提取

## 1. 业务目标

将思源笔记原有的目录树动态提取逻辑剥离，转由独立的**操作系统级定时任务**负责。定期拉取当前思源笔记中所有的笔记本和目录层级，并将位于最底层、具备代表性的笔记记录提取部分作为大模型分类的“样例（Sample）”，最终整理为一棵树状结构的 JSON，并缓存到本地为 `categories.json`。
此举让后续的剪存主逻辑能够在毫秒内读取现成词典进行推理，彻底免去每次请求抓去全站目录的巨大 I/O 与等待开销。

## 2. 核心执行脚本 (`scripts/export.js`)

我们对 `skill_siyuan_collection\scripts\export_tree.js` 的核心逻辑进行继承，并使其更适合通用的智能体调用。

### 2.1 配置参数获取
无需强绑定 OpenClaw，脚本默认读取本skill全局配置文件`config.json`，获取两项核心配置以供鉴权：
- `siyuanApi`: 默认 `http://127.0.0.1:6806`
- `siyuanToken`: 用于请求的 API Token。

### 2.2 获取逻辑实现
1. **拉取全量笔记本大纲**：
   - 调用 HTTP POST `/api/notebook/lsNotebooks`。
   - 脱除 closed 状态的笔记本，构建映射表 (`notebook.id` -> `notebook.name`)。
2. **获取文档的层级路径 (hpath)**：
   - 使用极简的 SQL 注入查询功能，调用 HTTP POST `/api/query/sql`。
   - SQL: `SELECT box, hpath FROM blocks WHERE type='d' LIMIT 999999` （`type='d'` 代表文档 Document）。
3. **转化树结构的剪枝与汇编**：
   - 将扁平化附带 `/` 的 `hpath` 按目录分割进行嵌套树重建。
   - **样例抽取机制**：在递归时分离出“含有子项的分支”与“不含有任何下级内容的叶子文档节点”。对于叶子节点只截取前三条 `[...leafKeys.splice(0, 3)]` 以作为特征样例留存。
   - 利用 `fs.writeFileSync` 将最后的树对象生成美化版的 `categories.json`。

## 3. 操作系统级定时任务管理 (`scripts/setup_cron.sh`)

为了将整个刷新事务沉入 Ubuntu / 鸿蒙系统级别的周期任务内闭环，在此阶段同时研发一段纯 bash 语言配置脚本 `setup_cron.sh`。这样只需要 LLM/您调用一次，该脚本就会利用系统的 `crontab` 指令对当前环境布下定时任务（防重写入）。

### Bash 脚本代码设计与释义

```bash
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
echo "执行 'crontab -l' 即可随时查看。"
```

## 4. 实施清单

考虑到当前您的本机开发环境为 Windows，而生产目标是 Ubuntu (Orange Pi 3B)，在开发与测试环节，我们将作如下适配隔离：

1. **基础环境初始化**：于根目录初始化 `package.json`。
2. **核心业务开发**：创建 `scripts` 文件夹，并编写 `scripts/export.js`，实现思源笔记数据的获取与剪枝。
3. **Windows 本机联调**：在当前 Windows 环境下，**仅执行** `node scripts/export.js` 命令，用来在本地测试 `categories.json` 的成树效果和逻辑正确率，这足以验证核心功能。
4. **Linux 守护脚本入库**：照常编写 `scripts/setup_cron.sh` 作为资产归档（不在 Windows 环境下执行或测试）。未来将本技能工程全量同步至您的智能体服务器后，方由服务器进行任务挂载执行。
