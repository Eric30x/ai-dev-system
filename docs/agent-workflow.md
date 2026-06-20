# Agent Workflow

## Pipeline Overview

Every project generation follows a fixed 6-phase pipeline:

```
User Prompt → Planner → Executor → Verifier → Fixer → Artifact → Download
```

## Phase 1: Planner

**File**: `workers/planner/index.js`

The Planner sends the user's natural language description to the LLM with a structured prompt asking for a JSON array of steps.

**Input**:
```
"Create a REST API with Express and PostgreSQL"
```

**LLM Prompt**:
```
你是一个软件开发规划器。将用户的任务分解为 JSON 步骤数组。

每个步骤格式：
- action: "create_file" | "edit_file" | "run_command" | "done"
- target: 文件路径或命令
- content: 文件内容（create/edit 时）
- description: 中文说明
```

**Output** (JSON):
```json
[
  {"action":"create_file","target":"package.json","content":"{...}","description":"创建 package.json"},
  {"action":"create_file","target":"server.js","content":"const express...","description":"创建服务器入口"},
  {"action":"run_command","target":"npm install","content":"","description":"安装依赖"},
  {"action":"done","target":"","content":"","description":"完成"}
]
```

## Phase 2: Executor

**File**: `workers/executor/index.js`

Executes each step sequentially. Supports three actions:

| Action | Behavior |
|--------|----------|
| `create_file` | Write content to `outputDir/target` (create parent dirs) |
| `edit_file` | Overwrite existing file with new content |
| `run_command` | Execute shell command with platform detection |
| `done` | Mark pipeline complete |

**Platform Adaptation**:
- `chmod`/`chown` → skipped on Windows
- `rm -rf` → `rmdir /s /q` on Windows
- `cat` → `type` on Windows
- `ls` → `dir` on Windows

## Phase 3: Verifier

**File**: `workers/worker-core/index.js` (lines 185-233)

Runs 4 checks:

1. **npm install** — install dependencies
2. **Entry file check** — verify `server.js`/`index.js`/`app.js` exists
3. **package.json validation** — ensure `scripts.start` exists
4. **Syntax check** — `require()` each JS file looking for missing modules

**Output**: `{ passed: boolean, issues: string[] }`

## Phase 4: AI Fixer

**File**: `workers/fixer/index.js`

Triggered when `verifier.verify().passed === false`. Up to 3 rounds.

### How it works (LLM-powered, not rule-based)

1. **Collect context**: error messages + file tree + full content of up to 10 key files
2. **Build prompt**: "你是一个专家级全栈 Debug 工程师"
3. **LLM returns JSON**:
```json
{
  "diagnosis": "项目缺少 node_modules 目录，Express 依赖未安装",
  "files": [
    {"path": "server.js", "reason": "修正端口绑定", "content": "const port = process.env.PORT || 3000;"}
  ],
  "commands": ["npm install"],
  "summary": "安装依赖并修正端口配置"
}
```
4. **Apply**: execute commands → write files → re-verify

## Phase 5: Artifact System

**File**: `services/project/artifact.js`

Auto-saves on every completed build:
- `v{N}-source.zip` — complete source code
- `v{N}-logs.txt` — structured execution logs
- `v{N}-metadata.json` — version info + model + timestamps

## Phase 6: Package & Download

Generates final ZIP in `downloads/{projectId}.zip`. URL returned to user.

## Project Agent (Chat-based modification)

**File**: `services/project/agent.js`

Separate from the pipeline. User can chat with AI to modify an existing project:

```
User: "Add JWT authentication middleware"
  → Agent reads file tree + key files
  → LLM generates patches
  → Writes files to disk
  → Syncs file tree
  → Returns modifiedFiles[]
```

**API**: `POST /api/workspace/:id/agent`
