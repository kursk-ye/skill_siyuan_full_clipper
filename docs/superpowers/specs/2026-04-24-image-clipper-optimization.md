# imageClipper 优化设计文档

## 概述

修复迭代五图片典藏功能的两个问题：
1. 图片不显示（路径格式错误）
2. 标题可能无意义（需要 LLM 生成）

## 问题分析

### 问题 1：图片路径格式错误

**根本原因**：思源笔记没有 `assets://` 协议，使用相对路径 `assets/xxx.png`

**当前错误实现**：
```javascript
// imageClipper.js 第 88 行
const assetUrl = `assets://${path.basename(assetPath)}`;
// 结果：assets://Loyal-20260424183504-kycyvan.png（错误）
```

**思源源代码验证** (`kernel/util/path.go` 第 274-280 行)：
```go
func IsAssetLinkDest(dest []byte, includeServePath bool) bool {
    return bytes.HasPrefix(dest, []byte("assets/"))  // 只识别 assets/ 开头
}
```

### 问题 2：标题可能无意义

**当前实现**：从文件名提取标题
```javascript
const title = path.basename(imagePath, path.extname(imagePath));
// IMG_001.png → 标题 "IMG_001"（无意义）
```

## 修复方案

### 修复 1：图片路径格式

| 文件 | 修改点 |
|------|--------|
| `scripts/clipper/imageClipper.js` | 第 88 行：移除 `assets://` 协议 |
| `scripts/core/save_note.js` | 第 428 行：移除 `assets://` 协议 |

**修改后**：
```javascript
// imageClipper.js
const assetUrl = assetPath;  // 直接使用返回值 "assets/xxx.png"

// save_note.js
const assetUrl = assetPath.replace(/^assets\//, 'assets/');  // 保持原格式
```

### 修复 2：LLM 同时返回标题

**修改文件**：`scripts/core/llm_engine.js`

**修改 Prompt**：
```javascript
function buildImageDescriptionPrompt() {
    return `请分析这张图片，生成：
1. 一个简洁的标题（10-20字，概括图片主题）
2. 一个描述（200-300字，详细说明图片内容）

返回 JSON 格式：
{
  "title": "图片标题",
  "description": "图片描述"
}

只返回 JSON，不要其他说明。`;
}
```

**修改返回值解析**：
```javascript
async function generateImageDescription(imagePath) {
    // ... 发送请求 ...

    // 解析 JSON 响应
    const result = JSON.parse(text);
    return {
        title: result.title || path.basename(imagePath, path.extname(imagePath)),
        description: result.description || ''
    };
}
```

**修改 imageClipper.js 调用方式**：
```javascript
// 原实现
const description = await generateImageDescription(imagePath);
const title = path.basename(imagePath, path.extname(imagePath));

// 修改后
const { title, description } = await generateImageDescription(imagePath);
```

## 文件改动清单

| 文件 | 改动内容 |
|------|----------|
| `scripts/clipper/imageClipper.js` | 修复 assetUrl 格式，使用 LLM 返回的标题 |
| `scripts/core/llm_engine.js` | 修改 generateImageDescription Prompt 和返回值结构 |
| `scripts/core/save_note.js` | 修复 assetUrl 格式 |

## 测试验证

1. 测试图片典藏，验证思源笔记中图片正常显示
2. 测试无意义文件名图片（如 IMG_001.png），验证标题由 LLM 生成
3. 验证 LLM 返回 JSON 解析正确（含 fallback 处理）

---

设计日期：2026-04-24