# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

思源智能典藏 (SiYuan Full Clipper) - A skill that automatically clips web content (articles from 知乎/微信公众号/B站/YouTube/抖音/general web pages) and saves it to SiYuan Note with LLM-generated summaries and intelligent categorization.

## Core Commands

```bash
# Run the clipper (main entry point)
node scripts/clipper.js <URL> --config ./config.json

# Run unit tests
node scripts/tests/runAllTests.js

# Run individual tests
node scripts/tests/correctPathByLevels.test.js
node scripts/tests/llmApiFormat.test.js
node scripts/tests/jsonParsing.test.js
node scripts/tests/getNotebookPathTree.test.js

# Build deployment package (outputs to ./build/skill_siyuan_full_clipper)
node build.js

# Export SiYuan notebook categories (generates categories.json)
node scripts/utils/export.js
```

## Prerequisites

- **SiYuan Note** must be running with API accessible at configured endpoint
- **opencli** CLI tool installed (`opencli --version` to verify)
- **config.json** with `siyuan.api`, `siyuan.token`, and `llm.baseUrl`, `llm.apiKey`, `llm.model`

## Architecture

The system follows a pipeline pattern:

```
URL → detectContentType() → *Clip() → download → generateSummary → selectCategory → createNote
```

### Key Modules

| Module | Purpose |
|--------|---------|
| `scripts/clipper.js` | Main dispatcher - parses CLI args, detects URL type, routes to clipper |
| `scripts/clipper/index.js` | Auto-scanner - dynamically exports all `*Clipper.js` modules |
| `scripts/clipper/*Clipper.js` | Content-specific handlers (webClipper, zhihuClipper, wechatClipper, etc.) |
| `scripts/core/opencli-runner.js` | Executes opencli CLI to download web pages as Markdown |
| `scripts/core/llm_engine.js` | LLM integration - generates summaries and selects notebook categories |
| `scripts/core/save_note.js` | SiYuan API integration - creates documents, uploads images, handles paths |

### Data Flow

1. **clipper.js** receives URL, calls `detectContentType(url)` → returns 'web', 'zhihu', 'wechat', 'bilibili', 'youtube', 'douyin'
2. Dispatcher calls `clippers[${type}Clip](url, config)` from auto-scanned modules
3. Clipper creates temp dir, calls `download()` via opencli-runner
4. `generateSummary()` extracts content from Markdown, calls LLM API
5. `selectCategory()` reads `categories.json`, prompts LLM to choose notebook + path
6. `createNote()` uploads images, builds frontmatter, calls SiYuan's `/api/filetree/createDocWithMd`
7. Temp directory cleaned up on completion

### Categories System

`categories.json` is a tree structure representing SiYuan notebook hierarchy with sample notes at leaf nodes. Used by LLM to make intelligent categorization decisions based on article content.

### Auto-Discovery Pattern

New clipper modules are auto-discovered. To add support for a new platform:
- Create `scripts/clipper/${platform}Clipper.js`
- Export a function named `${platform}Clip(url, config)`
- Add detection logic in `clipper.js` `detectContentType()` if URL pattern differs

## Configuration

`config.json` structure:
```json
{
  "siyuan": { "api": "http://siyuanhost:6806", "token": "..." },
  "llm": { "baseUrl": "...", "apiKey": "...", "model": "..." }
}
```

Environment variables override config: `SIYUAN_API`, `SIYUAN_TOKEN`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`

## Testing Philosophy

Tests focus on:
- Path matching/correction logic (LLM may return paths with spacing differences)
- LLM API format parsing (OpenAI-compatible vs Anthropic formats)
- JSON parsing from LLM responses
- Notebook path tree operations

## Dependencies

- `node-fetch` (v3, ESM - uses dynamic import)
- `form-data` (for SiYuan asset upload)
- External: `opencli` CLI, SiYuan Note API, LLM API (OpenRouter/OpenAI-compatible)