/**
 * 任务存储 — 文件系统 + 内存双写
 * API 和 Worker 通过文件系统共享任务状态
 */

const fs = require("fs-extra");
const path = require("path");
const config = require("../shared/config");
const { timestamp } = require("../shared/utils");

fs.ensureDirSync(config.QUEUE_DIR);

const TASKS_FILE = path.join(config.QUEUE_DIR, "tasks.json");

// 内存缓存
let _cache = {};

function _load() {
  try {
    if (fs.pathExistsSync(TASKS_FILE)) {
      _cache = fs.readJsonSync(TASKS_FILE);
    }
  } catch (e) {
    _cache = {};
  }
}

function _save() {
  fs.writeJsonSync(TASKS_FILE, _cache, { spaces: 0 });
}

// 启动时加载
_load();

function createTask(taskId, description, userId) {
  const task = {
    id: taskId,
    userId: userId || "anonymous",
    description,
    state: "pending",
    progress: 0,
    currentStep: null,
    logs: [],
    createdAt: timestamp(),
    updatedAt: timestamp(),
    downloadUrl: null,
    error: null,
  };
  _cache[taskId] = task;
  _save();
  return task;
}

function getTask(taskId) {
  _load();
  return _cache[taskId] || null;
}

function getAllTasks(userId) {
  _load();
  let list = Object.values(_cache);
  if (userId) list = list.filter((t) => t.userId === userId);
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function updateTask(taskId, updates) {
  _load();
  if (!_cache[taskId]) return null;
  Object.assign(_cache[taskId], updates, { updatedAt: timestamp() });
  _save();
  return _cache[taskId];
}

function addLog(taskId, message) {
  _load();
  if (!_cache[taskId]) return;
  _cache[taskId].logs.push(`[${timestamp()}] ${message}`);
  // 保留最近 200 条
  if (_cache[taskId].logs.length > 200) {
    _cache[taskId].logs = _cache[taskId].logs.slice(-200);
  }
  _save();
}

module.exports = { createTask, getTask, getAllTasks, updateTask, addLog };
