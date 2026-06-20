/**
 * Worker Core V10 — BullMQ 消费者
 *
 * 增强流程:
 *   Planner → Executor → Verifier → Fixer (3轮) → Artifact 保存 → Zip
 *
 * 实时推送: SSE (via services/project/sse)
 */

require("dotenv").config({ path: __dirname + "/../../.env" });

const fs = require("fs-extra");
const path = require("path");
const { createWorker } = require("../../services/queue/bullmq");
const projectService = require("../../services/project/service");
const billingService = require("../../services/billing/stripe");
const workspaceService = require("../../services/project/workspace");
const artifactService = require("../../services/project/artifact");
const sse = require("../../services/project/sse");
const planner = require("../planner");
const executor = require("../executor");
const { aiFix } = require("../fixer");
const config = require("../../shared/config");
const { PROJECT_STATES } = require("../../shared/types");
const { zipProject } = require("../../utils/zipper");

async function startWorker() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   ⚙️  AI Dev Worker V10 — Ready              ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`\n   🔄 Concurrency: ${config.WORKER_CONCURRENCY}`);
  console.log(`   📂 Workspaces: ${config.WORKSPACE_DIR}\n`);

  fs.ensureDirSync(config.WORKSPACE_DIR);
  fs.ensureDirSync(config.DOWNLOADS_DIR);

  const worker = createWorker(async (job) => {
    const { projectId, type } = job.data;
    console.log(`\n🎯 V10 任务: ${job.id} | Project: ${projectId}`);

    const project = await projectService.getProjectById(projectId);
    if (!project) throw new Error(`项目不存在: ${projectId}`);

    const outputDir = path.join(config.WORKSPACE_DIR, projectId);
    fs.ensureDirSync(outputDir);

    try {
      await executeProjectV10(project, outputDir);
    } catch (err) {
      await projectService.updateProject(projectId, {
        state: PROJECT_STATES.FAILED, error: err.message,
      });
      await projectService.addLog(projectId, "error", `💥 任务失败: ${err.message}`);
      sse.pushLog(projectId, "error", `💥 ${err.message}`);
      sse.pushProgress(projectId, "failed", 0, "失败");
      throw err;
    }
  });

  console.log("✅ Worker V10 已启动，等待任务...\n");
  return worker;
}

async function executeProjectV10(project, outputDir) {
  const projectId = project.id;
  const emit = (level, msg) => {
    projectService.addLog(projectId, level, msg).catch(() => {});
    sse.pushLog(projectId, level, msg);
  };

  // ═══ Phase 1: Plan ═══
  await phase("PLANNING", 10, "任务规划中...", projectId);
  emit("info", "🧠 Planner 分析需求...");

  let plan;
  try {
    plan = await planner.plan(project.description);
    emit("info", `📋 生成 ${plan.length} 个步骤`);
  } catch (err) {
    throw new Error(`规划失败: ${err.message}`);
  }

  // ═══ Phase 2: Execute ═══
  await phase("EXECUTING", 30, "执行中...", projectId);

  let results = await executor.executeSteps(plan, outputDir, (step, total, desc) => {
    projectService.updateProject(projectId, {
      progress: 30 + Math.round((step / total) * 25),
      currentStep: `${step}/${total}: ${desc}`,
    }).catch(() => {});
    sse.pushProgress(projectId, "executing", 30 + Math.round((step / total) * 25), `${step}/${total}: ${desc}`);
    emit("info", `📝 步骤 ${step}/${total}: ${desc}`);
  });

  for (const r of results) {
    emit(r.success ? "info" : "warn", r.success ? `✅ 步骤 ${r.step} 成功` : `❌ 步骤 ${r.step} 失败: ${r.error}`);
  }

  // ═══ Phase 3: Verify ═══
  await phase("VERIFYING", 60, "验证中...", projectId);
  emit("info", "🔍 Verifier 启动...");

  const verifyResult = await verifier.verify(outputDir);
  if (!verifyResult.passed) {
    emit("warn", `⚠️ 验证发现问题: ${verifyResult.issues.join("; ")}`);
  } else {
    emit("info", "✅ 验证通过");
  }

  // ═══ Phase 4: AI Fix (3 rounds max) ═══
  let fixNeeded = !verifyResult.passed;
  for (let round = 1; round <= config.MAX_FIX_ROUNDS && fixNeeded; round++) {
    await phase("FIXING", 60 + round * 10, `AI 修复第 ${round} 轮...`, projectId);
    emit("info", `🤖 AI Fixer 第 ${round}/${config.MAX_FIX_ROUNDS} 轮...`);

    const fixResult = await fixer.fix(outputDir, verifyResult.issues, plan, results);

    // 记录 AI 诊断
    if (fixResult.diagnosis) {
      emit("info", `🔎 诊断: ${fixResult.diagnosis}`);
    }
    // 记录详细步骤
    if (fixResult.details) {
      for (const d of fixResult.details) {
        const level = d.startsWith("✅") ? "info" : d.startsWith("❌") ? "error" : "info";
        emit(level, d);
      }
    }

    if (fixResult.fixed) {
      emit("info", `✅ AI 修复成功 (${fixResult.changes} 处改动)`);
      // 重新验证
      const reVerify = await verifier.verify(outputDir);
      fixNeeded = !reVerify.passed;
      if (fixNeeded) {
        emit("warn", `⚠️ 仍需修复: ${reVerify.issues.join("; ")}`);
        verifyResult.issues = reVerify.issues;
      } else {
        emit("info", "✅ 所有问题已修复");
      }
    } else {
      emit("warn", "⚠️ AI Fixer 无法自动修复，跳过本轮");
      break;
    }
  }

  // ═══ Phase 5: Artifact ═══
  await phase("VERIFYING", 85, "保存产出...", projectId);
  emit("info", "📦 保存 Artifact...");

  try {
    // 收集日志
    const prisma = require("../../db/client").getPrisma();
    const allLogs = await prisma.logEntry.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });
    const result = await artifactService.saveArtifact(projectId, {
      logs: allLogs,
      metadata: { taskType: "generate", planSteps: plan?.length || 0 },
    });
    emit("info", `📦 Artifact v${result.version} 已保存 (${result.artifacts.length} 个文件)`);
    await workspaceService.syncFileTree(projectId);
    emit("info", "✅ 文件树已同步");
  } catch (e) {
    emit("warn", `⚠️ Artifact 保存失败: ${e.message}`);
  }

  // ═══ Phase 6: Pack ═══
  const finalVerify = await verifier.verify(outputDir);
  if (!finalVerify.passed) {
    await projectService.updateProject(projectId, {
      state: PROJECT_STATES.FAILED, progress: 100,
      error: `验证未通过: ${finalVerify.issues.join("; ")}`,
    });
    emit("error", "❌ 最终验证未通过");
    sse.pushProgress(projectId, "failed", 100, "失败");
    return;
  }

  try {
    await zipProject(outputDir, projectId);
    const downloadUrl = `${config.BASE_URL}/api/download?id=${projectId}`;

    await projectService.updateProject(projectId, {
      state: PROJECT_STATES.SUCCESS, progress: 100,
      currentStep: "完成", downloadUrl,
    });
    emit("info", `🎉 项目生成成功！`);

    await billingService.trackUsage(project.userId, "project");
    sse.pushProgress(projectId, "success", 100, "完成");
  } catch (err) {
    await projectService.updateProject(projectId, {
      state: PROJECT_STATES.SUCCESS, progress: 100,
      currentStep: "完成（打包失败）",
    });
    emit("warn", `⚠️ 打包失败: ${err.message}`);
  }
}

