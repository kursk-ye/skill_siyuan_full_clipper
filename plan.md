# skill_siyuan_full_clipper (思源智能典藏分类技能)

这是一个全自动的网页、图片、视频抓取和总结，并自动根据内容归类的工作流技能 (Skill)，专为打通 **AI 智能体系统** 和 **SiYuan Notes（思源笔记）** 而设计。

通过该工作流，您只需向 智能体 发送一个普通链接(网页或视频)或图片，并同时表达收藏的意思(例如上下文中有"保存"、"收藏"、"典藏"等类似词语)，智能体就明白这个链接是一篇新笔记，要收藏到思源笔记，按照如下步骤处理：

1. 生成总结
    - 如果链接是网页，智能体会自动抓取网页内容并发给LLM生成一段总结文字。
    - 如果链接是图片，智能体会自动下载图片并发给LLM生成一段总结文字。
    - 如果链接是视频，按照如下步骤处理：
        - 如果视频有字幕，提取字幕发给LLM生成一段详细总结（含要点提炼）。
        - 如果视频没有字幕，则获取热门评论发给LLM生成详细总结。
2. 选择该知识点的保存目录。将标题和总结，以及思源笔记里**已有的目录体系(含每个目录下前3个知识点标题作为样例)** 都发送给LLM，由LLM选择最合适的目录。

## 🛠️ 环境依赖要求 (Prerequisites)

1. **安装思源笔记内核：** 要求智能体运行的服务器上也必须同时安装并运行了思源笔记。默认情况它是推送到本机的 `127.0.0.1:6806` 接口。
1. **正确部署 Skill 目录：** 必须将本工程的整个文件夹完整地移动或克隆到智能体工作空间下的 `workspace/skills/` 目录内，方可被主程序识别。
1. **Node.js 环境：** 该服务器需要安装 Node.js，并在本工程目录下执行 `npm install` 构建依赖。
1. **opencli:** 该服务器需要安装 opencli。
1. **playwright-core、jsdom、@mozilla/readability:** 用于思源扩展方式抓取网页。
1. 智能体运行的服务器环境:
        - 硬件: Orange Pi 3B
        - 系统: Ubuntu 20.04.3 LTS
        - CPU: 瑞芯微3568
        - 内存： 8G

---

## 📅 敏捷迭代开发计划

### 迭代一：思源笔记知识目录周期性提取 —— 定时生成 categories.json ✅ 已完成

**目标**：剥离实时的目录结构查询，改为通过一个独立的周期性任务，定期抓取思源笔记目录及样例文档，并本地缓存为 json 文件，供后续大模型快速调用。

- **开发内容**：
  - `package.json`：初始化项目依赖。
  - `scripts/utils/export.js`：核心执行脚本，调用 API 抓取数据并持久化输出为 `categories.json`。
  - 配置系统级定时任务来周期运行 `export.js`。
- **完成状态**：✅ 已完成

### 迭代二：网页剪存归类闭环 —— 普通网页、知乎、微信公众号 ✅ 已完成

**目标**：跑通第一条数据流，支持**普通网页、知乎文章、微信公众号文章**三类内容的典藏。

- **开发内容**：
  - `scripts/clipper.js`：工作流统一入口，识别内容类型并分发到对应处理函数。
  - `scripts/clipper/webClipper.js`：普通网页典藏，使用**思源扩展方式**（Playwright + Readability + 思源API转换）。
  - `scripts/clipper/zhihuClipper.js`：知乎内容典藏（专栏文章 + 问题回答），使用 opencli 处理反爬虫。
  - `scripts/clipper/wechatClipper.js`：微信公众号文章典藏，使用 opencli 处理反爬虫。
  - `scripts/core/siyuan_web.js`：思源扩展方式下载网页，Playwright持久化浏览器 + DOM预处理。
  - `scripts/core/siyuan-dom-utils.js`：DOM预处理脚本（复制自思源Chrome扩展）。
  - `scripts/core/opencli-runner.js`：opencli 命令执行工具，负责下载网页为 Markdown。
  - `scripts/core/llm_engine.js`：开发"归类决策 Prompt"和"文本总结 Prompt"。
  - `scripts/core/save_note.js`：根据 LLM 决策出的路径动态创建新笔记并写入 Markdown 数据。
  - `scripts/types.js`：集中 JSDoc 类型定义。
- **完成状态**：✅ 已完成
- **版本标签**：`weixinClipper0424`

### 迭代三：B站视频剪存 ✅ 已完成

