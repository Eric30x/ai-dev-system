/**
 * Project Routes — 项目 CRUD + 任务创建
 */

const { Router } = require("express");
const { requireAuth } = require("../../../services/auth/middleware");
const projectService = require("../../../services/project/service");
const billingService = require("../../../services/billing/stripe");
const { addTask } = require("../../../services/queue/bullmq");
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

module.exports = router;
