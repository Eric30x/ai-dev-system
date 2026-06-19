/**
 * 错误日志模块
 * 职责：捕获、记录、解析所有系统错误
 */

const fs = require("fs-extra");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "error.log");

// 确保日志目录存在
fs.ensureDirSync(LOG_DIR);

/**
 * 记录一条错误日志
 */
function logError(context, error) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    context,
    message: error.message || String(error),
    stack: error.stack || null,
  };

  const line =
    `[${timestamp}] [${context}] ${entry.message}\n` +
    (entry.stack ? `  Stack: ${entry.stack}\n` : "") +
    "\n";

  fs.appendFileSync(LOG_FILE, line, "utf-8");
  return entry;
}

/**
 * 解析常见错误类型，返回人类可读的原因
 */
function parseError(error) {
  const msg = (error.message || String(error)).toLowerCase();

  if (msg.includes("econnrefused") || msg.includes("enotfound")) {
    return { type: "network", hint: "网络连接失败，请检查网络或 API 地址" };
  }
  if (msg.includes("401") || msg.includes("unauthorized")) {
    return { type: "auth", hint: "API Key 无效或已过期" };
  }
  if (msg.includes("403") || msg.includes("forbidden")) {
    return { type: "auth", hint: "API 请求被拒绝，请检查权限" };
  }
  if (msg.includes("429") || msg.includes("rate limit")) {
    return { type: "rate_limit", hint: "API 请求频率超限，稍后重试" };
  }
  if (msg.includes("enoent")) {
    return { type: "file", hint: "文件或目录不存在" };
  }
  if (msg.includes("eacces") || msg.includes("eperm")) {
    return { type: "permission", hint: "权限不足" };
  }
  if (msg.includes("timeout")) {
    return { type: "timeout", hint: "操作超时" };
  }
  if (msg.includes("syntaxerror") && msg.includes("json")) {
    return { type: "parse", hint: "JSON 解析失败，LLM 返回格式异常" };
  }
  return { type: "unknown", hint: "未知错误" };
}

module.exports = { logError, parseError, LOG_FILE };
