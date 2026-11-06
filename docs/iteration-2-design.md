# 迭代二：网页剪藏与智能归类 —— Web Clipper & Smart Routing

## 1. 业务目标

实现从网页链接到思源笔记的完整自动化流程：用户发送一个网页 URL 并表达保存意图后，系统能够自动完成**opencli 下载 → AI 总结 → 智能分类 → 创建笔记**的全流程，最终将内容精准存放到思源笔记的合适目录中。

### 核心价值主张

- **零手动操作**：用户仅需发送 URL + "保存"，无需关心分类路径
- **智能决策**：利用预生成的 `categories.json`，让 LLM 基于现有知识体系做出归类决策
- **反爬虫无忧**：利用 opencli 的浏览器自动化能力，绕过知乎、微信公众号等反爬机制
- **闭环验证**：跑通第一条数据流，为后续图片、视频等多媒体解析奠定基础架构

---

## 2. 技术选型：opencli + 思源笔记原生 API

> **核心思路**：不重复造轮子，利用 opencli 成熟的爬虫能力处理网页下载，我们专注于分类和保存。

### 2.1 opencli 核心能力

通过分析，opencli 提供以下关键能力：

| 命令 | 功能 | 本项目使用场景 |
|------|------|----------------|
| `opencli web read` | 抓取任意网页并导出为 Markdown | 通用网页保存 |
| `opencli zhihu download` | 导出知乎文章为 Markdown | 知乎专栏保存 |
| `opencli bilibili` | B 站视频信息提取 | 后续迭代：视频总结 |
| `opencli weixin` | 微信公众号文章提取 | 公众号文章保存 |
| `--download-images` | 图片本地化下载 | 可选：图片下载到本地 |

### 2.2 与参考项目的对比

| 维度 | skill_siyuan_collection (Playwright) | skill_siyuan_full_clipper (opencli) |
|------|-------------------------------------|-------------------------------------|
| 网页抓取 | 自己用 Playwright 渲染 | 调用 opencli，零维护成本 |
| 反爬虫 | 需要自己处理 Cookie、反爬 | opencli 内置 Cookie 管理、浏览器复用 |
| 依赖复杂度 | 需要 playwright-core + jsdom | 仅需 node-fetch (调用 opencli CLI) |
| 维护成本 | 需要跟进各网站反爬策略变更 | opencli 社区维护 80+ 网站适配器 |

---

## 3. 核心执行流程 (Workflow Pipeline)

### 3.1 完整数据流

```
用户发送 URL + "保存"
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. clipper.js - 识别内容类型并分发                          │
│    detectContentType(url) → 'web' | 'zhihu' | 'wechat'      │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. clipper/*Clipper.js - 具体典藏处理                       │
│    webClip(url, config) / zhihuClip() / wechatClip()        │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. core/opencli-runner.js - 下载网页为 Markdown             │
│    download(sourceType, url, outputDir)                     │
│    → 执行 opencli ${type} "${url}" -o "${mdPath}"           │
│    → 返回 { mdPath, title, originalUrl, source }            │
└───────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. core/llm_engine.js - LLM 生成摘要                        │
│    generateSummary(mdPath)                                  │
│    → 读取 Markdown 文件头部                                 │
│    → 构建 Prompt：标题 + 正文前 N 段                        │
│    → 调用宿主智能体 LLM → 返回 200-300 字摘要               │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. core/llm_engine.js - LLM 智能分类                        │
│    selectCategory(title, summary, categoriesTree)           │
│    → 读取 categories.json (思源知识库树状结构 + 样本)        │
│    → 构建 Prompt：标题 + 摘要 + 可选分类路径                │
│    → 调用宿主智能体 LLM → 返回 { notebook, path }           │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. core/save_note.js - 创建思源笔记文档                     │
│    createNote(notebook, path, markdownPath, title, ...)     │
│    → POST /api/filetree/createDocWithMd                     │
│    → 返回 { docId, success: true }                          │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. 输出结果 + 清理临时文件                                  │
│    console.log("✅ 典藏完成:", { docId, notebook, path })   │
│    fs.rmSync(outputDir, { recursive: true, force: true })   │
└─────────────────────────────────────────────────────────────┘
```

---

### 3.2 关键函数调用链

```
main()
  ├─ parseCliArgs() → { url, config? }
  ├─ loadConfig() → ClipperConfig
  ├─ detectContentType() → 'web' | 'zhihu' | 'wechat'
  ├─ clippers[`${type}Clip`](url, config)
  │    └─ download(type, url, outputDir)
  │         ├─ buildCommand() → { command, mdPath }
  │         ├─ execSync(command)
  │         └─ extractMetadata(mdPath) → { title, originalUrl }
  ├─ generateSummary(mdPath) → summary
  ├─ selectCategory(title, summary, categoriesTree) → { notebook, path }
  └─ createNote(notebook, path, mdPath, title, originalUrl) → { docId }
```

---

### 3.3 测试驱动开发流程

**每次修改代码后必须执行的测试步骤：**

#### 单元测试级别

```bash
# 1. 测试 opencli-runner.js 命令构建
node -e "const { buildCommand } = require('./core/opencli-runner'); console.log(buildCommand('web', 'https://example.com', '/tmp'))"
# 预期输出：{ command: 'opencli web "https://example.com" -o "/tmp/xxx.md"', mdPath: '...' }

# 2. 测试自动扫描机制
node -e "const clippers = require('./clipper/index'); console.log(Object.keys(clippers))"
# 预期输出：['webClip', 'zhihuClip', 'wechatClip', ...]

# 3. 测试 URL 类型识别
node -e "const { detectContentType } = require('./clipper'); console.log(detectContentType('https://www.zhihu.com/question/123'))"
# 预期输出：'zhihu'
```

#### 集成测试级别

```bash
# 4. 测试完整流程（使用真实 URL）
# 准备：确保思源笔记正在运行，config.json 配置正确
node scripts/clipper.js https://example.com --config ./config.json
# 预期：console 输出 "✅ 典藏完成"，思源笔记中创建新文档
```

#### 测试检查清单

每次代码修改后，按顺序验证：

| 测试项 | 命令 | 预期结果 | 通过？ |
|--------|------|----------|--------|
| 模块加载 | `require('./clipper')` | 无错误 | □ |
| 类型识别 | `detectContentType(url)` | 正确返回类型 | □ |
| 命令构建 | `buildCommand('web', url, dir)` | 有效命令字符串 | □ |
| opencli 下载 | 手动执行 opencli 命令 | Markdown 文件生成 | □ |
| 元数据提取 | `extractMetadata(mdPath)` | 正确提取标题和 URL | □ |
| 分类决策 | 模拟 LLM 返回 | 正确 notebook+path | □ |
| 思源创建 | POST /api/filetree/createDocWithMd | HTTP 200, docId 返回 | □ |

---

### 3.4 错误处理与日志

```javascript
// 每个环节都要有 try-catch 和清晰的错误日志
try {
    const result = await download(sourceType, url, outputDir);
} catch (err) {
    console.error(`❌ [下载失败] ${url}: ${err.message}`);
    // 记录详细错误：命令输出、文件权限、网络状态
    throw new Error(`opencli 下载失败：${err.message}`);
}
```
