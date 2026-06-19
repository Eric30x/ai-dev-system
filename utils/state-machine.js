/**
 * 状态机模块 V4
 * 职责：管理系统全局状态，记录状态转换日志
 *
 * 状态流转：
 *   INIT → PLANNING → EXECUTING → VERIFYING → SUCCESS
 *                ↓          ↓          ↓
 *             FAILED ←──── FIXING ←─── FAILED
 */

const fs = require("fs-extra");
const path = require("path");
const { logError } = require("./error-log");

const STATES = {
  INIT: "INIT",
  PLANNING: "PLANNING",
  EXECUTING: "EXECUTING",
  RUNNING: "RUNNING",
  VERIFYING: "VERIFYING",
  FIXING: "FIXING",
  FAILED: "FAILED",
  SUCCESS: "SUCCESS",
};

// 合法的状态转换
const TRANSITIONS = {
  [STATES.INIT]: [STATES.PLANNING, STATES.FAILED],
  [STATES.PLANNING]: [STATES.EXECUTING, STATES.FAILED],
  [STATES.EXECUTING]: [STATES.VERIFYING, STATES.RUNNING, STATES.FIXING, STATES.FAILED],
  [STATES.RUNNING]: [STATES.VERIFYING, STATES.FAILED, STATES.FIXING],
  [STATES.VERIFYING]: [STATES.SUCCESS, STATES.FAILED, STATES.FIXING],
  [STATES.FIXING]: [STATES.EXECUTING, STATES.VERIFYING, STATES.FAILED],
  [STATES.FAILED]: [STATES.FIXING, STATES.INIT],
  [STATES.SUCCESS]: [],
};

const STATE_ICONS = {
  INIT: "🔧",
  PLANNING: "🧠",
  EXECUTING: "⚡",
  RUNNING: "🚀",
  VERIFYING: "🔍",
  FIXING: "🩹",
  FAILED: "❌",
  SUCCESS: "✅",
};

const LOG_FILE = path.join(__dirname, "..", "logs", "state.log");

class StateMachine {
  constructor() {
    this.state = STATES.INIT;
    this.history = [];
    this._log("INIT", "系统初始化");
  }

  /**
   * 转换状态
   */
  transition(newState, reason = "") {
    const allowed = TRANSITIONS[this.state] || [];
    if (!allowed.includes(newState)) {
      const msg = `非法状态转换: ${this.state} → ${newState}`;
      logError("state-machine", new Error(msg));
      // 不阻塞，强制转换并记录
      console.log(`   ⚠️  ${msg}（强制转换）`);
    }

    const oldState = this.state;
    this.state = newState;
    this.history.push({ from: oldState, to: newState, reason, time: new Date().toISOString() });
    this._log(newState, reason);
  }

  /**
   * 获取当前状态
   */
  getState() {
    return this.state;
  }

  /**
   * 是否处于终态
   */
  isTerminal() {
    return this.state === STATES.SUCCESS || this.state === STATES.FAILED;
  }

  /**
   * 记录状态日志
   */
  _log(state, reason) {
    const icon = STATE_ICONS[state] || "❓";
    const line = `[${new Date().toISOString()}] ${icon} ${state}${reason ? ": " + reason : ""}\n`;
    fs.appendFileSync(LOG_FILE, line, "utf-8");
    console.log(`\n   ${icon} [State] → ${state}${reason ? " — " + reason : ""}`);
  }

  /**
   * 获取状态历史（用于 debug）
   */
  getHistory() {
    return this.history;
  }
}

module.exports = { StateMachine, STATES };
