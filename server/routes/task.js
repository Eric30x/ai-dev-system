/**
 * 任务 API 路由 V6
 */

const express = require("express");
const router = express.Router();
const taskManager = require("../services/task-manager");
const queue = require("../services/queue");
const { getDownloadPath } = require("../../utils/zipper");
const fs = require("fs");

/**
 * POST /api/task/create
 * 创建新任务
 */
router.post("/create", (req, res) => {
  const { task, userId } = req.body;

  if (!task || typeof task !== "string" || task.trim().length === 0) {
    return res.status(400).json({ error: "请提供 task 描述" });
  }

  const uid = userId || "anonymous";
  const taskRecord = taskManager.createTask(task.trim(), uid);
  queue.enqueue(taskRecord.id);

  res.json({
    taskId: taskRecord.id,
    userId: uid,
    state: taskRecord.state,
    message: "任务已创建，正在排队执行",
  });
});

/**
 * GET /api/task/status/:id
 * 查询任务状态（前端轮询）
 */
router.get("/status/:id", (req, res) => {
  const task = taskManager.getTask(req.params.id);

  if (!task) {
    return res.status(404).json({ error: "任务不存在" });
  }

  res.json({
    id: task.id,
    userId: task.userId,
    description: task.description,
    state: task.state,
    progress: task.progress,
    currentStep: task.currentStep,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    error: task.error,
    downloadUrl: task.state === "SUCCESS" ? task.downloadUrl : null,
    logs: task.logs.slice(-30),
  });
});

/**
 * GET /api/task/result/:id
 * 获取任务结果
 */
router.get("/result/:id", (req, res) => {
  const task = taskManager.getTask(req.params.id);

  if (!task) {
    return res.status(404).json({ error: "任务不存在" });
  }

  res.json({
    id: task.id,
    state: task.state,
    result: task.result,
    downloadUrl: task.downloadUrl,
    outputDir: task.outputDir,
    error: task.error,
  });
});

/**
 * GET /api/tasks
 * 列出所有任务（支持 ?userId= 过滤）
 */
router.get("/", (req, res) => {
  const { userId } = req.query;
  const tasks = taskManager.getAllTasks(userId);
  const queueStatus = queue.getQueueStatus();

  res.json({ tasks, queue: queueStatus });
});

/**
 * GET /api/download/:id
 * 下载生成的项目 zip
 */
router.get("/download/:id", (req, res) => {
  const task = taskManager.getTask(req.params.id);

  if (!task) {
    return res.status(404).json({ error: "任务不存在" });
  }

  if (task.state !== "SUCCESS" || !task.downloadUrl) {
    return res.status(400).json({ error: "项目尚未完成" });
  }

  const zipPath = getDownloadPath(req.params.id);

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: "下载文件不存在" });
  }

  res.download(zipPath, `ai-project-${req.params.id}.zip`);
});

module.exports = router;
