# Architecture

## System Overview

AI Dev Platform is an **autonomous multi-agent code generation system**.

```
┌─────────────────────────────────────────────────┐
│                  Web UI (SPA)                     │
│  TailwindCSS + Monaco Editor + SSE               │
└──────────────────────┬──────────────────────────┘
                       │ REST + SSE
┌──────────────────────▼──────────────────────────┐
│              Express API Gateway                  │
│  JWT Auth • Rate Limit • Stripe Billing          │
│  Routes: auth projects workspace download        │
└──────────────────────┬──────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     ┌────────┐  ┌──────────┐  ┌──────────┐
     │Postgres│  │  Redis   │  │   SSE    │
     │Prisma  │  │  BullMQ  │  │  Manager │
     └────────┘  └────┬─────┘  └──────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│                 Worker Pool                       │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Planner  │→ │ Executor │→ │ Verifier │       │
│  │  (LLM)   │  │ (File+SH)│  │ (npm+chk)│       │
│  └──────────┘  └──────────┘  └─────┬────┘       │
│                                     │            │
│                              ┌──────▼──────┐     │
│                              │   Fixer     │     │
│                              │   (LLM)     │     │
│                              │  ≤ 3 rounds │     │
│                              └──────┬──────┘     │
│                                     │            │
│  ┌──────────┐  ┌──────────┐        │            │
│  │ Artifact │← │   Zip    │←───────┘            │
│  │  System  │  │ Packager │                      │
│  └──────────┘  └──────────┘                      │
└───────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. BullMQ + Redis over raw file queue

Reliable job delivery with exponential backoff, retry limits, and dead letter queue.

### 2. SSE over WebSocket

Server-Sent Events are simpler, use standard HTTP, auto-reconnect natively, and don't require additional infrastructure.

### 3. Monaco over CodeMirror

VS Code's core editor provides superior LSP support, minimap, and ecosystem familiarity.

### 4. Prisma over raw SQL

Type-safe queries, automatic migrations, and IDE autocompletion.

### 5. Agent-per-phase architecture

Planner, Executor, Verifier, Fixer are independent LLM calls with specialized prompts. This is more reliable than a single massive prompt.

## Data Flow

### Task Creation

```
POST /api/create-task
  → Prisma: create Project
  → BullMQ: add job {projectId, type:'generate'}
  → Return taskId
```

### Task Execution

```
Worker dequeue job
  → Prisma: load Project
  → Planner: generate steps (LLM)
  → Executor: create files + run commands
  → Verifier: npm install + checks
  → Fixer (if needed): LLM diagnosis → patch → retry verify
  → Artifact: save source zip + logs + metadata
  → Zip: package final download
  → Prisma: update state → SUCCESS
```

### Real-time Updates

```
Worker → sse.pushLog() → in-memory Map<projectId, Set<response>>
Browser → new EventSource(/api/workspace/:id/stream)
  → connected event
  → log events (info/warn/error)
  → progress events (state, %)
  → fileChange events
```

## Scaling

| Component | Scale Strategy |
|-----------|---------------|
| API | Horizontal (stateless) |
| Worker | Horizontal (BullMQ concurrency) |
| PostgreSQL | Vertical or connection pooling |
| Redis | Single instance (can cluster) |
| SSE | Needs Redis pub/sub for multi-process |
