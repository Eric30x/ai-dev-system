/**
 * GET /api/health
 * 健康检查
 */

const taskQueue = require("../queue/task-store");

module.exports = (req, res) => {
  res.json({
    status: "ok",
    version: "8.0.0",
    timestamp: new Date().toISOString(),
  });
};
