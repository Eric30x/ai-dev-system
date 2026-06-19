/**
 * Workspace 管理模块
 * 职责：为每个任务创建隔离的工作目录
 */

const path = require("path");
const fs = require("fs-extra");

const WORKSPACES_DIR = path.join(__dirname, "..", "workspaces");

/**
 * 为任务创建独立 workspace
 * @param {string} taskId
 * @returns {string} workspace 路径
 */
function createWorkspace(taskId) {
  const wsPath = path.join(WORKSPACES_DIR, taskId);
  fs.ensureDirSync(wsPath);
  return wsPath;
}

/**
 * 获取 workspace 路径
 */
function getWorkspacePath(taskId) {
  return path.join(WORKSPACES_DIR, taskId);
}

/**
 * 删除 workspace
 */
function removeWorkspace(taskId) {
  const wsPath = path.join(WORKSPACES_DIR, taskId);
  fs.removeSync(wsPath);
}

/**
 * 列出所有 workspace
 */
function listWorkspaces() {
  if (!fs.pathExistsSync(WORKSPACES_DIR)) return [];
  return fs.readdirSync(WORKSPACES_DIR).filter((name) => {
    return fs.statSync(path.join(WORKSPACES_DIR, name)).isDirectory();
  });
}

module.exports = { createWorkspace, getWorkspacePath, removeWorkspace, listWorkspaces, WORKSPACES_DIR };
