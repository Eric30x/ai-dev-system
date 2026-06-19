/**
 * Executor 模块 V5
 * V4 基础 + 支持自定义 outputDir（workspace 隔离）
 */

const fs = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process");
const { getPlatformInfo, adaptCommand, getExecOptions } = require("../utils/platform");
const { logError, parseError } = require("../utils/error-log");

function ok(output, extra) {
  return { success: true, error: null, output: output || "", ...extra };
}
function fail(error, extra) {
  return { success: false, error: error, output: "", ...extra };
}

class Executor {
  constructor(outputDir) {
    this.OUTPUT_DIR = outputDir || path.join(__dirname, "..", "output");
    this.results = [];
    this.failures = [];
  }

  async execute(steps) {
    console.log("\n🔧 [Executor] 开始执行计划...\n");
    const info = getPlatformInfo();
    console.log(`   🖥️  平台: ${info.platform} (${info.arch})`);
    console.log(`   📦 Node: ${info.nodeVersion}`);
    console.log(`   🐚 Shell: ${info.shell}\n`);

    this.results = [];
    this.failures = [];
    await fs.ensureDir(this.OUTPUT_DIR);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.log(`--- 步骤 ${i + 1}/${steps.length}: ${step.description} ---`);
      const result = await this._safeExecuteStep(step, i + 1);
      this.results.push({ step: i + 1, ...result });

      if (result.success) {
        console.log(`   ✅ 成功\n`);
      } else {
        this.failures.push({ step: i + 1, error: result.error });
        console.log(`   ⚠️  失败（继续）: ${result.error}\n`);
      }
    }

    if (this.failures.length > 0) {
      console.log(`\n⚠️  ${this.failures.length} 个步骤失败，流程继续执行完毕：`);
      this.failures.forEach((f) => console.log(`   · 步骤 ${f.step}: ${f.error}`));
      console.log();
    }

    console.log("🏁 [Executor] 执行完毕\n");
    return this.results;
  }

  async _safeExecuteStep(step, stepNum) {
    try {
      const result = await this._executeStep(step);
      const verification = await this._verify(step, result);
      if (!verification.ok) {
        const errMsg = `验证失败: ${verification.reason}`;
        logError(`step-${stepNum}-verify`, new Error(errMsg));
        return fail(errMsg, result);
      }
      return ok(result.output || "", result);
    } catch (err) {
      logError(`step-${stepNum}`, err);
      const parsed = parseError(err);
      return fail(`${parsed.hint} — ${err.message}`);
    }
  }

  async _executeStep(step) {
    switch (step.action) {
      case "create_file": return this._createFile(step.target, step.content);
      case "edit_file": return this._editFile(step.target, step.content);
      case "run_command": return this._runCommand(step.target);
      case "done":
        console.log("   🎉 所有任务已完成");
        return { output: "done" };
      default: throw new Error(`未知操作: ${step.action}`);
    }
  }

  async _verify(step, result) {
    if (step.action === "create_file" || step.action === "edit_file") {
      const filePath = path.join(this.OUTPUT_DIR, step.target);
      if (!(await fs.pathExists(filePath))) return { ok: false, reason: `文件未创建: ${step.target}` };
      const stat = await fs.stat(filePath);
      if (stat.size === 0 && step.content && step.content.length > 0) return { ok: false, reason: `文件为空: ${step.target}` };
      return { ok: true };
    }
    if (step.action === "run_command") {
      if (result && result.skipped) return { ok: true };
      return { ok: true };
    }
    return { ok: true };
  }

  async _createFile(target, content) {
    const filePath = path.join(this.OUTPUT_DIR, target);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, "utf-8");
    console.log(`   📄 已创建: ${target}`);
    return { file: target };
  }

  async _editFile(target, content) {
    const filePath = path.join(this.OUTPUT_DIR, target);
    if (!(await fs.pathExists(filePath))) throw new Error(`文件不存在: ${target}`);
    await fs.writeFile(filePath, content, "utf-8");
    console.log(`   ✏️  已编辑: ${target}`);
    return { file: target };
  }

  async _runCommand(command) {
    const adapted = adaptCommand(command);
    if (adapted.skipped) {
      console.log(`   ⏭️  跳过: ${adapted.reason}`);
      return { command, skipped: true, output: adapted.reason };
    }
    if (adapted.adapted) console.log(`   🔄 适配: ${adapted.reason}`);

    console.log(`   ⚡ 执行: ${adapted.command}`);
    const opts = getExecOptions(this.OUTPUT_DIR);
    try {
      const output = execSync(adapted.command, opts);
      return { command: adapted.command, output: (output || "").trim() };
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString().trim() : "";
      const stdout = err.stdout ? err.stdout.toString().trim() : "";
      const detail = stderr || stdout || err.message;
      throw new Error(`命令失败: ${detail.slice(0, 300)}`);
    }
  }
}

module.exports = Executor;
