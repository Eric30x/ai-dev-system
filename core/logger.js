/**
 * 日志模块 — 同时写入文件和内存
 */

const fs = require("fs-extra");
const path = require("path");
const config = require("../shared/config");

fs.ensureDirSync(config.LOG_DIR);

function _write(logFile, level, context, message) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [${context}] ${message}\n`;
  fs.appendFileSync(logFile, line, "utf-8");
  return line;
}

function info(context, message) {
  return _write(path.join(config.LOG_DIR, "app.log"), "INFO", context, message);
}

function error(context, message) {
  return _write(path.join(config.LOG_DIR, "error.log"), "ERROR", context, message);
}

function taskLog(taskId, message) {
  const taskLogDir = path.join(config.WORKSPACE_DIR, taskId);
  fs.ensureDirSync(taskLogDir);
  return _write(path.join(taskLogDir, "task.log"), "LOG", taskId, message);
}

module.exports = { info, error, taskLog };
