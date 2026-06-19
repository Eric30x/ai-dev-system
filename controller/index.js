/**
 * Controller 模块 V6 — 闭环验证 + 状态机 + 无限自愈 + 进度回调
 */

require("dotenv").config({ path: __dirname + "/../.env" });

const Planner = require("./planner");
const Executor = require("./executor");
const VerifyRunner = require("./verify-runner");
const { StateMachine, STATES } = require("../utils/state-machine");
const { logError } = require("../utils/error-log");

const MAX_FIX_ROUNDS = 10;
const MAX_VERIFY_RETRIES = 5;

class Controller {
  /**
   * @param {string} outputDir — 该任务的工作目录
   * @param {Function} progressCallback — 进度回调函数
   */
  constructor(outputDir, progressCallback) {
    this.outputDir = outputDir || require("path").join(__dirname, "..", "output");
    this.planner = new Planner(this.outputDir);
    this.executor = new Executor(this.outputDir);
    this.verifier = new VerifyRunner(this.outputDir);
    this.stateMachine = new StateMachine();
    this.errorHistory = [];
    this.previousFixes = [];
    this.progressCallback = progressCallback || (() => {});
  }

  /**
   * 发送进度事件
   */
  _emit(event) {
    try {
      this.progressCallback(event);
    } catch (e) {
      // 回调不应阻塞主流程
    }
  }

  async run(task) {
    this._emit({ type: "log", message: `📌 任务: ${task}` });

    if (!process.env.ANTHROPIC_API_KEY) {
      const err = "未设置 ANTHROPIC_API_KEY 环境变量";
      logError("init", new Error(err));
      return this._finalResult([], [], false, err);
    }

    // ─── Phase 1: 规划 ───
    this._emit({ type: "state_change", state: "PLANNING", reason: "开始任务规划" });
    this.stateMachine.transition(STATES.PLANNING, "开始任务规划");

    let plan;
    try {
      plan = await this.planner.plan(task);
    } catch (err) {
      logError("planning", err);
      this.stateMachine.transition(STATES.FAILED, `规划失败: ${err.message}`);
      this._emit({ type: "state_change", state: "FAILED", reason: err.message });
      return this._finalResult([], [], false, err.message);
    }

    // ─── Phase 2: 执行 ───
    this._emit({ type: "state_change", state: "EXECUTING", reason: `执行 ${plan.length} 个步骤` });
    this.stateMachine.transition(STATES.EXECUTING, `执行 ${plan.length} 个步骤`);
    let results = await this._executeWithProgress(plan);

    for (let round = 1; round <= MAX_FIX_ROUNDS; round++) {
      const failures = results.filter((r) => !r.success);
      if (failures.length === 0) break;

      this._emit({ type: "state_change", state: "FIXING", reason: `执行修复 第${round}轮` });
      this.stateMachine.transition(STATES.FIXING, `执行修复 第${round}轮`);
      results = await this._fixExecutionFailures(failures, plan, results, round);
    }

    // ─── Phase 3: 运行验证 ───
    const verified = await this._verificationLoop();

    // ─── Phase 4: 最终结果 ───
    if (verified) {
      this._emit({ type: "state_change", state: "SUCCESS", reason: "项目验证通过" });
      this.stateMachine.transition(STATES.SUCCESS, "项目验证通过");
    } else {
      this._emit({ type: "state_change", state: "FAILED", reason: "验证失败" });
      this.stateMachine.transition(STATES.FAILED, `验证失败，已尝试 ${MAX_VERIFY_RETRIES} 轮修复`);
    }

    return this._finalResult(plan, results, verified);
  }

  /**
   * 带进度回调的执行
   */
  async _executeWithProgress(steps) {
    const results = [];
    const failures = [];

    await require("fs-extra").ensureDir(this.outputDir);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      this._emit({
        type: "step_start",
        step: i + 1,
        total: steps.length,
        description: step.description,
      });

      const result = await this.executor._safeExecuteStep(step, i + 1);
      results.push({ step: i + 1, ...result });

      this._emit({
        type: "step_complete",
        step: i + 1,
        success: result.success,
      });

      if (!result.success) {
        failures.push({ step: i + 1, error: result.error });
      }
    }

