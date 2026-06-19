/**
 * Project Service — 项目 CRUD + 状态管理
 */

const { getPrisma } = require("../../db/client");
const { PROJECT_STATES } = require("../../shared/types");

async function createProject(userId, name, description) {
  const prisma = getPrisma();
  const project = await prisma.project.create({
    data: {
      userId,
      name: name || `project-${Date.now().toString(36)}`,
      description,
      state: PROJECT_STATES.PENDING,
    },
  });
  return project;
}

async function getProject(projectId, userId) {
  const prisma = getPrisma();
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { logs: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  return project;
}

/**
 * 仅通过 projectId 获取项目（Worker 内部使用，不检查用户归属）
 */
async function getProjectById(projectId) {
  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { logs: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  return project;
}

async function listProjects(userId) {
  const prisma = getPrisma();
  return prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      state: true,
      progress: true,
      currentStep: true,
      downloadUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function updateProject(projectId, data) {
  const prisma = getPrisma();
  return prisma.project.update({
    where: { id: projectId },
    data,
  });
}

async function addLog(projectId, level, message) {
  const prisma = getPrisma();
  await prisma.logEntry.create({
    data: { projectId, level, message },
  });
}

async function getLogs(projectId, limit = 100) {
  const prisma = getPrisma();
  return prisma.logEntry.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

module.exports = { createProject, getProject, getProjectById, listProjects, updateProject, addLog, getLogs };
