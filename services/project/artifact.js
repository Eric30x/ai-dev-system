/**
 * Artifact Service V10.4 — 项目版本管理
 *
 * 每次任务完成自动保存: README / Source / Logs / Zip / Metadata
 * 支持: 历史版本、下载、回滚、版本比较
 */

const fs = require("fs-extra");
const path = require("path");
const { getPrisma } = require("../../db/client");
const config = require("../../shared/config");
const { zipProject } = require("../../utils/zipper");

/**
 * 保存 Artifact（任务完成时调用）
 * @returns {object} artifact record
 */
async function saveArtifact(projectId, options = {}) {
  const prisma = getPrisma();
  const outputDir = path.join(config.WORKSPACE_DIR, projectId);
  const artifactDir = path.join(config.WORKSPACE_DIR, projectId, ".artifacts");
  await fs.ensureDir(artifactDir);

  // 计算版本号
  const version = (await prisma.artifact.count({ where: { projectId } })) + 1;

  // ─── 收集产出 ───
  const artifacts = [];

  // 1. README (如果存在)
  const readmeFiles = ["README.md", "readme.md", "README.txt"];
  for (const rf of readmeFiles) {
    const rp = path.join(outputDir, rf);
    if (fs.pathExistsSync(rp)) {
      const content = fs.readFileSync(rp, "utf-8");
      const savePath = path.join(artifactDir, `v${version}-README.md`);
      fs.writeFileSync(savePath, content, "utf-8");
      artifacts.push({ type: "readme", path: savePath, size: Buffer.byteLength(content, "utf-8") });
      break;
    }
  }

  // 2. Source Code (打包)
  const sourceZipPath = path.join(artifactDir, `v${version}-source.zip`);
  try {
    await zipProject(outputDir, `v${version}-source-tmp`);
    const tmpZip = path.join(config.DOWNLOADS_DIR, `v${version}-source-tmp.zip`);
    if (fs.pathExistsSync(tmpZip)) {
      fs.moveSync(tmpZip, sourceZipPath, { overwrite: true });
      artifacts.push({ type: "source", path: sourceZipPath, size: fs.statSync(sourceZipPath).size });
    }
  } catch (e) {
    // zip 失败不阻塞
  }

  // 3. Logs
  const logs = options.logs || [];
  const logContent = logs.map(l => `[${l.createdAt || new Date().toISOString()}] [${l.level}] ${l.message}`).join("\n");
  const logPath = path.join(artifactDir, `v${version}-logs.txt`);
  fs.writeFileSync(logPath, logContent || "(no logs)", "utf-8");
  artifacts.push({ type: "log", path: logPath, size: Buffer.byteLength(logContent, "utf-8") });

  // 4. Final Zip
  const finalZipPath = path.join(config.DOWNLOADS_DIR, `${projectId}.zip`);
  if (fs.pathExistsSync(finalZipPath)) {
    const copyPath = path.join(artifactDir, `v${version}-final.zip`);
    fs.copySync(finalZipPath, copyPath, { overwrite: true });
    artifacts.push({ type: "zip", path: copyPath, size: fs.statSync(copyPath).size });
  }

  // 5. Metadata
  const metadata = {
    version,
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    modelName: config.MODEL_NAME,
    ...options.metadata,
  };
  const metaPath = path.join(artifactDir, `v${version}-metadata.json`);
  fs.writeJsonSync(metaPath, metadata, { spaces: 2 });

  // ─── 写入数据库（统一用正斜杠） ───
  const records = [];
  for (const art of artifacts) {
    const record = await prisma.artifact.create({
      data: {
        projectId,
        version,
        type: art.type,
        path: (art.path || "").replace(/\\/g, "/"),
        size: art.size || 0,
        metadata,
      },
    });
    records.push(record);
  }

  console.log(`📦 Artifact v${version} 已保存: ${artifacts.length} 个文件`);
  return { version, artifacts: records, metadata };
}

/**
 * 获取项目的所有 Artifact 版本
 */
