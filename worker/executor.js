/**
 * Executor — 逐步执行计划
 */

const path = require("path");
const fs = require("fs-extra");
const fileSystem = require("./file-system");
const shellRunner = require("./shell-runner");
const { TASK_STATES } = require("../shared/types");

async function executeSteps(steps, outputDir, tracker) {
  const results = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    tracker.log(`步骤 ${i + 1}/${steps.length}: ${step.description}`);

    try {
      const result = await executeStep(step, outputDir);
      results.push({ step: i + 1, success: true, ...result });
      tracker.log(`  ✅ 成功`);
    } catch (err) {
      results.push({ step: i + 1, success: false, error: err.message });
      tracker.log(`  ❌ 失败: ${err.message}`);
    }
  }

  return results;
}

async function executeStep(step, outputDir) {
  switch (step.action) {
    case "create_file":
      await fileSystem.writeFile(outputDir, step.target, step.content);
      return { file: step.target };

    case "edit_file":
      if (!(await fileSystem.fileExists(outputDir, step.target))) {
        throw new Error(`文件不存在: ${step.target}`);
      }
      await fileSystem.writeFile(outputDir, step.target, step.content);
      return { file: step.target };

    case "run_command":
      const result = shellRunner.safeExec(step.target, outputDir);
      if (!result.success) throw new Error(result.output);
      return { command: step.target, output: result.output };

    case "done":
      return { message: "done" };

    default:
      throw new Error(`未知操作: ${step.action}`);
  }
}

module.exports = { executeSteps };
