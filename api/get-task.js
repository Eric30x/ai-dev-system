/**
 * GET /api/get-task?id=xxx
 * 查询任务状态
 */

const taskStore = require("../queue/task-store");

module.exports = (req, res) => {
  const taskId = req.query.id;

  if (!taskId) {
    // 返回所有任务
    const userId = req.query.userId;
    const tasks = taskStore.getAllTasks(userId);
    return res.json({ tasks });
  }

  const task = taskStore.getTask(taskId);

  if (!task) {
    return res.status(404).json({ error: "任务不存在" });
  }

  res.json(task);
};