async function listArtifacts(projectId) {
  const prisma = getPrisma();
  const records = await prisma.artifact.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
    select: {
      id: true, version: true, type: true, size: true, createdAt: true, metadata: true,
    },
  });

  // 按版本分组
  const versions = {};
  for (const r of records) {
    if (!versions[r.version]) {
      versions[r.version] = {
        version: r.version,
        createdAt: r.createdAt,
        metadata: r.metadata,
        items: [],
      };
    }
    versions[r.version].items.push({ id: r.id, type: r.type, size: r.size });
  }

  return Object.values(versions).sort((a, b) => b.version - a.version);
}

/**
 * 获取单个 Artifact 记录
 */
async function getArtifact(artifactId) {
  const prisma = getPrisma();
  return prisma.artifact.findUnique({ where: { id: artifactId } });
}

/**
 * 获取 Artifact 文件路径
 */
function getArtifactPath(artifact) {
  if (!artifact || !artifact.path) return null;
  // 尝试多个路径解析策略
  const candidates = [
    artifact.path,                                    // 原始路径
    path.resolve(artifact.path),                       // 绝对路径解析
    path.join(config.WORKSPACE_DIR, "..", artifact.path), // 相对于工作区父目录
  ];
  for (const p of candidates) {
    if (fs.pathExistsSync(p)) return p;
  }
  return null;
}

/**
 * 回滚到指定版本
 * 将该版本的 source zip 解压到项目工作目录
 */
async function rollback(projectId, targetVersion) {
  const prisma = getPrisma();

  // 查找该版本的 source artifact
  const sourceArtifact = await prisma.artifact.findFirst({
    where: { projectId, version: targetVersion, type: "source" },
  });

  if (!sourceArtifact) {
    throw new Error(`版本 v${targetVersion} 的源代码不存在`);
  }

  const sourcePath = getArtifactPath(sourceArtifact);
  if (!sourcePath) {
    throw new Error(`版本 v${targetVersion} 的 source zip 文件丢失`);
  }

  // 先保存当前版本作为备份
  await saveArtifact(projectId, {
    metadata: { reason: `回滚到 v${targetVersion} 前的自动备份` },
  });

  // 解压 source zip 到工作目录
  const outputDir = path.join(config.WORKSPACE_DIR, projectId);
  const AdmZip = await tryRequireAdmZip();

  if (AdmZip) {
    // 使用 adm-zip 解压
    const zip = new AdmZip(sourcePath);
    // 清空工作目录（保留 .artifacts）
    const entries = fs.readdirSync(outputDir).filter(e => e !== ".artifacts" && e !== "node_modules");
    for (const entry of entries) {
      fs.removeSync(path.join(outputDir, entry));
    }
    zip.extractAllTo(outputDir, true);
  } else {
    // fallback: 使用系统 unzip
    const { execSync } = require("child_process");
    execSync(`powershell -Command "Expand-Archive -Path '${sourcePath}' -DestinationPath '${outputDir}' -Force"`, {
      stdio: "ignore", timeout: 30000,
    });
  }

  return {
    rolledBackTo: targetVersion,
    message: `已回滚到版本 v${targetVersion}`,
  };
}

/**
 * 比较两个版本的文件差异（简单实现：列出文件变化）
 */
async function compareVersions(projectId, v1, v2) {
  const prisma = getPrisma();

  const a1 = await prisma.artifact.findFirst({
    where: { projectId, version: v1, type: "source" },
  });
  const a2 = await prisma.artifact.findFirst({
    where: { projectId, version: v2, type: "source" },
  });

  return {
    version1: { version: v1, createdAt: a1?.createdAt, size: a1?.size },
    version2: { version: v2, createdAt: a2?.createdAt, size: a2?.size },
    diff: `v${v1}: ${a1?.size || 0} bytes → v${v2}: ${a2?.size || 0} bytes (${((a2?.size || 0) - (a1?.size || 0))} bytes change)`,
  };
}

async function tryRequireAdmZip() {
  try { return require("adm-zip"); }
  catch (e) { return null; }
}

module.exports = { saveArtifact, listArtifacts, getArtifact, getArtifactPath, rollback, compareVersions };
