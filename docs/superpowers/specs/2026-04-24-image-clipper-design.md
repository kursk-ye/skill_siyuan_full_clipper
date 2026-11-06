# imageClipper 设计文档

## 概述

迭代五：实现图片典藏功能，支持本地图片上传、LLM描述生成、智能分类、思源保存。

## 典藏内容

| 内容 | 来源 |
|------|------|
| 图片 | 上传到思源资产 |
| 描述（简短） | LLM 多模态生成 |
| 分类 | LLM 智能选择 |

## 调用方式

```bash
node scripts/clipper.js /path/to/image.jpg --config ./config.json
```

用户发送图片给 openclaw → 图片保存到本地 → openclaw 调用 clipper.js 并传递图片路径。

## 流程

```
图片路径 → 检测文件类型 → 上传到思源资产 → LLM生成描述（多模态）
→ selectCategory → createNote（图片链接 + 描述） → 返回结果
```

## 支持的图片格式

- jpg/jpeg
- png
- gif
- webp
- bmp

## 文件改动

| 文件 | 改动 |
|------|------|
| `scripts/clipper.js` | `detectContentType()` 增加本地图片文件检测 |
| `scripts/clipper/imageClipper.js` | 新建，实现完整流程 |
| `scripts/core/llm_engine.js` | 新增 `generateImageDescription(imagePath)` 支持多模态 |
| `scripts/core/save_note.js` | 可能需要扩展以支持纯图片资产上传 |

## 详细设计

### clipper.js 改动

```javascript
function detectContentType(input) {
    // 检查是否是本地文件路径
    if (fs.existsSync(input)) {
        const ext = path.extname(input).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
            return 'image';
        }
    }
    // 其他 URL 检测...
}
```

### llm_engine.js 新增函数

```javascript
/**
 * 生成图片描述（多模态）
 * @param {string} imagePath - 图片文件路径
 * @returns {Promise<string>} 图片描述（200-300字）
 */
async function generateImageDescription(imagePath) {
    // 1. 读取图片转为 base64
    const imageBase64 = fs.readFileSync(imagePath, 'base64');
    const mimeType = getMimeType(imagePath);
    
    // 2. 构建多模态请求发送给 QWEN3.5-PLUS
    // 3. 返回描述文本
}

/**
 * 获取图片 MIME 类型
 * @param {string} imagePath - 图片路径
 * @returns {string} MIME 类型
 */
function getMimeType(imagePath) {
    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp'
    };
    return mimeTypes[ext] || 'image/jpeg';
}
```

### imageClipper.js 主函数

```javascript
async function imageClip(imagePath, config) {
    // 1. 验证图片文件存在
    // 2. 上传图片到思源资产
    const assetUrl = await uploadImage(imagePath, config.siyuan);
    
    // 3. LLM 生成图片描述
    const description = await generateImageDescription(imagePath);
    
    // 4. 从图片路径提取文件名作为标题
    const title = path.basename(imagePath, path.extname(imagePath));
    
    // 5. 智能分类
    const category = await selectCategory(title, description, categoriesTree);
    
    // 6. 创建笔记（图片链接 + 描述）
    const noteResult = await createNote(
        category.notebook,
        category.path,
        null,  // 无 markdown 文件
        title,
        imagePath,  // 原始路径
        `![Image](assets://${assetUrl})\n\n${description}`,  // 内容
        config.siyuan
    );
    
    // 7. 返回结果
}
```

### 思源资产上传

使用思源 API `/api/asset/upload`：
```javascript
async function uploadImage(imagePath, siyuanConfig) {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(imagePath));
    
    const response = await fetch(`${siyuanConfig.api}/api/asset/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${siyuanConfig.token}` },
        body: formData
    });
    
    const data = await response.json();
    // 返回资产路径，如 "assets/xxx-xxx.jpg"
    return data.data.path;
}
```

### LLM 多模态请求格式

QWEN3.5-PLUS（OpenAI兼容格式）的多模态请求：
```javascript
{
    model: "qwen3.5-plus",
    messages: [
        {
            role: "user",
            content: [
                {
                    type: "image_url",
                    image_url: {
                        url: `data:${mimeType};base64,${imageBase64}`
                    }
                },
                {
                    type: "text",
                    text: "请描述这张图片的内容，生成一个简洁的描述（200-300字）。用中文回复。"
                }
            ]
        }
    ]
}
```

## 笔记内容格式

生成的笔记内容：
```markdown
![Image](assets://xxx-xxx.jpg)

{图片描述文本}
```

## 测试验证

1. jpg 图片典藏
2. png 图片典藏
3. LLM 多模态描述准确性
4. 图片上传到思源资产
5. 智能分类准确性

---

设计日期：2026-04-24