# Database Schema

## ERD

```
User 1──N ApiKey
User 1──N Project
User 1──N Usage
User 1──N Conversation

Project 1──1 Workspace
Project 1──N Task
Project 1──N LogEntry
Project 1──N Conversation
Project 1──N Artifact
Project 1──N Deployment

Conversation 1──N Message
```

## Models

### User
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | Primary key |
| email | String | Unique |
| passwordHash | String | bcrypt, 12 rounds |
| name | String? | Display name |
| plan | Plan enum | FREE / PRO / ENTERPRISE |

### Project
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| userId | String | FK → User |
| name | String | Auto-generated |
| description | String | User's task description |
| state | ProjectState | PENDING→PLANNING→EXECUTING→VERIFYING→FIXING→SUCCESS/FAILED |
| progress | Int | 0-100 |
| downloadUrl | String? | Final ZIP URL |

### Workspace (V10)
| Field | Type | Notes |
|-------|------|-------|
| projectId | String | Unique FK → Project |
| fileTree | Json | `{ path: { type, content, size } }` |
| metadata | Json | `{ techStack, dependencies, uiStyle }` |

### Conversation + Message (V10)
Chat history for project-level AI conversations. Messages have `role` (user/assistant/system) and optional `metadata` for tool calls.

### Artifact (V10.4)
Versioned snapshots of generated projects. Each artifact has a `version` number, `type` (source/zip/log/readme), disk `path`, and `size`.

### Deployment (V10)
Future: one-click deploy records. Fields: platform (vercel/railway/docker), status (pending/deploying/live/failed), url.

## Enums

```prisma
enum Plan { FREE, PRO, ENTERPRISE }
enum ProjectState { PENDING, PLANNING, EXECUTING, VERIFYING, FIXING, SUCCESS, FAILED }
```

## Migrations

```bash
npm run db:generate   # Generate Prisma Client from schema
npm run db:push       # Push schema to database (dev)
npm run db:migrate    # Create migration (production)
```
