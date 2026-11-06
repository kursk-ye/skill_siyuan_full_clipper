# 临时图片处理规范实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 imageClipper 增加临时图片路径验证和上传后自动删除功能，确保生产环境（飞书→openclaw→clipper）流程安全可靠。

**Architecture:** 在 config.json 配置临时下载目录，imageClipper.js 验证传入路径是否在该目录内，上传成功后删除临时文件。

**Tech Stack:** Node.js, fs module, path module

---

## 文件结构

| 文件 | 改动类型 | 责任 |
|------|----------|------|
| `config.json` | Modify | 新增 `tempDownloadDir` 配置项 |
| `skill.md` | Modify | 新增"图片典藏"章节，指导 openclaw 行为 |
| `scripts/clipper/imageClipper.js` | Modify | 路径验证 + 上传后删除临时文件 |

---

### Task 1: config.json 新增 tempDownloadDir 配置

**Files:**
- Modify: `config.json`

- [ ] **Step 1: 添加 tempDownloadDir 配置项**

在 config.json 中添加 `tempDownloadDir` 配置：

```json
{
  "siyuan": {
    "api": "http://172.26.11.186:6806",
    "token": "4sqj6ccz5fqginzd"
  },
  "llm": {
    "baseUrl": "https://coding.dashscope.aliyuncs.com/apps/anthropic",
    "apiKey": "sk-sp-ed77aad743f347b8bc56c04bffcc214d",
    "model": "qwen3.5-plus"
  },
  "tempDownloadDir": "/home/openclaw/.openclaw/workspace/knowledge/5_tmpworks"
}
```

- [ ] **Step 2: 验证 JSON 格式正确**

Run: `node -e "console.log(JSON.parse(require('./config.json')))" || node -e "const c = require('./config.json'); console.log(c.tempDownloadDir)"`

Expected: 输出 `/home/openclaw/.openclaw/workspace/knowledge/5_tmpworks`

- [ ] **Step 3: Commit**

```bash
git add config.json
git commit -m "feat: add tempDownloadDir config for openclaw image handling"
```

---

### Task 2: skill.md 新增图片典藏章节

**Files:**
- Modify: `skill.md`

- [ ] **Step 1: 更新 description 描述**

修改 skill.md 头部 description，明确支持图片路径：

```markdown
---
name: siyuan-full-clipper
description: 当用户发送 URL（网页/知乎/公众号/B 站/YouTube/抖音）或本地图片路径，并表达"保存"、"收藏"、"摘录"、"存下来"、"bookmark"、"save"等意图时，执行 `node scripts/clipper.js <URL或图片路径>` 完成自动抓取、摘要、分类和保存。
---
```

- [ ] **Step 2: 更新执行命令**

修改"执行命令"章节：

```markdown
## 执行命令

```bash
node scripts/clipper.js <URL或图片路径>
```

带配置文件：
```bash
node scripts/clipper.js <URL或图片路径> --config ./config.json
```
```

- [ ] **Step 3: 新增图片典藏章节**

在"环境初始化"章节之后添加：

```markdown
## 图片典藏

openclaw 从飞书接收图片时的处理规范：
- **下载目录**：将图片下载到 `tempDownloadDir` 配置的目录（见 config.json）
- **路径传递**：调用 `node scripts/clipper.js <完整图片路径>`，传递绝对路径
- **临时文件**：图片上传思源成功后自动删除，无需保留

**注意**：clipper.js 仅接受位于 `tempDownloadDir` 目录内的图片路径，其他路径将被拒绝处理。
```

- [ ] **Step 4: Commit**

```bash
git add skill.md
git commit -m "docs: add image clipping guide for openclaw in skill.md"
```

---

### Task 3: imageClipper.js 路径验证和删除临时文件

**Files:**
- Modify: `scripts/clipper/imageClipper.js`

- [ ] **Step 1: 在 imageClip 函数开头添加路径验证逻辑**

在 `imageClip` 函数中，验证图片路径前（第 80 行附近）添加：

找到现有代码：
```javascript
    // 1. 验证图片文件存在
    if (!fs.existsSync(imagePath)) {
        throw new Error(`图片文件不存在：${imagePath}`);
    }
```

