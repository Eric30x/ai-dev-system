/**
 * POST /api/create-task
 * 创建任务并入队
 */

const taskStore = require("../queue/task-store");
const taskQueue = require("../queue/task-queue");
const { generateId } = require("../shared/utils");

module.exports = (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { task, userId } = req.body;

  if (!task || typeof task !== "string" || task.trim().length === 0) {
    return res.status(400).json({ error: "请提供 task 描述" });
  }

  const taskId = generateId();
  const uid = userId || "anonymous";

  // 创建任务记录
  taskStore.createTask(taskId, task.trim(), uid);

  // 入队
  taskQueue.enqueue(taskId);

  res.json({
    taskId,
    userId: uid,
    state: "pending",
    message: "任务已创建，等待执行",
  });
};
