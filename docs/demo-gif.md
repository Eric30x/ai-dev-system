# Demo GIF / Video 制作方案

## Recommended Tool

- **Screen Studio** (macOS) or **OBS Studio** (cross-platform)
- Output: 1080p, 30fps, GIF ≤ 10MB or MP4 with autoplay

## GIF 1: Hero Loop (8 seconds)

**Script:**
1. Open `http://localhost:3000`
2. Pan over Hero section: logo, "Build apps with AI", stats
3. Scroll to Template Gallery: 6 bento cards
4. Scroll to Projects: cards with progress bars

**File**: `docs/assets/demo-hero.gif`

## GIF 2: Build Flow (20 seconds)

**Script:**
1. Click "SaaS Dashboard" quick prompt
2. Type: `"Create an Express API with JWT authentication"`
3. Click "Generate"
4. Show progress: Planning → Executing → Verifying → Fixing → Success
5. Terminal logs scrolling in real time
6. Download button appears

**File**: `docs/assets/demo-build.gif`

## GIF 3: Monaco Workspace (15 seconds)

**Script:**
1. Click a completed project → Workspace opens
2. Open `server.js` in file tree
3. Show Monaco Editor: syntax highlighting, minimap, line numbers
4. Edit a line, press Ctrl+S → "Saved" indicator
5. Open Chat panel, type: "Add /health endpoint"
6. Agent replies with modified file tag
7. Click file tag → updated code in editor

**File**: `docs/assets/demo-workspace.gif`

## GIF 4: Version Rollback (12 seconds)

**Script:**
1. Click "Versions" button in workspace
2. Show version history modal: v3, v2, v1 with artifact types
3. Click "Rollback" on v1
4. Confirm dialog
5. File tree refreshes → project restored to v1
6. Terminal: "Rollback complete"

**File**: `docs/assets/demo-rollback.gif`

## Placement

Add to README.md after the hero section:

```markdown
## Watch it in action

| Build Flow | Monaco Workspace | Version Rollback |
|-----------|-----------------|------------------|
| ![Build](docs/assets/demo-build.gif) | ![Workspace](docs/assets/demo-workspace.gif) | ![Rollback](docs/assets/demo-rollback.gif) |
```
