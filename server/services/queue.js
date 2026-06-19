/**
 * 任务队列 V6 — 异步执行引擎
 * 职责：异步运行任务，集成 ProgressTracker 实时进度
 */

const Controller = require("../../controller");
const taskManager = require("./task-manager");
const ProgressTracker = require("./progress-tracker");

// 等待队列
const queue = [];
// 正在执行的任务
const running = new Set();
const MAX_CONCURRENT = 3;

/**
 * 提交任务到队列
 */
function enqueue(taskId) {
  queue.push(taskId);
  taskManager.addLog(taskId, "📥 任务已加入队列");
  _processNext();
}

/**
 * 处理队列中的下一个任务
 */
async function _processNext() {
  if (running.size >= MAX_CONCURRENT) return;
  if (queue.length === 0) return;

  const taskId = queue.shift();
  running.add(taskId);

  try {
    await _executeTask(taskId);
  } finally {
    running.delete(taskId);
    _processNext();
  }
}

/**
 * 执行单个任务
 */
async function _executeTask(taskId) {
  const task = taskManager.getTask(taskId);
  if (!task) return;

  taskManager.updateTask(taskId, { state: "PLANNING", progress: 5 });
  taskManager.addLog(taskId, `🚀 任务开始执行: ${task.description}`);

  try {
    // 创建进度追踪器
    const tracker = new ProgressTracker(taskId);
    const progressCallback = tracker.createCallback();

    // 创建 Controller，传入 workspace + progressCallback
    const controller = new Controller(task.outputDir, progressCallback);

    const result = await controller.run(task.description);

    if (result.verified) {
      taskManager.updateTask(taskId, {
        state: "SUCCESS",
        progress: 100,
        currentStep: "完成",
        result: result.summary,
      });
      taskManager.addLog(taskId, "🎉 任务成功完成！项目已验证可运行");

      // 打包项目
      const pkg = await taskManager.packageTask(taskId);
      if (pkg) {
        taskManager.addLog(taskId, `📦 项目已打包: ${pkg.filename} (${Math.round(pkg.size / 1024)}KB)`);
      }
    } else {
      taskManager.updateTask(taskId, {
        state: "FAILED",
        progress: 100,
        currentStep: "失败",
        result: result.summary,
        error: result.error || "项目验证未通过",
      });
      taskManager.addLog(taskId, "❌ 任务失败: 验证未通过");
    }
  } catch (err) {
    taskManager.updateTask(taskId, {
      state: "FAILED",
      progress: 100,
      currentStep: "异常",
      error: err.message,
    });
    taskManager.addLog(taskId, `💥 任务异常: ${err.message}`);
  }
}

/**
 * 获取队列状态
 */
function getQueueStatus() {
  return {
    queued: queue.length,
    running: running.size,
    maxConcurrent: MAX_CONCURRENT,
  };
}

module.exports = { enqueue, getQueueStatus };
