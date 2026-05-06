/**
 * core/index.js
 *
 * 统一导出核心工具模块
 */

const {
    generateSummary,
    selectCategory,
    formatCategoriesForLLM,
    callLLMAPI,
    buildSummaryPrompt,
    buildCategoryPrompt
} = require('./llm_engine');

const { createNote } = require('./save_note');

const {
    buildCommand,
    download,
    extractMetadata
} = require('./opencli-runner');

module.exports = {
    // LLM 引擎
    generateSummary,
    selectCategory,
    formatCategoriesForLLM,
    callLLMAPI,
    buildSummaryPrompt,
    buildCategoryPrompt,
    // 思源笔记
    createNote,
    // opencli 下载工具
    buildCommand,
    download,
    extractMetadata
};
