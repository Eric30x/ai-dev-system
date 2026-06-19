/**
 * Download Route — ZIP 文件下载 + 路径穿越防护
 *
 * GET /api/download?id=xxx
 * GET /api/download/:file
 */

const { Router } = require("express");
const path = require("path");
const fs = require("fs");
const config = require("../../../shared/config");

const router = Router();

/**
 * 安全检查：防止路径穿越攻击
 */
function safeDownloadPath(fileName) {
  // 拒绝包含路径分隔符的文件名
  if (!fileName || typeof fileName !== "string") return null;
  if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    return null;
  }
  // 只允许 .zip 文件
  if (!fileName.endsWith(".zip")) return null;

  const fullPath = path.resolve(path.join(config.DOWNLOADS_DIR, fileName));
  const allowedRoot = path.resolve(config.DOWNLOADS_DIR);

  // 确保解析后的路径在允许的目录内
  if (!fullPath.startsWith(allowedRoot)) return null;

  return fullPath;
}

/**
 * GET /api/download?id=xxx
 */
router.get("/", (req, res) => {
  const taskId = req.query.id;

  if (!taskId) {
    return res.status(400).json({ error: "请提供任务 id（?id=xxx）" });
  }

  const zipPath = safeDownloadPath(`${taskId}.zip`);

  if (!zipPath || !fs.existsSync(zipPath)) {
    return res.status(404).json({ error: "文件不存在，任务可能尚未完成" });
  }

  res.download(zipPath, `ai-project-${taskId}.zip`);
});

/**
 * GET /api/download/:file
 * 直接下载指定文件（同样受路径穿越防护）
 */
router.get("/:file", (req, res) => {
  const zipPath = safeDownloadPath(req.params.file);

  if (!zipPath || !fs.existsSync(zipPath)) {
    return res.status(404).json({ error: "文件不存在" });
  }

  res.download(zipPath);
});

module.exports = router;
