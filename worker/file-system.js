/**
 * 文件系统操作 — 安全写入/读取
 */

const fs = require("fs-extra");
const path = require("path");

async function writeFile(outputDir, target, content) {
  const filePath = path.join(outputDir, target);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

async function readFile(outputDir, target) {
  const filePath = path.join(outputDir, target);
  return fs.readFile(filePath, "utf-8");
}

async function fileExists(outputDir, target) {
  return fs.pathExists(path.join(outputDir, target));
}

function getFileTree(outputDir) {
  try {
    const walk = (dir, prefix = "") => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      let result = "";
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          result += `📁 ${relPath}/\n` + walk(path.join(dir, entry.name), relPath);
        } else {
          result += `📄 ${relPath}\n`;
        }
      }
      return result;
    };
    return walk(outputDir) || "(空)";
  } catch {
    return "(无法读取)";
  }
}

module.exports = { writeFile, readFile, fileExists, getFileTree };
