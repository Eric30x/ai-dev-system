/**
 * Task Routes — Web UI 桥接层（上线加固版）
 *
 * 将前端期望的 /api/create-task + /api/get-task
 * 桥接到 V9 Prisma + BullMQ 后端。
 *
 * 使用 Prisma project.id（cuid）作为统一 taskId，
 * 确保 create-task 和 get-task 使用相同的 ID。
 */

const { Router } = require("express");
const bcrypt = require("bcryptjs");
const projectService = require("../../../services/project/service");
const { addTask } = require("../../../services/queue/bullmq");
const { getPrisma } = require("../../../db/client");

// 可选：双写到文件 task-store（调试 / 兼容旧消费者）
let taskStore = null;
try {
  taskStore = require("../../../queue/task-store");
} catch (e) {
  // task-store 不可用时忽略
}

// ─── 系统匿名用户缓存 ───
let _systemUserId = null;

/**
 * 获取或创建系统匿名用户（用于无认证的 Web UI 流程）
 */
async function getOrCreateSystemUser() {
  if (_systemUserId) return _systemUserId;

  const prisma = getPrisma();

  let user = await prisma.user.findUnique({ where: { email: "system@aidev.local" } });
  if (user) {
    _systemUserId = user.id;
    return _systemUserId;
  }

  // 创建系统用户
  const passwordHash = await bcrypt.hash("system-internal-no-login", 12);
  user = await prisma.user.create({
    data: {
      email: "system@aidev.local",
      passwordHash,
      name: "System (Anonymous)",
      plan: "FREE",
    },
  });
  _systemUserId = user.id;
  console.log("  👤 已创建系统匿名用户:", user.id);
  return _systemUserId;
}

const router = Router();

/**
 * POST /api/create-task
 * 创建项目 → 入队 BullMQ → 返回 taskId（即 Prisma project.id）
 */
router.post("/create-task", async (req, res) => {
  try {
    const { task, userId } = req.body;

    if (!task || typeof task !== "string" || task.trim().length === 0) {
      return res.status(400).json({ error: "请提供 task 描述" });
    }

    // ─── 获取系统用户 ID（V9 要求 project 有合法的 userId 外键） ───
    let uid;
    try {
      uid = await getOrCreateSystemUser();
    } catch (userErr) {
      console.error("系统用户初始化失败:", userErr.message);
      return res.status(503).json({ error: "系统初始化失败，请稍后重试" });
    }

    const description = task.trim();

    // ─── V9 主路径：Prisma 创建项目 + BullMQ 入队 ───
    let project;
    try {
      project = await projectService.createProject(uid, `task-${Date.now().toString(36)}`, description);
      await addTask(project.id, "generate", { projectId: project.id });
    } catch (dbErr) {
      console.error("V9 后端写入失败:", dbErr.message);
      return res.status(503).json({ error: "后端服务暂不可用，请稍后重试" });
    }

    // ─── 双写：文件 task-store（调试用） ───
    if (taskStore) {
      try {
        taskStore.createTask(project.id, description, uid);
      } catch (fsErr) {
        // 非致命
      }
    }

    // 使用 Prisma project.id 作为统一 taskId
    res.json({
      taskId: project.id,
      userId: uid,
      state: "pending",
      message: "任务已创建，等待执行",
    });
  } catch (err) {
    console.error("create-task 错误:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/get-task
 * 查询任务/项目状态
 * - ?id=xxx → 单个任务（id = Prisma project.id）
 * - 无参数 → 任务列表
 */
router.get("/get-task", async (req, res) => {
  try {
    const taskId = req.query.id;

    if (!taskId) {
      // ─── 任务列表 ───
      const userId = req.query.userId;
      let tasks = [];

      try {
        // 有真实用户 ID 则按用户过滤；匿名则用系统用户
        let queryUserId = userId;
        if (!queryUserId || queryUserId === "anonymous") {
          queryUserId = await getOrCreateSystemUser();
        }

        const projects = await projectService.listProjects(queryUserId);
        tasks = projects.map((p) => ({
          id: p.id,
          description: p.description,
          state: p.state.toLowerCase(),
          progress: p.progress,
          currentStep: p.currentStep,
          downloadUrl: p.downloadUrl,
          error: p.error,
          logs: [],
          createdAt: p.createdAt,
        }));
      } catch (dbErr) {
        // Prisma 不可用
      }

      // 回退：文件存储
      if (tasks.length === 0 && taskStore) {
        try {
          tasks = taskStore.getAllTasks(userId);
        } catch (fsErr) {
          // ignore
        }
      }

      return res.json({ tasks });
    }

    // ─── 单个任务：直接用 taskId 查 Prisma ───
    try {
      const project = await projectService.getProjectById(taskId);
      if (project) {
        return res.json({
          id: project.id,
          description: project.description,
          state: project.state.toLowerCase(),
          progress: project.progress,
          currentStep: project.currentStep,
          downloadUrl: project.downloadUrl,
          error: project.error,
          logs: (project.logs || []).map((l) => `[${l.createdAt}] ${l.message}`),
          createdAt: project.createdAt,
        });
      }
    } catch (dbErr) {
      // Prisma 不可用
    }

    // 回退：文件 task-store
    if (taskStore) {
      const task = taskStore.getTask(taskId);
      if (task) return res.json(task);
    }

    return res.status(404).json({ error: "任务不存在" });
  } catch (err) {
    console.error("get-task 错误:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
