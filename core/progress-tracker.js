/**
 * 进度追踪器 — 更新任务状态到 task-store
 */

const taskStore = require("../queue/task-store");
const logger = require("./logger");

class ProgressTracker {
  constructor(taskId) {
    this.taskId = taskId;
  }

  update(state, progress, currentStep, logMessage) {
    const updates = { state, progress };
    if (currentStep) updates.currentStep = currentStep;
    taskStore.updateTask(this.taskId, updates);

    if (logMessage) {
      taskStore.addLog(this.taskId, logMessage);
      logger.taskLog(this.taskId, logMessage);
    }
  }

  log(message) {
    taskStore.addLog(this.taskId, message);
    logger.taskLog(this.taskId, message);
  }
}

module.exports = ProgressTracker;