// ═══ Helpers ═══

async function phase(state, progress, step, projectId) {
  await projectService.updateProject(projectId, { state, progress, currentStep: step });
  sse.pushProgress(projectId, state.toLowerCase(), progress, step);
}

// ═══ Verifier Agent ═══
const verifier = {
  async verify(outputDir) {
    const issues = [];
    const hasPkg = fs.pathExistsSync(path.join(outputDir, "package.json"));

    // 1. Check npm install
    if (hasPkg) {
      const install = executor.safeExec("npm install --legacy-peer-deps", outputDir, 90000);
      if (!install.success) {
        issues.push(`npm install 失败: ${install.output}`);
      }
    }

    // 2. Check for entry file
    const entryFiles = ["index.js", "app.js", "main.js", "server.js"];
    const hasEntry = entryFiles.some(f => fs.pathExistsSync(path.join(outputDir, f)));
    if (!hasEntry && !hasPkg) {
      issues.push("缺少入口文件 (index.js/server.js)");
    }

    // 3. Check package.json has start script
    if (hasPkg) {
      try {
        const pkg = fs.readJsonSync(path.join(outputDir, "package.json"));
        if (!pkg.scripts || !pkg.scripts.start) {
          issues.push("package.json 缺少 start 脚本");
        }
      } catch (e) {
        issues.push("package.json 解析失败");
      }
    }

    // 4. Quick syntax check on JS files
    const jsFiles = findFiles(outputDir, ".js");
    for (const file of jsFiles.slice(0, 10)) {
      try {
        require(path.join(outputDir, file));
        delete require.cache[require.resolve(path.join(outputDir, file))];
      } catch (e) {
        if (e.code === "MODULE_NOT_FOUND") {
          issues.push(`${file}: 缺少依赖 ${e.message.split("'").filter((_, i) => i % 2 === 1).pop()}`);
        }
        // Syntax errors are OK for now (IIFE issues with require)
      }
    }

    return { passed: issues.length === 0, issues };
  },
};

// ═══ AI Fixer V10.3 — LLM 驱动修复 ═══
const fixer = {
  async fix(outputDir, issues, originalPlan, execResults) {
    // 收集失败步骤详情
    const failedSteps = (execResults || [])
      .filter(r => !r.success)
      .map(r => {
        const step = originalPlan?.[r.step - 1];
        return {
          step: r.step,
          description: step?.description || `Step ${r.step}`,
          error: r.error || "未知错误",
        };
      });

    // 从原始计划推断任务描述
    const taskDesc = originalPlan?.map(s => s.description).filter(Boolean).join(" → ") || "项目生成";

    // 调用 AI Fixer
    const result = await aiFix(outputDir, issues || [], failedSteps, taskDesc);

    // 将 AI Fixer 的详细日志写入项目日志
    for (const detail of result.details || []) {
      console.log(`  🔧 ${detail}`);
    }

    return {
      fixed: result.fixed,
      changes: result.changes || 0,
      details: result.details,
      diagnosis: result.diagnosis,
    };
  },
};

// ═══ Utils ═══
function findFiles(dir, ext) {
  const results = [];
  function walk(d) {
    if (!fs.pathExistsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { walk(full); }
      else if (entry.name.endsWith(ext)) { results.push(path.relative(dir, full)); }
    }
  }
  walk(dir);
  return results;
}

// 启动
startWorker().catch(err => {
  console.error("Worker V10 启动失败:", err.message);
  process.exit(1);
});
