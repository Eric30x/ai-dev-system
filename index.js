/**
 * AI 自动开发系统 V3 — 项目入口
 *
 * 使用方式:
 *   node index.js
 *   node index.js "你的任务描述"
 */

const Controller = require("./controller");
const { logError } = require("./utils/error-log");

// ======== 在这里修改你的任务 ========
const DEFAULT_TASK = `
创建一个简单的 Express.js REST API 项目，包含：
1. 一个 GET /api/hello 接口，返回 { "message": "Hello World" }
2. 一个 GET /api/users 接口，返回一个示例用户列表
3. 基本的错误处理中间件
4. package.json 配置（包含 express 依赖）
5. 一个 README.md 说明如何运行
`.trim();
// ====================================

async function main() {
  const task = process.argv[2] || DEFAULT_TASK;

  const controller = new Controller();
  await controller.run(task);
}

// 全局错误捕获 — 不允许进程崩溃
process.on("uncaughtException", (err) => {
  logError("uncaughtException", err);
  console.error(`\n💥 未捕获异常: ${err.message}`);
  console.error(`   错误已记录到 logs/error.log`);
  // 不调用 process.exit，让进程自然结束
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logError("unhandledRejection", err);
  console.error(`\n💥 未处理的 Promise 拒绝: ${err.message}`);
  console.error(`   错误已记录到 logs/error.log`);
});

main().catch((err) => {
  logError("main", err);
  console.error(`\n💥 程序异常: ${err.message}`);
  console.error(`   错误已记录到 logs/error.log`);
});