在其之前插入路径验证：
```javascript
    // 0. 验证图片路径在临时下载目录内
    const tempDownloadDir = config.tempDownloadDir;
    if (!tempDownloadDir) {
        throw new Error('config.json 未配置 tempDownloadDir');
    }

    const resolvedPath = path.resolve(imagePath);
    const resolvedTempDir = path.resolve(tempDownloadDir);
    if (!resolvedPath.startsWith(resolvedTempDir)) {
        throw new Error(`图片路径不在临时下载目录内，拒绝处理：${imagePath}（期望目录：${tempDownloadDir})`);
    }
    console.log(`✅ 路径验证通过：${imagePath}`);

    // 1. 验证图片文件存在
    if (!fs.existsSync(imagePath)) {
        throw new Error(`图片文件不存在：${imagePath}`);
    }
```

- [ ] **Step 2: 在流程末尾添加删除临时文件逻辑**

找到现有代码末尾（第 132-147 行）：
```javascript
        // 9. 清理临时目录
        fs.rmSync(tempDir, { recursive: true, force: true });

        console.log('\n✅ 图片典藏完成！');

        // 10. 返回 ClipperResult
        return {
            success: true,
            docId: noteResult.docId,
            notebook: noteResult.notebook,
            path: noteResult.path,
            markdownPath: tempMdPath
        };
```

修改为：
```javascript
        // 9. 清理临时 Markdown 目录
        fs.rmSync(tempDir, { recursive: true, force: true });

        // 10. 删除临时图片文件（上传成功后）
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log(`🗑️ 临时图片已删除：${imagePath}`);
        }

        console.log('\n✅ 图片典藏完成！');

        // 11. 返回 ClipperResult
        return {
            success: true,
            docId: noteResult.docId,
            notebook: noteResult.notebook,
            path: noteResult.path,
            markdownPath: tempMdPath
        };
```

- [ ] **Step 3: 测试路径验证逻辑（使用测试图片）**

创建测试目录和测试图片：
```bash
mkdir -p /home/openclaw/.openclaw/workspace/knowledge/5_tmpworks 2>/dev/null || mkdir -p /tmp/test_temp_dir
cp /mnt/hgfs/Codespaces/skill_siyuan_full_clipper/output/monitor.png /tmp/test_temp_dir/
```

修改 config.json 临时使用测试目录（测试完后恢复）：
```bash
# 临时修改 config.json 用于测试
node -e "const c = require('./config.json'); c.tempDownloadDir = '/tmp/test_temp_dir'; console.log(JSON.stringify(c, null, 2))" > config.test.json && mv config.test.json config.json
```

Run: `node scripts/clipper.js /tmp/test_temp_dir/monitor.png --config ./config.json`

Expected: 路径验证通过，上传成功，临时图片被删除

- [ ] **Step 4: 测试路径验证拒绝场景**

Run: `node scripts/clipper.js output/monitor.png --config ./config.json`

Expected: 报错 `图片路径不在临时下载目录内，拒绝处理`

- [ ] **Step 5: 恢复 config.json 原配置**

```bash
# 恢复原始配置
node -e "const c = require('./config.json'); c.tempDownloadDir = '/home/openclaw/.openclaw/workspace/knowledge/5_tmpworks'; console.log(JSON.stringify(c, null, 2))" > config.json.tmp && mv config.json.tmp config.json
```

- [ ] **Step 6: Commit**

```bash
git add scripts/clipper/imageClipper.js
git commit -m "feat: add path validation and temp file deletion for imageClipper"
```

---

### Task 4: 验证整体流程

**Files:**
- None (验证测试)

- [ ] **Step 1: 验证 config.json 配置完整性**

Run: `node -e "const c = require('./config.json'); console.log('tempDownloadDir:', c.tempDownloadDir)"`

Expected: 输出 `/home/openclaw/.openclaw/workspace/knowledge/5_tmpworks`

- [ ] **Step 2: 验证 skill.md 文档完整性**

Run: `grep -A 5 "图片典藏" skill.md`

Expected: 输出包含"openclaw 从飞书接收图片时的处理规范"

- [ ] **Step 3: 最终 commit（如果有未提交的更改）**

```bash
git status
git add -A
git commit -m "feat: complete temp image handling implementation"
```

---

## 自检清单

| 检查项 | 状态 |
|--------|------|
| config.json 新增 tempDownloadDir | [ ] |
| skill.md 新增图片典藏章节 | [ ] |
| imageClipper.js 路径验证 | [ ] |
| imageClipper.js 删除临时文件 | [ ] |
| 路径验证测试通过 | [ ] |
| 路径拒绝测试通过 | [ ] |

---
计划日期：2026-04-27