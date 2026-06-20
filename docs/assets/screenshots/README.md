# Screenshots

Replace these placeholders with actual screenshots of the running application.

## Required Screenshots

| File | Page | What to capture |
|------|------|-----------------|
| `dashboard.png` | http://localhost:3000 | Hero section + stats + template gallery + project cards |
| `task-running.png` | Dashboard during a task | Progress bar at 50-75%, terminal logs scrolling |
| `workspace.png` | http://localhost:3000/workspace?id=xxx | Monaco editor with file tree + chat + terminal |
| `versions.png` | Workspace → Versions modal | Version history list with download/rollback buttons |
| `agent.png` | Workspace chat after Agent request | Chat showing modifiedFiles + clickable file tags |

## How to capture

1. Start the app: `npm start` + `npm run worker`
2. Open http://localhost:3000 in Chrome
3. Use Chrome DevTools → Device Toolbar → Capture screenshot (full size)
4. Save to `docs/assets/screenshots/`