    return results;
  }

  async _fixExecutionFailures(failures, plan, results, round) {
    const fixSteps = [];

    for (const failure of failures) {
      const originalStep = plan[failure.step - 1];
      if (!originalStep) continue;

      this.errorHistory.push({ step: failure.step, error: failure.error, round });
      this._emit({ type: "log", message: `🔧 修复步骤 ${failure.step}: ${failure.error}` });

      const fix = await this.planner.generateFix({
        failedStep: originalStep,
        errorMessage: failure.error,
        runtimeLogs: "",
        errorHistory: this.errorHistory.map((e) => `步骤${e.step}: ${e.error}`),
        previousFixes: this.previousFixes,
        retryCount: round,
      });
      fixSteps.push(...fix);
    }

    if (fixSteps.length === 0) {
      this._emit({ type: "log", message: "⚠️ 无法生成修复方案" });
      return results;
    }

    this.previousFixes.push({ round, steps: fixSteps.length });

    // 修复步骤也带进度
    const fixResults = [];
    for (let i = 0; i < fixSteps.length; i++) {
      this._emit({
        type: "step_start",
        step: i + 1,
        total: fixSteps.length,
        description: `[修复] ${fixSteps[i].description}`,
      });

      const result = await this.executor._safeExecuteStep(fixSteps[i], i + 1);
      fixResults.push({ step: i + 1, ...result });

      this._emit({ type: "step_complete", step: i + 1, success: result.success });
    }

    const newResults = results.filter((r) => r.success);
    return [...newResults, ...fixResults];
  }

  async _verificationLoop() {
    for (let attempt = 1; attempt <= MAX_VERIFY_RETRIES; attempt++) {
      this._emit({ type: "state_change", state: "VERIFYING", reason: `验证尝试 ${attempt}/${MAX_VERIFY_RETRIES}` });
      this.stateMachine.transition(STATES.VERIFYING, `验证尝试 ${attempt}/${MAX_VERIFY_RETRIES}`);

      this._emit({ type: "log", message: `🔍 运行验证 (${attempt}/${MAX_VERIFY_RETRIES})...` });
      const verifyResult = await this.verifier.fullVerify();

      if (verifyResult.success) {
        this._emit({ type: "log", message: "✅ 项目验证通过！项目可正常运行" });
        return true;
      }

      this._emit({ type: "log", message: `❌ 验证失败: ${verifyResult.error}` });

      this.errorHistory.push({ step: "verify", error: verifyResult.error, round: attempt });
      this._emit({ type: "state_change", state: "FIXING", reason: `验证修复 第${attempt}轮` });
      this.stateMachine.transition(STATES.FIXING, `验证失败修复 第${attempt}轮`);

      const fixSteps = await this.planner.generateVerificationFix({
        verifyError: verifyResult.error,
        verifyLogs: verifyResult.logs,
        previousFixes: this.previousFixes,
        retryCount: attempt,
      });

      if (fixSteps.length === 0) {
        this._emit({ type: "log", message: "⚠️ 无法生成验证修复方案" });
        continue;
      }

      this.previousFixes.push({ round: attempt, type: "verify-fix", steps: fixSteps.length });
      this._emit({ type: "state_change", state: "EXECUTING", reason: "执行验证修复" });
      this.stateMachine.transition(STATES.EXECUTING, "执行验证修复步骤");

      for (let i = 0; i < fixSteps.length; i++) {
        this._emit({
          type: "step_start",
          step: i + 1,
          total: fixSteps.length,
          description: `[验证修复] ${fixSteps[i].description}`,
        });
        const result = await this.executor._safeExecuteStep(fixSteps[i], i + 1);
        this._emit({ type: "step_complete", step: i + 1, success: result.success });
      }
    }

    return false;
  }

  _finalResult(plan, results, verified, errorMsg) {
    const success = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      plan,
      results,
      summary: { success, failed },
      verified,
      outputDir: this.outputDir,
      error: errorMsg || null,
    };
  }
}

module.exports = Controller;
