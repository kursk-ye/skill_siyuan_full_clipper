---
name: siyuan-full-clipper
description: 当用户发送 URL（网页/知乎/公众号/B 站/YouTube/抖音）或本地图片路径，并表达"保存"、"收藏"、"摘录"、"存下来"、"bookmark"、"save"等意图时，执行 `node scripts/clipper.js <URL或图片路径>` 完成自动抓取、摘要、分类和保存。
---

# 思源智能典藏技能

## 何时触发

同时满足以下条件时执行：
1. **包含 URL**：网页/知乎/微信公众号/B 站/YouTube/抖音/图片链接
2. **保存意图**：包含"保存"、"收藏"、"典藏"、"存下来"、"记下来"、"摘录"、"backup"、"save"、"bookmark"等关键词

## 执行命令

```bash
node scripts/clipper.js <URL或图片路径>
```

带配置文件：
```bash
node scripts/clipper.js <URL或图片路径> --config ./config.json
```

## 前置检查

执行前确认：
- [ ] `config.json` 已配置 `siyuan.api` 和 `siyuan.token`
- [ ] `opencli` 已安装（执行 `opencli --version` 验证）
- [ ] 思源笔记正在运行
- [ ] `categories.json` 已存在（思源笔记本目录结构）
       → 如不存在，执行：`node scripts/utils/export.js` 导出笔记本目录
- [ ] `scripts/.setup_done` 文件存在（表示定时任务已设置）
       → 如不存在，执行：`chmod +x scripts/setup_cron.sh && ./scripts/setup_cron.sh`

## 环境初始化

首次部署时执行：

```bash
# 1. 安装依赖
npm install

# 2. 设置定时任务（Linux/Orange Pi）
chmod +x scripts/setup_cron.sh && ./scripts/setup_cron.sh
```

## 图片典藏

openclaw 从飞书接收图片时的处理规范：
- **下载目录**：将图片下载到 `tempDownloadDir` 配置的目录（见 config.json）
- **路径传递**：调用 `node scripts/clipper.js <完整图片路径>`，传递绝对路径
- **临时文件**：图片上传思源成功后自动删除，无需保留

**注意**：clipper.js 仅接受位于 `tempDownloadDir` 目录内的图片路径，其他路径将被拒绝处理。

