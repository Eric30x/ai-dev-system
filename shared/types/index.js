/**
 * V9 共享类型常量
 */

const PROJECT_STATES = {
  PENDING: "PENDING",
  PLANNING: "PLANNING",
  EXECUTING: "EXECUTING",
  VERIFYING: "VERIFYING",
  FIXING: "FIXING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
};

const TASK_TYPES = {
  PLAN: "plan",
  EXECUTE: "execute",
  VERIFY: "verify",
  FIX: "fix",
};

const PLANS = {
  FREE: "FREE",
  PRO: "PRO",
  ENTERPRISE: "ENTERPRISE",
};

const LOG_LEVELS = {
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
  DEBUG: "debug",
};

module.exports = { PROJECT_STATES, TASK_TYPES, PLANS, LOG_LEVELS };
