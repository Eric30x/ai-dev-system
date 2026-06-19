/**
 * GET /api/download?id=xxx
 * 下载生成的项目 zip
 */

const path = require("path");
const fs = require("fs");
const config = require("../shared/config");

module.exports = (req, res) => {
  const taskId = req.query.id;

  if (!taskId) {
    return res.status(400).json({ error: "请提供任务 id" });
  }

  const zipPath = path.join(config.DOWNLOADS_DIR, `${taskId}.zip`);

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: "文件不存在，任务可能尚未完成" });
  }

  res.download(zipPath, `ai-project-${taskId}.zip`);
};
