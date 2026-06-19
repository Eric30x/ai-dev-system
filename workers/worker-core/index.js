/**
 * Worker Core — BullMQ 消费者，执行完整 AI 开发流程
 */

require("dotenv").config({ path: __dirname + "/../../.env" });

const fs = require("fs-extra");
const path = require("path");
const { createWorker } = require("../../services/queue/bullmq");
const projectService = require("../../services/project/service");
const billingService = require("../../services/billing/stripe");
const planner = require("../planner");
const executor = require("../executor");
const config = require("../../shared/config");
const { PROJECT_STATES } = require("../../shared/types");
const { zipProject } = require("../../utils/zipper");

async function startWorker() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║     ⚙️  AI Dev Worker V9 — Ready             ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`\n   🔄 Concurrency: ${config.WORKER_CONCURRENCY}`);
  console.log(`   📂 Workspaces: ${config.WORKSPACE_DIR}\n`);

  fs.ensureDirSync(config.WORKSPACE_DIR);
  fs.ensureDirSync(config.DOWNLOADS_DIR);

  const worker = createWorker(async (job) => {
    const { projectId, type } = job.data;
    console.log(`\n🎯 处理任务: ${job.id} | Project: ${projectId} | Type: ${type}`);

    const project = await projectService.getProjectById(projectId);
    if (!project) throw new Error(`项目不存在: ${projectId}`);

    const outputDir = path.join(config.WORKSPACE_DIR, projectId);
    fs.ensureDirSync(outputDir);

    try {
      await executeProject(project, outputDir);
    } catch (err) {
      await projectService.updateProject(projectId, {
        state: PROJECT_STATES.FAILED,
        error: err.message,
      });
      await projectService.addLog(projectId, "error", `💥 任务失败: ${err.message}`);
      throw err;
    }
  });

  console.log("✅ Worker 已启动，等待任务...\n");
  return worker;
}

async function executeProject(project, outputDir) {
  const projectId = project.id;

  // ─── Phase 1: 规划 ───
  await projectService.updateProject(projectId, {
    state: PROJECT_STATES.PLANNING,
    progress: 10,
    currentStep: "任务规划中...",
  });
  await projectService.addLog(projectId, "info", "🧠 开始任务规划...");

  let plan;
  try {
    plan = await planner.plan(project.description);
    await projectService.addLog(projectId, "info", `📋 生成 ${plan.length} 个步骤`);
  } catch (err) {
    throw new Error(`规划失败: ${err.message}`);
  }

  // ─── Phase 2: 执行 ───
  await projectService.updateProject(projectId, {
    state: PROJECT_STATES.EXECUTING,
    progress: 30,
    currentStep: "执行中...",
  });

  let results = await executor.executeSteps(plan, outputDir, (step, total, desc) => {
    projectService.updateProject(projectId, {
      progress: 30 + Math.round((step / total) * 30),
      currentStep: `${step}/${total}: ${desc}`,
    });
  });

  // 记录执行结果
  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    const msg = r.success ? `步骤 ${r.step} 成功` : `步骤 ${r.step} 失败: ${r.error}`;
    await projectService.addLog(projectId, r.success ? "info" : "warn", `${status} ${msg}`);
  }

  // ─── Phase 2.5: 自愈 ───
  for (let round = 1; round <= config.MAX_FIX_ROUNDS; round++) {
    const failures = results.filter((r) => !r.success);
    if (failures.length === 0) break;

    await projectService.updateProject(projectId, {
      state: PROJECT_STATES.FIXING,
      progress: 60,
      currentStep: `修复第 ${round} 轮...`,
    });
    await projectService.addLog(projectId, "info", `🔧 ${failures.length} 个步骤失败，生成修复方案...`);

    const fixSteps = [];
    for (const f of failures) {
      const original = plan[f.step - 1];
      if (!original) continue;
      const tree = executor.getFileTree(outputDir);
      const fix = await planner.generateFix(original, f.error, tree);
      fixSteps.push(...fix);
    }

    if (fixSteps.length === 0) {
      await projectService.addLog(projectId, "warn", "⚠️ 无法生成修复方案");
      break;
    }

    const fixResults = await executor.executeSteps(fixSteps, outputDir);
    const newResults = results.filter((r) => r.success);
    results = [...newResults, ...fixResults];
  }

  // ─── Phase 3: 验证 ───
  await projectService.updateProject(projectId, {
    state: PROJECT_STATES.VERIFYING,
    progress: 75,
    currentStep: "验证中...",
  });
  await projectService.addLog(projectId, "info", "🔍 验证项目...");

  const verified = await verifyProject(outputDir);

  // ─── Phase 4: 结果 ───
  if (verified) {
    try {
      const zipResult = await zipProject(outputDir, projectId);
      const downloadUrl = `${config.BASE_URL}/api/download?id=${projectId}`;

      await projectService.updateProject(projectId, {
        state: PROJECT_STATES.SUCCESS,
        progress: 100,
        currentStep: "完成",
        downloadUrl,
      });
      await projectService.addLog(projectId, "info", `🎉 项目生成成功！下载: ${downloadUrl}`);

      // 记录用量
      await billingService.trackUsage(project.userId, "project");
    } catch (err) {
      await projectService.updateProject(projectId, {
        state: PROJECT_STATES.SUCCESS,
        progress: 100,
        currentStep: "完成（打包失败）",
      });
      await projectService.addLog(projectId, "warn", `⚠️ 项目已生成，但打包失败: ${err.message}`);
    }
  } else {
    await projectService.updateProject(projectId, {
      state: PROJECT_STATES.FAILED,
      progress: 100,
      error: "项目验证未通过",
    });
    await projectService.addLog(projectId, "error", "❌ 项目验证未通过");
  }
}

async function verifyProject(outputDir) {
  const entryFiles = ["index.js", "app.js", "main.js", "server.js"];
  const hasEntry = entryFiles.some((f) => fs.pathExistsSync(path.join(outputDir, f)));
  const hasPkg = fs.pathExistsSync(path.join(outputDir, "package.json"));

  if (!hasEntry && !hasPkg) return false;

  if (hasPkg) {
    const install = executor.safeExec("npm install", outputDir, 60000);
    if (!install.success) {
      // npm install 失败不算致命
    }
  }

  // 尝试启动
  const entry = entryFiles.find((f) => fs.pathExistsSync(path.join(outputDir, f)));
  const cmd = hasPkg ? "npm start" : `node ${entry}`;

  return new Promise((resolve) => {
    const { spawn } = require("child_process");
    const proc = spawn(cmd, [], {
      cwd: outputDir,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let resolved = false;

    proc.stdout.on("data", (d) => { stdout += d; });
    proc.stderr.on("data", (d) => { stderr += d; });

    proc.on("exit", () => {
      if (resolved) return;
      resolved = true;
      resolve(stdout.length > 0);
    });

    proc.on("error", () => {
      if (resolved) return;
      resolved = true;
      resolve(false);
    });

    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      proc.kill("SIGTERM");

      const combined = (stdout + stderr).toLowerCase();
      const success = ["listening", "server started", "running on", "http://localhost"]
        .some((p) => combined.includes(p));
      resolve(success);
    }, 15000);
  });
}

// 启动
startWorker().catch((err) => {
  console.error("Worker 启动失败:", err.message);
  process.exit(1);
});
