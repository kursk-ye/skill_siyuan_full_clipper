# 临时图片处理规范设计

## 背景

生产环境下，用户通过飞书将图片传给 openclaw，openclaw 下载图片后自动调用 clipper.js 处理。需要确保：
1. 图片下载到指定临时目录
2. clipper.js 验证传入路径是否合法
3. 上传成功后自动删除临时图片

## 设计方案

### 1. config.json 新增配置

```json
{
  "siyuan": { "api": "...", "token": "..." },
  "llm": { "baseUrl": "...", "apiKey": "...", "model": "..." },
  "tempDownloadDir": "/home/openclaw/.openclaw/workspace/knowledge/5_tmpworks"
}
```

配置项说明：
- `tempDownloadDir`：openclaw 下载图片的临时目录，clipper.js 用于验证路径合法性

### 2. skill.md 更新

新增 openclaw 图片处理指导：

```markdown
## 图片典藏

openclaw 从飞书接收图片时的处理规范：
- **下载目录**：将图片下载到 `tempDownloadDir` 配置的目录
- **路径传递**：调用 `node scripts/clipper.js <完整图片路径>`，传递绝对路径
- **临时文件**：图片上传思源成功后自动删除，无需保留
```

执行命令做修改

```markdown
node scripts/clipper.js <URL> or <imagepath>
```

### 3. imageClipper.js 改动

#### 3.1 路径验证

```javascript
// 获取临时下载目录配置
const tempDownloadDir = config.tempDownloadDir;

if (!tempDownloadDir) {
    throw new Error('config.json 未配置 tempDownloadDir');
}

// 验证路径在临时目录内（防止处理非预期路径的文件）
const resolvedPath = path.resolve(imagePath);
const resolvedTempDir = path.resolve(tempDownloadDir);

if (!resolvedPath.startsWith(resolvedTempDir)) {
    throw new Error(`图片路径不在临时下载目录内，拒绝处理：${imagePath}`);
}
```

#### 3.2 上传后删除临时文件

```javascript
// 在流程末尾，上传成功后删除临时文件
try {
    // ... 上传思源、生成描述、创建笔记 ...

    // 删除临时图片文件
    if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log(`🗑️ 临时图片已删除：${imagePath}`);
    }
} catch (err) {
    // 失败时不删除文件，保留供排查
    throw err;
}
```

## 数据流

```
飞书图片 → openclaw → 下载到 tempDownloadDir → 调用 clipper.js <绝对路径>
    ↓
clipper.js:
    1. 验证路径在 tempDownloadDir 内（不在则拒绝）
    2. 上传图片到思源资产
    3. LLM 生成描述
    4. 智能分类
    5. 创建笔记
    6. 删除临时图片文件
    7. 返回结果
```

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `config.json` | 新增 `tempDownloadDir` 配置项 |
| `skill.md` | 新增"图片典藏"章节，指导 openclaw 行为规范 |
| `scripts/clipper/imageClipper.js` | 1) 路径验证逻辑；2) 上传后删除临时文件 |

## 错误处理原则

| 场景 | 处理方式 |
|------|----------|
| `tempDownloadDir` 未配置 | 抛出错误，拒绝处理 |
| 图片路径不在临时目录 | 抛出错误，拒绝处理 |
| 上传思源失败 | 不删除临时文件，保留供排查 |
| 上传成功 | 删除临时图片文件 |

## 测试验证

1. 正常流程：图片在临时目录内，上传成功后文件被删除
2. 路径验证：图片不在临时目录，拒绝处理并报错
3. 配置缺失：`tempDownloadDir` 未配置，拒绝处理并报错
4. 上传失败：临时文件保留，不删除

---
设计日期：2026-04-27