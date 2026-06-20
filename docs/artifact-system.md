# Artifact System (V10.4)

## Overview

Every completed build automatically generates versioned artifacts — full snapshots of the generated project at that point in time.

## Schema

```prisma
model Artifact {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id])
  version   Int      @default(1)
  type      String   @default("zip")   // "zip" | "readme" | "source" | "log"
  path      String                      // file path on disk
  size      Int      @default(0)        // bytes
  metadata  Json?
  createdAt DateTime @default(now())
}
```

## Artifact Types

| Type | Description | Example |
|------|-------------|---------|
| `source` | Complete source code as ZIP | `v1-source.zip` |
| `log` | Execution logs as text | `v1-logs.txt` |
| `zip` | Final download package | `v1-final.zip` |
| `readme` | Project README | `v1-README.md` |

## Storage

Artifacts are stored on disk under the project workspace:

```
workspaces/{projectId}/.artifacts/
├── v1-source.zip       # 8.4 KB
├── v1-logs.txt         # 2.5 KB
├── v1-metadata.json    # 169 B
├── v2-source.zip       # 12.1 KB
├── v2-logs.txt         # 3.1 KB
└── v2-metadata.json    # 172 B
```

## Metadata Format

```json
{
  "version": 1,
  "timestamp": "2026-06-20T12:48:17.139Z",
  "nodeVersion": "v20.20.2",
  "modelName": "deepseek-v4-pro",
  "taskType": "generate",
  "planSteps": 4
}
```

## API

### List Versions
```
GET /api/projects/:id/artifacts
Authorization: Bearer <token>

Response:
{
  "versions": [{
    "version": 1,
    "createdAt": "2026-06-20T12:48:17.140Z",
    "metadata": { ... },
    "items": [
      {"id": "xxx", "type": "source", "size": 8403},
      {"id": "yyy", "type": "log", "size": 2678}
    ]
  }]
}
```

### Download Artifact
```
GET /api/projects/:id/artifact-download?artifactId=xxx
Authorization: Bearer <token>

Response: binary ZIP file (Content-Type: application/zip)
```

### Rollback
```
POST /api/projects/:id/rollback
Authorization: Bearer <token>
Body: { "version": 1 }

Response:
{
  "rolledBackTo": 1,
  "message": "已回滚到版本 v1"
}
```

The rollback process:
1. Finds the `source` artifact for the target version
2. Backs up the current state as a new version
3. Extracts the source ZIP into the workspace directory
4. Preserves `.artifacts/` and `node_modules/`
