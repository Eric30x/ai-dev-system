/**
 * 任务队列 — 文件系统队列
 * API 入队，Worker 出队
 */

const fs = require("fs-extra");
const path = require("path");
const config = require("../shared/config");

const QUEUE_DIR = path.join(config.QUEUE_DIR, "pending");
const PROCESSING_DIR = path.join(config.QUEUE_DIR, "processing");

fs.ensureDirSync(QUEUE_DIR);
fs.ensureDirSync(PROCESSING_DIR);

/**
 * 入队：创建一个 pending 文件
 */
function enqueue(taskId) {
  const filePath = path.join(QUEUE_DIR, `${taskId}.json`);
  fs.writeJsonSync(filePath, { taskId, enqueuedAt: new Date().toISOString() });
}

/**
 * 出队：移动 pending → processing，返回 taskId
 */
function dequeue() {
  const files = fs.readdirSync(QUEUE_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) return null;

  const file = files[0];
  const src = path.join(QUEUE_DIR, file);
  const dst = path.join(PROCESSING_DIR, file);

  fs.moveSync(src, dst, { overwrite: true });

  const data = fs.readJsonSync(dst);
  return data.taskId;
}

/**
 * 完成：删除 processing 文件
 */
function complete(taskId) {
  const filePath = path.join(PROCESSING_DIR, `${taskId}.json`);
  if (fs.pathExistsSync(filePath)) fs.removeSync(filePath);
}

/**
 * 失败：移回 pending（重试）或标记失败
 */
function requeue(taskId) {
  const filePath = path.join(PROCESSING_DIR, `${taskId}.json`);
  if (fs.pathExistsSync(filePath)) {
    const dst = path.join(QUEUE_DIR, `${taskId}.json`);
    fs.moveSync(filePath, dst, { overwrite: true });
  }
}

/**
 * 获取队列状态
 */
function getStatus() {
  const pending = fs.readdirSync(QUEUE_DIR).filter((f) => f.endsWith(".json")).length;
  const processing = fs.readdirSync(PROCESSING_DIR).filter((f) => f.endsWith(".json")).length;
  return { pending, processing };
}

module.exports = { enqueue, dequeue, complete, requeue, getStatus };
