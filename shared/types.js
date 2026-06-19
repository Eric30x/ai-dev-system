/**
 * 统一类型导出 — 重新导出所有共享常量
 * 注意：shared/types/ 目录下有更完整的类型定义，此处做兼容透传
 */

const typesIndex = require("./types/index");

// 兼容旧的 TASK_STATES 引用
const TASK_STATES = {
  PENDING: "pending",
  RUNNING: "running",
  PLANNING: "planning",
  EXECUTING: "executing",
  VERIFYING: "verifying",
  FIXING: "fixing",
  SUCCESS: "success",
  FAILED: "failed",
};

module.exports = {
  TASK_STATES,
  ...typesIndex,
};
