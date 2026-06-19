/**
 * 项目打包模块
 * 职责：将生成的项目打包为 zip 文件供下载
 */

const fs = require("fs-extra");
const path = require("path");
const { ZipArchive } = require("archiver");

const DOWNLOADS_DIR = path.join(__dirname, "..", "downloads");

/**
 * 将目录打包为 zip
 * @param {string} sourceDir — 源目录
 * @param {string} taskId — 任务 ID
 * @returns {Promise<{ zipPath: string, filename: string, size: number }>}
 */
async function zipProject(sourceDir, taskId) {
  await fs.ensureDir(DOWNLOADS_DIR);

  const filename = `${taskId}.zip`;
  const zipPath = path.join(DOWNLOADS_DIR, filename);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => {
      resolve({
        zipPath,
        filename,
        size: archive.pointer(),
      });
    });

    archive.on("error", reject);
    archive.pipe(output);

    // 排除 node_modules 和 .git
    archive.glob("**/*", {
      cwd: sourceDir,
      ignore: ["node_modules/**", ".git/**"],
      dot: true,
    });

    archive.finalize();
  });
}

/**
 * 获取下载文件路径
 */
function getDownloadPath(taskId) {
  return path.join(DOWNLOADS_DIR, `${taskId}.zip`);
}

module.exports = { zipProject, getDownloadPath, DOWNLOADS_DIR };
