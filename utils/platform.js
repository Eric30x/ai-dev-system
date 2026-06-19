/**
 * 平台检测与命令适配模块
 * 职责：识别运行环境，转换不兼容的 shell 命令
 */

const os = require("os");

const platform = process.platform; // 'win32' | 'darwin' | 'linux'
const isWindows = platform === "win32";
const isMac = platform === "darwin";
const isLinux = platform === "linux";

// Windows 不支持的 Unix 命令 → 替换方案
const COMMAND_MAP = {
  // 权限相关：Windows 无 chmod，直接跳过
  chmod: { action: "skip", reason: "Windows 不支持 chmod，已跳过" },
  chown: { action: "skip", reason: "Windows 不支持 chown，已跳过" },

  // 文件操作替换
  "rm -rf": { action: "replace", win: "rmdir /s /q", unix: "rm -rf" },
  "rm -r": { action: "replace", win: "rmdir /s /q", unix: "rm -r" },
  rm: { action: "replace", win: "del", unix: "rm" },
  cat: { action: "replace", win: "type", unix: "cat" },
  cp: { action: "replace", win: "copy", unix: "cp" },
  mv: { action: "replace", win: "move", unix: "mv" },
  mkdir: { action: "replace", win: "mkdir", unix: "mkdir" },
  touch: { action: "replace", win: "type nul >", unix: "touch" },
  pwd: { action: "replace", win: "cd", unix: "pwd" },
  ls: { action: "replace", win: "dir", unix: "ls" },
  which: { action: "replace", win: "where", unix: "which" },
  clear: { action: "replace", win: "cls", unix: "clear" },

  // npm/node 跨平台通用，不需要替换
  // npx, npm, node, git 都是跨平台的
};

/**
 * 获取当前平台信息
 */
function getPlatformInfo() {
  return {
    platform,
    isWindows,
    isMac,
    isLinux,
    arch: os.arch(),
    shell: isWindows ? "cmd.exe" : "/bin/sh",
    nodeVersion: process.version,
  };
}

/**
 * 适配命令以兼容当前平台
 * @param {string} command - 原始命令
 * @returns {{ command: string|null, skipped: boolean, reason: string, adapted: boolean }}
 */
function adaptCommand(command) {
  const trimmed = command.trim();

  // 检查是否需要跳过（如 chmod）
  for (const [pattern, rule] of Object.entries(COMMAND_MAP)) {
    if (trimmed.startsWith(pattern) || trimmed === pattern) {
      if (rule.action === "skip") {
        return { command: null, skipped: true, reason: rule.reason, adapted: true };
      }
      if (rule.action === "replace" && isWindows) {
        const replaced = trimmed.replace(pattern, rule.win);
        return { command: replaced, skipped: false, reason: `已替换: ${pattern} → ${rule.win}`, adapted: true };
      }
    }
  }

  // Windows: 将 && 连接的命令也逐个检查
  if (isWindows && trimmed.includes("&&")) {
    const parts = trimmed.split("&&").map((p) => p.trim());
    const adapted = parts.map((p) => adaptCommand(p));
    const skipped = adapted.filter((a) => a.skipped);
    const replaced = adapted.map((a) => a.command || "").filter(Boolean);
    if (skipped.length > 0) {
      return {
        command: replaced.join(" && ") || null,
        skipped: replaced.length === 0,
        reason: skipped.map((s) => s.reason).join("; "),
        adapted: true,
      };
    }
    return { command: replaced.join(" && "), skipped: false, reason: "", adapted: false };
  }

  return { command: trimmed, skipped: false, reason: "", adapted: false };
}

/**
 * 设置 shell 选项（Windows 用 cmd，Unix 用 sh）
 */
function getExecOptions(cwd) {
  if (isWindows) {
    return {
      cwd,
      encoding: "utf-8",
      timeout: 30000,
      shell: "cmd.exe",
      windowsHide: true,
    };
  }
  return {
    cwd,
    encoding: "utf-8",
    timeout: 30000,
    shell: "/bin/sh",
  };
}

module.exports = {
  platform,
  isWindows,
  isMac,
  isLinux,
  getPlatformInfo,
  adaptCommand,
  getExecOptions,
};
