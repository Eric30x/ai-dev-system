/**
 * Worker — 任务执行引擎
 * 轮询队列，执行任务，更新进度
 */

require("dotenv").config({ path: __dirname + "/../.env" });

const fs = require("fs-extra");
const path = require("path");
const config = require("../shared/config");
const { TASK_STATES } = require("../shared/types");
const taskQueue = require("../queue/task-queue");
const taskStore = require("../queue/task-store");
const ProgressTracker = require("../core/progress-tracker");
const logger = require("../core/logger");
const planner = require("./planner");
const executor = require("./executor");
const fileSystem = require("./file-system");
const { zipProject } = require("../utils/zipper");

const MAX_FIX_ROUNDS = 3;
const MAX_VERIFY_RETRIES = 3;

async function startWorker() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║     ⚙️  AI Dev Worker V8 — Ready             ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`\n   📂 Queue: ${config.QUEUE_DIR}`);
  console.log(`   📂 Workspace: ${config.WORKSPACE_DIR}`);
  console.log(`   🔄 Poll interval: ${config.POLL_INTERVAL}ms\n`);

  // 确保目录存在
  fs.ensureDirSync(config.QUEUE_DIR);
  fs.ensureDirSync(config.WORKSPACE_DIR);
  fs.ensureDirSync(config.DOWNLOADS_DIR);

  // 主循环
  setInterval(processNext, config.POLL_INTERVAL);
  processNext(); // 立即处理一次
}

async function processNext() {
  const taskId = taskQueue.dequeue();
  if (!taskId) return;

  logger.info("worker", `开始处理任务: ${taskId}`);

  try {
    await executeTask(taskId);
  } catch (err) {
    logger.error("worker", `任务 ${taskId} 异常: ${err.message}`);
    taskStore.updateTask(taskId, { state: TASK_STATES.FAILED, error: err.message });
    taskStore.addLog(taskId, `💥 异常: ${err.message}`);
  } finally {
    taskQueue.complete(taskId);
  }
}

async function executeTask(taskId) {
  const task = taskStore.getTask(taskId);
  if (!task) return;

  const outputDir = path.join(config.WORKSPACE_DIR, taskId);
  fs.ensureDirSync(outputDir);
  const tracker = new ProgressTracker(taskId);

  // ─── Phase 1: 规划 ───
  tracker.update(TASK_STATES.PLANNING, 10, "任务规划中...");
  let plan;
  try {
    plan = await planner.plan(task.description);
    tracker.log(`📋 生成 ${plan.length} 个步骤`);
  } catch (err) {
    tracker.update(TASK_STATES.FAILED, 100, null, `规划失败: ${err.message}`);
    return;
  }

  // ─── Phase 2: 执行 ───
  tracker.update(TASK_STATES.EXECUTING, 30, "执行中...");
  let results = await executor.executeSteps(plan, outputDir, tracker);

  // 自愈循环
  for (let round = 1; round <= MAX_FIX_ROUNDS; round++) {
    const failures = results.filter((r) => !r.success);
    if (failures.length === 0) break;

    tracker.update(TASK_STATES.FIXING, 50, `修复第 ${round} 轮...`);
    tracker.log(`🔧 ${failures.length} 个步骤失败，生成修复方案...`);

    const fixSteps = [];
    for (const f of failures) {
      const originalStep = plan[f.step - 1];
      if (!originalStep) continue;

      const tree = fileSystem.getFileTree(outputDir);
      const fix = await planner.generateFix(originalStep, f.error, tree, { platform: process.platform });
      fixSteps.push(...fix);
    }

    if (fixSteps.length === 0) {
      tracker.log("⚠️ 无法生成修复方案");
      break;
    }

    const fixResults = await executor.executeSteps(fixSteps, outputDir, tracker);
    const newResults = results.filter((r) => r.success);
    results = [...newResults, ...fixResults];
  }

  // ─── Phase 3: 验证 ───
  tracker.update(TASK_STATES.VERIFYING, 75, "验证中...");
  const verified = await verifyProject(outputDir, tracker);

  // ─── Phase 4: 结果 ───
  if (verified) {
    // 打包
    try {
      const zipResult = await zipProject(outputDir, taskId);
      const baseUrl = config.BASE_URL;
      const downloadUrl = `${baseUrl}/api/download/${taskId}`;
      taskStore.updateTask(taskId, {
        state: TASK_STATES.SUCCESS,
        progress: 100,
        currentStep: "完成",
        downloadUrl,
      });
      tracker.log(`🎉 项目生成成功！已打包: ${zipResult.filename}`);
      tracker.log(`📦 下载: ${downloadUrl}`);
    } catch (err) {
      tracker.update(TASK_STATES.SUCCESS, 100, "完成（打包失败）", `项目已生成，但打包失败: ${err.message}`);
    }
  } else {
    tracker.update(TASK_STATES.FAILED, 100, "验证失败", "项目未能通过验证");
  }
}

async function verifyProject(outputDir, tracker) {
  // 检查是否有入口文件
  const entryFiles = ["index.js", "app.js", "main.js", "server.js"];
  const hasEntry = entryFiles.some((f) => fs.pathExistsSync(path.join(outputDir, f)));
  const hasPkg = fs.pathExistsSync(path.join(outputDir, "package.json"));

  if (!hasEntry && !hasPkg) {
    tracker.log("❌ 无入口文件且无 package.json");
    return false;
  }

  // 如果有 package.json，尝试 npm install + 验证启动
  if (hasPkg) {
    tracker.log("📦 安装依赖...");
    const installResult = require("./shell-runner").safeExec("npm install", outputDir, 60000);
    if (!installResult.success) {
      tracker.log(`⚠️ npm install 失败: ${installResult.output.slice(0, 100)}`);
      // 不算致命错误，可能不需要依赖
    }
  }

  // 尝试启动项目
  tracker.log("🚀 尝试启动项目...");
  const startCmd = hasPkg ? "npm start" : `node ${entryFiles.find((f) => fs.pathExistsSync(path.join(outputDir, f))) || "index.js"}`;

  return new Promise((resolve) => {
    const { spawn } = require("child_process");
    const IS_WINDOWS = process.platform === "win32";

    const proc = spawn(startCmd, [], {
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

    proc.on("exit", (code) => {
      if (resolved) return;
      resolved = true;
      if (code === 0) {
        tracker.log("✅ 项目正常退出");
        resolve(true);
      } else {
        tracker.log(`⚠️ 退出码: ${code}`);
        // 如果有输出，认为部分成功
        resolve(stdout.length > 0);
      }
    });

    proc.on("error", () => {
      if (resolved) return;
      resolved = true;
      resolve(false);
    });

    // 超时：检查是否有成功标志
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      proc.kill("SIGTERM");

      const combined = (stdout + stderr).toLowerCase();
      const success = ["listening", "server started", "running on", "http://localhost", "http://127.0.0.1"]
        .some((p) => combined.includes(p));

      if (success) {
        tracker.log("✅ 项目成功启动");
      } else if (stdout.length > 0) {
        tracker.log("⚠️ 项目有输出但未检测到成功标志");
      } else {
        tracker.log("❌ 项目启动超时");
      }
      resolve(success);
    }, 15000);
  });
}

// 启动 Worker
startWorker().catch((err) => {
  console.error("Worker 启动失败:", err.message);
  process.exit(1);
});
