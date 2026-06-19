/**
 * Progress Tracker — 实时进度追踪
 * 职责：桥接 Controller 状态机与 TaskManager，实时更新任务进度
 */

const taskManager = require("./task-manager");

// 状态 → 进度映射
const STATE_PROGRESS = {
  QUEUED: 0,
  PLANNING: 10,
  EXECUTING: 30,
  FIXING: 50,
  VERIFYING: 75,
  RUNNING: 80,
  SUCCESS: 100,
  FAILED: 100,
};

class ProgressTracker {
  constructor(taskId) {
    this.taskId = taskId;
    this.currentStep = 0;
    this.totalSteps = 0;
  }

  /**
   * 生成 progressCallback 传给 Controller
   */
  createCallback() {
    return (event) => {
      this._handleEvent(event);
    };
  }

  /**
   * 处理 Controller 的状态事件
   */
  _handleEvent(event) {
    const { type } = event;

    switch (type) {
      case "state_change":
        this._onStateChange(event.state, event.reason);
        break;
      case "step_start":
        this._onStepStart(event.step, event.total, event.description);
        break;
      case "step_complete":
        this._onStepComplete(event.step, event.success);
        break;
      case "log":
        taskManager.addLog(this.taskId, event.message);
        break;
    }
  }

  _onStateChange(state, reason) {
    const baseProgress = STATE_PROGRESS[state] || 0;
    taskManager.updateTask(this.taskId, {
      state,
      progress: Math.min(baseProgress, 99),
    });
    taskManager.addLog(this.taskId, `[${state}] ${reason || ""}`);
  }

  _onStepStart(step, total, description) {
    this.currentStep = step;
    this.totalSteps = total;

    const state = taskManager.getTask(this.taskId)?.state || "EXECUTING";
    const baseProgress = STATE_PROGRESS[state] || 30;
    const stepProgress = total > 0 ? (step / total) * 20 : 0;

    taskManager.updateTask(this.taskId, {
      progress: Math.min(Math.round(baseProgress + stepProgress), 99),
      currentStep: `${step}/${total}: ${description}`,
    });
  }

  _onStepComplete(step, success) {
    if (!success) {
      taskManager.addLog(this.taskId, `⚠️ 步骤 ${step} 失败`);
    }
  }
}

module.exports = ProgressTracker;