**目标**：实现对 B 站视频的典藏，包括视频链接、元数据、详细总结。

- **开发内容**：
  - 修改 `scripts/clipper.js`：增加 bilibili URL 检测（支持 bilibili.com/video 和 b23.tv 短链接）。
  - `scripts/clipper/bilibiliClipper.js`：
    - 提取 BV号，获取视频元数据（标题、UP主）
    - **有字幕处理**：提取字幕内容
    - **无字幕处理（兜底）**：获取热门评论（前20条）
    - 使用详细总结模式（概述 + 关键要点 + 结论）
  - 扩展 `scripts/core/llm_engine.js`：
    - `generateSummary(mdPath, { detailed: true })` 支持详细总结
    - `buildDetailedSummaryPrompt()` 详细总结 Prompt 模板
  - 扩展 `scripts/core/opencli-runner.js`：
    - `extractBvid()` 从 URL 提取 BV号
    - `getBilibiliMetadata()` 获取视频元数据
    - `downloadBilibiliSubtitle()` 获取字幕
    - `downloadBilibiliComments()` 获取评论
- **测试目标**：传入 B 站视频 URL，思源中生成详细总结并精准归类。
- **完成状态**：✅ 已完成
- **版本标签**：`bilibiliClipper0424`

### 迭代四：YouTube 视频剪存 ⏳ 待开发

**目标**：实现对 YouTube 视频的典藏。

- **开发内容**：
  - 修改 `scripts/clipper.js`：接管 YouTube 平台的视频链接请求。
  - 新增 `scripts/clipper/youtubeClipper.js`：
    - 提取视频 ID，获取元数据
    - 有字幕时提取字幕内容
    - 无字幕时获取评论
    - 使用详细总结模式
  - 复用 `llm_engine.js` 的详细总结能力。
- **测试目标**：发送 YouTube URL，智能体解析并归档至思源目录。
- **完成状态**：⏳ 待开发

### 迭代五：视觉多模态 —— 图片解析与剪存 ⏳ 待开发

**目标**：扩展支持图片输入，发给多模态大模型进行理解与归档。

- **开发内容**：
  - 修改 `scripts/clipper.js`：增加对图片类型的入口识别。
  - 新增 `scripts/clipper/imageClipper.js`：处理图片的存储或编码转换。
  - 升级 `scripts/core/llm_engine.js`：支持带图的大模型请求（Vision）。
- **测试目标**：发送带有意图的图片（如架构图截图），在思源内生成解析说明并分类存放。
- **完成状态**：⏳ 待开发

### 迭代六：抖音视频剪存 ⏳ 待开发

**目标**：实现对抖音短视频的典藏。

- **开发内容**：
  - 修改 `scripts/clipper.js`：接管抖音平台的视频链接请求。
  - 新增 `scripts/clipper/douyinClipper.js`：
    - 提取视频信息
    - 使用详细总结模式
- **测试目标**：发送抖音 URL，智能体解析并归档至思源目录。
- **完成状态**：⏳ 待开发

---

## 📊 当前迭代状态总览

| 迭代 | 内容 | 状态 | 版本标签 |
|------|------|------|----------|
| 迭代一 | categories.json 导出 | ✅ 完成 | - |
| 迭代二 | webClipper + zhihuClipper + wechatClipper | ✅ 完成 | weixinClipper0424 |
| 迭代三 | bilibiliClipper（B站视频） | ✅ 完成 | bilibiliClipper0424 |
| 迭代四 | youtubeClipper（YouTube视频） | ⏳ 待开发 | - |
| 迭代五 | imageClipper（图片解析） | ⏳ 待开发 | - |
| 迭代六 | douyinClipper（抖音视频） | ⏳ 待开发 | - |

---

## 文件说明
- `config.json` - 全局配置文件，存储思源 API 地址、Token、LLM 配置等。
- `categories.json` - 思源笔记目录树结构缓存文件。
- `scripts/clipper.js` - 入口文件，URL 类型检测与分发。
- `scripts/clipper/*.js` - 各平台典藏器（webClipper, zhihuClipper, wechatClipper, bilibiliClipper 等）。
- `scripts/core/siyuan_web.js` - 思源扩展方式下载网页（Playwright + Readability）。
- `scripts/core/opencli-runner.js` - opencli 命令执行（知乎、微信、B站等）。
- `scripts/core/llm_engine.js` - LLM 调用（摘要生成、智能分类）。
- `scripts/core/save_note.js` - 思源 API 调用（创建文档、上传资产）。
- `scripts/types.js` - 集中 JSDoc 类型定义。