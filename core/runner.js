/**
 * Runner — CLI 与核心逻辑的桥接层
 * 职责：接收 CLI 参数，调用 Controller 执行
 */

require("dotenv").config({ path: __dirname + "/../.env" });

const Controller = require("../controller");
const { logError } = require("../utils/error-log");

/**
 * 运行 AI 开发 Agent
 * @param {string} task - 任务描述
 * @param {Object} options - CLI 选项
 * @param {string} options.output - 输出目录
 */
async function runAgent(task, options = {}) {
  // 全局错误捕获
  process.on("uncaughtException", (err) => {
    logError("uncaughtException", err);
    console.error(`\n💥 未捕获异常: ${err.message}`);
  });

  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logError("unhandledRejection", err);
    console.error(`\n💥 未处理的 Promise 拒绝: ${err.message}`);
  });

  const controller = new Controller();
  return await controller.run(task);
}

module.exports = runAgent;
