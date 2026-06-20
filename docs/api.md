# API Reference

Base URL: `http://localhost:3000`

## Authentication

Most endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

Obtain a token via `/api/auth/login`.

API Keys can also be used via the `X-API-Key` header.

---

## Auth

### Register
```
POST /api/auth/register
Body: { "email": "user@example.com", "password": "secret", "name": "User" }
Response: { "user": { "id", "email", "name", "plan" } }
```

### Login
```
POST /api/auth/login
Body: { "email": "user@example.com", "password": "secret" }
Response: { "token": "eyJ...", "user": { ... } }
```

---

## Projects

### Create & Enqueue
```
POST /api/projects
Auth: JWT
Body: { "name": "my-app", "description": "Build a REST API..." }
Response: { "project": { "id", "state": "PENDING", ... } }
```

The project is immediately created in the database and a BullMQ job is enqueued. The Worker picks it up asynchronously.

### List Projects
```
GET /api/projects
Auth: JWT
Response: { "projects": [ ... ] }
```

### Get Project
```
GET /api/projects/:id
Auth: JWT
Response: { "project": { "id", "state", "progress", "logs": [...], ... } }
```

### Get Logs
```
GET /api/projects/:id/logs?limit=100
Auth: JWT
Response: { "logs": [ { "level", "message", "createdAt" }, ... ] }
```

### Download Final ZIP
```
GET /api/projects/:id/download
Auth: JWT
Response: Binary ZIP (Content-Disposition: attachment)
```

---

## Workspace (V10)

### File Tree
```
GET /api/workspace/:id/files
Response: { "tree": { "path/to/file.js": { "type":"file","content":"...","size":123 } } }
```

### Read File
```
GET /api/workspace/:id/file?path=server.js
Response: { "path": "server.js", "content": "const express = ..." }
```

### Write File
```
PUT /api/workspace/:id/files
Body: { "path": "server.js", "content": "const express = ..." }
Response: { "path": "server.js", "size": 255 }
```

### SSE Stream
```
GET /api/workspace/:id/stream
Response: text/event-stream

Events:
  event: connected    data: {"status":"ok"}
  event: log          data: {"level":"info","message":"..."}
  event: progress     data: {"state":"executing","progress":55}
  event: fileChange   data: {"action":"update","path":"server.js"}
```

### AI Chat
```
POST /api/workspace/:id/chat
Body: { "message": "What does this project do?" }
Response: { "conversationId": "...", "reply": { "role":"assistant","content":"..." } }
```

### AI Agent (modifies files)
```
POST /api/workspace/:id/agent
Body: { "message": "Add JWT middleware to the auth routes" }
Response: {
  "modifiedFiles": ["middleware/jwt.js", "routes/auth.js"],
  "logs": ["🔍 分析项目结构...", "✅ 已写入: middleware/jwt.js"],
  "summary": "Added JWT authentication middleware"
}
```

---

## Artifacts (V10.4)

### List Versions
```
GET /api/projects/:id/artifacts
Auth: JWT
Response: { "versions": [{"version":1,"items":[...],"createdAt":"..."}] }
```

### Download Artifact
```
GET /api/projects/:id/artifact-download?artifactId=xxx
Auth: JWT
Response: Binary ZIP
```

### Rollback
```
POST /api/projects/:id/rollback
Auth: JWT
Body: { "version": 1 }
Response: { "rolledBackTo": 1, "message": "已回滚到版本 v1" }
```

### Compare Versions
```
GET /api/projects/:id/artifacts/compare?v1=1&v2=2
Auth: JWT
Response: { "version1": {...}, "version2": {...}, "diff": "..." }
```

---

## Billing

### Create Checkout (Stripe)
```
POST /api/billing/checkout
Auth: JWT
Response: { "url": "https://checkout.stripe.com/..." }
```

### View Usage
```
GET /api/billing/usage
Auth: JWT
Response: { "allowed": true, "used": 3, "limit": 5 }
```

---

## Health

```
GET /api/health
Response: { "status": "ok", "version": "9.0.0", "timestamp": "..." }
```
