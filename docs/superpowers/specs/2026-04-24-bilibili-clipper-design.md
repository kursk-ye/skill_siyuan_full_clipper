# bilibiliClipper 设计文档

## 概述

迭代3：实现 B站视频典藏功能，支持视频链接、字幕/评论总结、智能分类、思源保存。

## 典藏内容

| 内容 | 来源 |
|------|------|
| 视频链接 | 元数据 API |
| 标题 | 元数据 API |
| 作者（UP主） | 元数据 API |
| 总结（详细） | 字幕优先，无字幕用评论 |

## 流程

```
B站URL → 解析BV号 → 获取元数据 → 检查字幕
  ├─ 有字幕：字幕 → 临时MD → generateSummary(detailed)
  └─ 无字幕：评论 → 临时MD → generateSummary(detailed)
→ selectCategory → createNote → 清理临时文件
```

## URL 格式

- `https://www.bilibili.com/video/BV1xxx`
- `https://b23.tv/xxx`（短链接）

BV号提取正则：
```javascript
/(BV[a-zA-Z0-9]+)/
```

## 文件改动

| 文件 | 改动 |
|------|------|
| `scripts/clipper/bilibiliClipper.js` | 新建，实现完整流程 |
| `scripts/core/opencli-runner.js` | 新增 `downloadBilibiliSubtitle(bvid)` 和 `downloadBilibiliComments(bvid)` |
| `scripts/core/llm_engine.js` | 扩展 `generateSummary(mdPath, { detailed: true })` |
| `scripts/clipper.js` | `detectContentType()` 新增 bilibili URL 检测 |

## 详细设计

### opencli-runner.js 新增函数

```javascript
/**
 * 下载 B站视频字幕
 * @param {string} bvid - BV号
 * @param {string} outputDir - 输出目录
 * @returns {Promise<{subtitlePath: string, exists: boolean}>}
 */
async function downloadBilibiliSubtitle(bvid, outputDir) {
  // opencli bilibili subtitle <bvid> --format md
  // 返回字幕文件路径，无字幕时 exists=false
}

/**
 * 下载 B站视频评论
 * @param {string} bvid - BV号
 * @param {string} outputDir - 输出目录
 * @returns {Promise<{commentsPath: string}>}
 */
async function downloadBilibiliComments(bvid, outputDir) {
  // opencli bilibili comments <bvid> --format md
  // 取热门前 20 条评论
}
```

### llm_engine.js 扩展

```javascript
/**
 * 生成总结
 * @param {string} mdPath - Markdown 文件路径
 * @param {Object} options - 配置选项
 * @param {boolean} options.detailed - 是否生成详细总结（含要点提炼）
 * @returns {Promise<string>} 总结文本
 */
async function generateSummary(mdPath, options = {}) {
  const { detailed = false } = options;
  // detailed=true 时使用详细总结模板
}
```

### 详细总结格式

```markdown
## 内容概述
（200字概述）

## 关键要点
1. xxx
2. xxx
3. xxx

## 结论
（100字结论）
```

### bilibiliClipper.js 主函数

```javascript
async function bilibiliClip(url, config) {
  // 1. 解析 BV号
  const bvid = extractBvid(url);
  
  // 2. 创建临时目录
  const outputDir = '/tmp/siyuan_clipper_temp/' + Date.now();
  
  // 3. 获取视频元数据
  const metadata = await getBilibiliMetadata(bvid);
  
  // 4. 尝试获取字幕
  const subtitleResult = await downloadBilibiliSubtitle(bvid, outputDir);
  
  // 5. 构建临时 Markdown
  let contentPath;
  if (subtitleResult.exists) {
    contentPath = buildTempMd(metadata, subtitleResult.subtitlePath, 'subtitle');
  } else {
    const commentsResult = await downloadBilibiliComments(bvid, outputDir);
    contentPath = buildTempMd(metadata, commentsResult.commentsPath, 'comments');
  }
  
  // 6. 生成详细总结
  const summary = await generateSummary(contentPath, { detailed: true });
  
  // 7. 智能分类
  const category = await selectCategory(metadata.title, summary, categoriesTree);
  
  // 8. 保存到思源（传递总结作为内容）
  const noteResult = await createNote(..., summary, config.siyuan);
  
  // 9. 清理临时目录
  // 10. 返回结果
}
```

## opencli 命令依赖

| 命令 | 用途 |
|------|------|
| `opencli bilibili video <bvid>` | 获取元数据（title, author, originalUrl） |
| `opencli bilibili subtitle <bvid> --format md` | 获取字幕 |
| `opencli bilibili comments <bvid> --format md` | 获取评论 |

## 检测逻辑

在 `clipper.js` 的 `detectContentType()` 中新增：

```javascript
if (url.includes('bilibili.com/video') || url.includes('b23.tv')) {
  return 'bilibili';
}
```

## 测试验证

1. 有字幕视频典藏
2. 无字幕视频典藏（评论总结）
3. 短链接 `b23.tv` 解析
4. 智能分类准确性

---

设计日期：2026-04-24