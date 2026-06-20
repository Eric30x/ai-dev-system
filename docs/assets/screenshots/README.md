# Screenshots

Replace with actual captures from `http://localhost:3000`.

## Files needed

| File | Page | What to capture | Size |
|------|------|-----------------|------|
| `dashboard.png` | `/` | Hero + Stats + Templates + Project Cards | 1440×900 |
| `workspace.png` | `/workspace?id=xxx` | Monaco Editor + File Tree + Chat + Terminal | 1440×900 |
| `versions.png` | Workspace → Versions modal | Version list with Download/Rollback buttons | 800×600 |
| `agent.png` | Workspace Chat after Agent | Message showing modifiedFiles tags | 800×600 |

## Quick capture

```bash
# Use Chrome DevTools
# 1. Open page
# 2. F12 → Device Toolbar (Ctrl+Shift+M)
# 3. Set to 1440×900
# 4. Three-dot menu → Capture screenshot (full size)
```

## For social preview

`docs/assets/social-preview.svg` — already designed. GitHub uses 1280×640 PNG. Convert:

```bash
# On macOS
qlmanage -t -s 1280 -o . docs/assets/social-preview.svg
# Or use any SVG→PNG converter
```
