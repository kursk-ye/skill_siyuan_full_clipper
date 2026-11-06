# youtubeClipper 设计文档

## 概述

迭代四：实现 YouTube 视频典藏功能，支持视频链接、字幕/评论总结、智能分类、思源保存。

## 典藏内容

| 内容 | 来源 |
|------|------|
| 视频链接 | 元数据 API |
| 标题 | 元数据 API |
| 作者（频道） | 元数据 API |
| 总结（详细） | 字幕优先，无字幕用评论 |

## 流程

```
YouTube URL → 解析视频ID → 获取元数据 → 字幕（zh-Hans → en fallback）
  ├─ 有字幕：字幕 → 临时MD → generateSummary(detailed)
  └─ 无字幕：评论 → 临时MD → generateSummary(detailed)
→ selectCategory → createNote → 清理临时文件
```

## URL 格式

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`

视频ID提取正则：
```javascript
/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/
```

## 文件改动

| 文件 | 改动 |
|------|------|
| `scripts/clipper/youtubeClipper.js` | 新建，实现完整流程 |
| `scripts/core/opencli-runner.js` | 新增 `extractYoutubeId()`, `getYoutubeMetadata()`, `downloadYoutubeTranscript()`, `downloadYoutubeComments()` |
| `scripts/clipper.js` | `detectContentType()` 已支持 youtube.com 和 youtu.be |

## 详细设计

### opencli-runner.js 新增函数

```javascript
/**
 * 从 URL 中提取 YouTube 视频 ID
 * @param {string} url - YouTube 视频 URL
 * @returns {string|null} 视频ID，未找到返回 null
 */
function extractYoutubeId(url) {
  // 支持 youtube.com/watch?v=xxx 和 youtu.be/xxx
}

/**
 * 获取 YouTube 视频元数据
 * @param {string} videoId - 视频ID
 * @returns {Promise<{title: string, author: string, originalUrl: string, publishDate: string|null}>}
 */
async function getYoutubeMetadata(videoId) {
  // opencli youtube video <url> --format json
}

/**
 * 下载 YouTube 视频字幕（中文优先，英语备选）
 * @param {string} videoId - 视频ID
 * @param {string} outputDir - 输出目录
 * @returns {Promise<{transcriptPath: string|null, exists: boolean}>}
 */
async function downloadYoutubeTranscript(videoId, outputDir) {
  // 1. 尝试 opencli youtube transcript --lang zh-Hans
  // 2. 失败则尝试 --lang en
  // 3. 都失败则返回 exists=false
}

/**
 * 下载 YouTube 视频评论
 * @param {string} videoId - 视频ID
 * @param {string} outputDir - 输出目录
 * @returns {Promise<{commentsPath: string}>}
 */
async function downloadYoutubeComments(videoId, outputDir) {
  // opencli youtube comments <url> --limit 20 --format md
}
```

### youtubeClipper.js 主函数

```javascript
async function youtubeClip(url, config) {
  // 1. 解析视频ID
  const videoId = extractYoutubeId(url);
  
  // 2. 创建临时目录
  const outputDir = '/tmp/siyuan_clipper_temp/' + Date.now();
  
  // 3. 获取视频元数据
  const metadata = await getYoutubeMetadata(videoId);
  
  // 4. 尝试获取字幕（中文 → 英语）
  const transcriptResult = await downloadYoutubeTranscript(videoId, outputDir);
  
  // 5. 构建临时 Markdown
  let contentPath;
  let contentType;
  if (transcriptResult.exists) {
    contentPath = transcriptResult.transcriptPath;
    contentType = 'transcript';
  } else {
    const commentsResult = await downloadYoutubeComments(videoId, outputDir);
    contentPath = commentsResult.commentsPath;
    contentType = 'comments';
  }
  
  // 6. 构建完整临时 MD（元数据 + 内容）
  const tempMdPath = buildTempMd(metadata, contentPath, contentType, outputDir);
  
  // 7. 生成详细总结
  const summary = await generateSummary(tempMdPath, { detailed: true });
  
  // 8. 智能分类
  const category = await selectCategory(metadata.title, summary, categoriesTree);
  
  // 9. 保存到思源
  const noteResult = await createNote(..., summary, config.siyuan);
  
  // 10. 清理临时目录
  // 11. 返回结果
}
```

## opencli 命令依赖

| 命令 | 用途 |
|------|------|
| `opencli youtube video <url> --format json` | 获取元数据（title, author, channel等） |
| `opencli youtube transcript <url> --lang zh-Hans --format md` | 获取中文字幕 |
| `opencli youtube transcript <url> --lang en --format md` | 获取英语字幕（备选） |
| `opencli youtube comments <url> --limit 20 --format md` | 获取评论（前20条） |

## 字幕语言优先级

1. 首先尝试 `zh-Hans`（简体中文）
2. 失败则尝试 `en`（英语）
3. 都失败则 fallback 到评论

## 检测逻辑

在 `clipper.js` 的 `detectContentType()` 中已支持：
```javascript
if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
```

## 复用模块

- `generateSummary(mdPath, { detailed: true })` - 详细总结（已实现）
- `selectCategory()` - 智能分类（已实现）
- `createNote()` - 思源保存（已实现）

## 测试验证

1. 有字幕视频典藏（中文字幕）
2. 无中文字幕但有英语字幕的视频
3. 无字幕视频典藏（评论总结）
4. 短链接 `youtu.be/xxx` 解析
5. 智能分类准确性

---

设计日期：2026-04-24