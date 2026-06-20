/**
 * Project Routes — 项目 CRUD + 任务创建
 */

const { Router } = require("express");
const { requireAuth } = require("../../../services/auth/middleware");
const projectService = require("../../../services/project/service");
const billingService = require("../../../services/billing/stripe");
const { addTask } = require("../../../services/queue/bullmq");
const artifactService = require("../../../services/project/artifact");
const path = require("path");
const fs = require("fs");
const config = require("../../../shared/config");

const router = Router();

// 创建项目
router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!description) return res.status(400).json({ error: "请提供项目描述" });

    // 检查配额
    const quota = await billingService.checkQuota(req.user.userId);
    if (!quota.allowed) {
      return res.status(429).json({ error: quota.reason, used: quota.used, limit: quota.limit });
    }

    const project = await projectService.createProject(req.user.userId, name, description);

    // 入队
    await addTask(project.id, "generate", { projectId: project.id });

    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 项目列表
router.get("/", requireAuth, async (req, res) => {
  const projects = await projectService.listProjects(req.user.userId);
  res.json({ projects });
});

// 项目详情
router.get("/:id", requireAuth, async (req, res) => {
  const project = await projectService.getProject(req.params.id, req.user.userId);
  if (!project) return res.status(404).json({ error: "项目不存在" });
  res.json({ project });
});

// 项目日志
router.get("/:id/logs", requireAuth, async (req, res) => {
  const logs = await projectService.getLogs(req.params.id, parseInt(req.query.limit) || 100);
  res.json({ logs });
});

// 下载
router.get("/:id/download", requireAuth, async (req, res) => {
  const project = await projectService.getProject(req.params.id, req.user.userId);
  if (!project) return res.status(404).json({ error: "项目不存在" });
  if (project.state !== "SUCCESS") return res.status(400).json({ error: "项目尚未完成" });

  const zipPath = path.join(config.DOWNLOADS_DIR, `${project.id}.zip`);
  if (!fs.existsSync(zipPath)) return res.status(404).json({ error: "文件不存在" });

  res.download(zipPath, `${project.name}.zip`);
});

// ═══ V10.4 Artifact 版本管理 ═══

// 列出所有版本
router.get("/:id/artifacts", requireAuth, async (req, res) => {
  try {
    const versions = await artifactService.listArtifacts(req.params.id);
    res.json({ versions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 下载指定 Artifact（?artifactId=xxx 方式）
router.get("/:id/artifact-download", requireAuth, async (req, res) => {
  try {
    const artifactId = req.query.artifactId;
    if (!artifactId) return res.status(400).json({ error: "请提供 artifactId 参数" });
    const artifact = await artifactService.getArtifact(artifactId);
    if (!artifact) return res.status(404).json({ error: "Artifact 不存在" });

    const pathMod = require("path");
    const fsMod = require("fs");

    // 从 artifact.path 提取文件名，重建绝对路径
    const fileName = pathMod.basename((artifact.path || "").replace(/\\/g, "/"));
    const projectRoot = pathMod.resolve(__dirname, "../../..");
    const absPath = pathMod.join(projectRoot, "workspaces", req.params.id, ".artifacts", fileName);

    if (!fsMod.existsSync(absPath)) {
      return res.status(404).json({ error: "文件不存在" });
    }

    // Express 5 res.download 在 Windows 点目录路径有问题，手动 pipe
    const stat = fsMod.statSync(absPath);
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Length": stat.size,
      "Content-Disposition": "attachment; filename=\"" + fileName + "\"",
    });
    fsMod.createReadStream(absPath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 回滚到指定版本
router.post("/:id/rollback", requireAuth, async (req, res) => {
  try {
    const { version } = req.body;
    if (!version) return res.status(400).json({ error: "请提供 version" });
    const result = await artifactService.rollback(req.params.id, parseInt(version));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 版本比较
router.get("/:id/artifacts/compare", requireAuth, async (req, res) => {
  try {
    const { v1, v2 } = req.query;
    if (!v1 || !v2) return res.status(400).json({ error: "请提供 v1 和 v2 参数" });
    const diff = await artifactService.compareVersions(req.params.id, parseInt(v1), parseInt(v2));
    res.json(diff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
