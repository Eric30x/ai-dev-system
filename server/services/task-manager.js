/**
 * Task Manager V6 — 任务生命周期管理
 * 职责：创建/追踪/查询任务状态，管理 workspace，支持多用户
 */

const crypto = require("crypto");
const path = require("path");
const fs = require("fs-extra");
const { createWorkspace } = require("../../utils/workspace");
const { zipProject } = require("../../utils/zipper");

// 内存中的任务存储
const tasks = new Map();

/**
 * 创建新任务
 */
function createTask(description, userId = "anonymous") {
  const taskId = crypto.randomUUID().slice(0, 8);
  const workspaceDir = createWorkspace(taskId);

  const task = {
    id: taskId,
    userId,
    description,
    state: "QUEUED",
    progress: 0,
    currentStep: null,
    logs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    outputDir: workspaceDir,
    downloadUrl: null,
    error: null,
    result: null,
  };

  tasks.set(taskId, task);
  return task;
}

/**
 * 获取任务
 */
function getTask(taskId) {
  return tasks.get(taskId) || null;
}

/**
 * 获取所有任务（支持按 userId 过滤）
 */
function getAllTasks(userId) {
  let list = Array.from(tasks.values());
  if (userId) list = list.filter((t) => t.userId === userId);

  return list
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((t) => ({
      id: t.id,
      userId: t.userId,
      description: t.description,
      state: t.state,
      progress: t.progress,
      currentStep: t.currentStep,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      downloadUrl: t.state === "SUCCESS" ? t.downloadUrl : null,
      error: t.error,
    }));
}

/**
 * 更新任务状态
 */
function updateTask(taskId, updates) {
  const task = tasks.get(taskId);
  if (!task) return null;

  Object.assign(task, updates, { updatedAt: new Date().toISOString() });
  return task;
}

/**
 * 添加日志
 */
function addLog(taskId, message) {
  const task = tasks.get(taskId);
  if (!task) return;

  const logEntry = `[${new Date().toISOString()}] ${message}`;
  task.logs.push(logEntry);

  // 同时写入文件
  const logFile = path.join(task.outputDir, "task.log");
  fs.appendFileSync(logFile, logEntry + "\n", "utf-8");
}

/**
 * 任务完成后打包
 */
async function packageTask(taskId) {
  const task = tasks.get(taskId);
  if (!task) return null;

  try {
    const result = await zipProject(task.outputDir, taskId);
    const baseUrl = process.env.BASE_URL || "";
    const downloadUrl = `${baseUrl}/api/download/${taskId}`;
    updateTask(taskId, { downloadUrl });
    return { downloadUrl, ...result };
  } catch (err) {
    addLog(taskId, `打包失败: ${err.message}`);
    return null;
  }
}

module.exports = {
  createTask,
  getTask,
  getAllTasks,
  updateTask,
  addLog,
  packageTask,
};
