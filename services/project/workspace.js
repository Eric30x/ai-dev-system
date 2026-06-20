/**
 * Workspace Service V10 — 项目文件树管理
 */

const { getPrisma } = require("../../db/client");
const fs = require("fs-extra");
const path = require("path");
const config = require("../../shared/config");

/**
 * 获取或创建项目工作区
 */
async function getOrCreateWorkspace(projectId) {
  const prisma = getPrisma();
  let ws = await prisma.workspace.findUnique({ where: { projectId } });
  if (!ws) {
    ws = await prisma.workspace.create({
      data: { projectId, fileTree: {}, metadata: {} },
    });
  }
  return ws;
}

/**
 * 从磁盘同步文件树到 DB
 */
async function syncFileTree(projectId) {
  const outputDir = path.join(config.WORKSPACE_DIR, projectId);
  if (!fs.pathExistsSync(outputDir)) return {};

  const tree = {};
  function walk(dir, prefix = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        tree[relPath] = { type: "dir", children: {} };
        walk(path.join(dir, entry.name), relPath);
      } else {
        try {
          const raw = fs.readFileSync(path.join(dir, entry.name), "utf-8");
          // 清理不可打印字符（防止 PostgreSQL JSONB 报错）
          const content = raw.replace(/\x00/g, "").replace(/[\uD800-\uDFFF]/g, "");
          tree[relPath] = { type: "file", content, size: Buffer.byteLength(content, "utf-8") };
        } catch (e) {
          tree[relPath] = { type: "file", content: "", size: 0 };
        }
      }
    }
  }
  walk(outputDir);

  const prisma = getPrisma();
  await prisma.workspace.upsert({
    where: { projectId },
    create: { projectId, fileTree: tree },
    update: { fileTree: tree },
  });

  return tree;
}

/**
 * 获取文件树
 */
async function getFileTree(projectId) {
  const ws = await getOrCreateWorkspace(projectId);
  return ws.fileTree || {};
}

/**
 * 读取文件内容
 */
async function readFile(projectId, filePath) {
  const baseDir = path.resolve(config.WORKSPACE_DIR);
  const fullPath = path.resolve(baseDir, projectId, filePath);
  if (!fullPath.startsWith(baseDir)) return null;
  if (!fs.pathExistsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf-8");
}

/**
 * 写入文件
 */
async function writeFile(projectId, filePath, content) {
  const baseDir = path.resolve(config.WORKSPACE_DIR);
  const fullPath = path.resolve(baseDir, projectId, filePath);
  if (!fullPath.startsWith(baseDir)) {
    throw new Error("路径穿越不被允许");
  }
  await fs.ensureDir(path.dirname(fullPath));
  await fs.writeFile(fullPath, content, "utf-8");
  return { path: filePath, size: Buffer.byteLength(content, "utf-8") };
}

/**
 * 获取工作区元数据（技术栈等）
 */
async function getMetadata(projectId) {
  const ws = await getOrCreateWorkspace(projectId);
  return ws.metadata || {};
}

/**
 * 更新工作区元数据
 */
async function updateMetadata(projectId, data) {
  const prisma = getPrisma();
  await prisma.workspace.upsert({
    where: { projectId },
    create: { projectId, metadata: data },
    update: { metadata: data },
  });
}

module.exports = { getOrCreateWorkspace, syncFileTree, getFileTree, readFile, writeFile, getMetadata, updateMetadata };
