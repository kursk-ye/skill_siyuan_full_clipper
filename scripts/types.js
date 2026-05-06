/**
 * @fileoverview 思源智能典藏 - 公共类型定义
 * 所有模块通过 @import 引用此文件的定义
 */

/**
 * @typedef {'web' | 'zhihu' | 'wechat' | 'bilibili' | 'youtube' | 'douyin'} SourceType
 * 内容来源类型
 */

/**
 * @typedef {Object} ClipperConfig
 * @property {Object} siyuan - 思源配置
 * @property {string} siyuan.api - API 端点 (e.g. http://127.0.0.1:6806)
 * @property {string} siyuan.token - API Token
 * @property {Object} llm - LLM 配置
 * @property {string} llm.baseUrl - API 端点
 * @property {string} llm.apiKey - API Key
 * @property {string} llm.model - 模型名称
 * @property {string} [outputDir] - 输出目录
 * @property {string} [categoriesPath] - categories.json 路径
 */

/**
 * @typedef {Object} DownloadResult
 * @property {string} mdPath - Markdown 文件绝对路径
 * @property {string} title - 文章标题
 * @property {string} originalUrl - 原始 URL
 * @property {string | null} publishDate - 发布日期 (YYYY-MM-DD 或 null)
 * @property {SourceType} source - 来源类型
 */

/**
 * @typedef {Object} ClipperResult
 * @property {boolean} success - 是否成功
 * @property {string} [docId] - 文档 ID
 * @property {string} [notebook] - 笔记本名称
 * @property {string} [path] - 分类路径
 * @property {string} [markdownPath] - Markdown 文件路径
 */

/**
 * @typedef {Object} CategoryResult
 * @property {string} notebook - 笔记本名称
 * @property {string} path - 分类路径 (e.g. /技术/编程)
 * @property {string} reason - 选择理由
 */

/**
 * @typedef {Object} SiYuanConfig
 * @property {string} api - API 端点
 * @property {string} token - API Token
 */

/**
 * @typedef {Object} LLMConfig
 * @property {string} baseUrl - API 端点
 * @property {string} apiKey - API Key
 * @property {string} model - 模型名称
 */

module.exports = {};