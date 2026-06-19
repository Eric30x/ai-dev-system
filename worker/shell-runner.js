/**
 * Shell Runner — 跨平台安全命令执行
 */

const { execSync } = require("child_process");
const os = require("os");

const IS_WINDOWS = process.platform === "win32";

// 命令适配表
const COMMAND_MAP = {
  chmod: { action: "skip", reason: "Windows 不支持 chmod" },
  chown: { action: "skip", reason: "Windows 不支持 chown" },
  "rm -rf": { win: "rmdir /s /q", unix: "rm -rf" },
  "rm -r": { win: "rmdir /s /q", unix: "rm -r" },
  cat: { win: "type", unix: "cat" },
  ls: { win: "dir", unix: "ls" },
};

function adaptCommand(command) {
  const trimmed = command.trim();

  for (const [pattern, rule] of Object.entries(COMMAND_MAP)) {
    if (trimmed.startsWith(pattern) || trimmed === pattern) {
      if (rule.action === "skip") return { command: null, skipped: true, reason: rule.reason };
      if (IS_WINDOWS && rule.win) {
        return { command: trimmed.replace(pattern, rule.win), skipped: false, reason: `${pattern} → ${rule.win}` };
      }
    }
  }

  return { command: trimmed, skipped: false, reason: null };
}

function safeExec(command, cwd, timeout = 30000) {
  const adapted = adaptCommand(command);

  if (adapted.skipped) {
    return { success: true, output: adapted.reason, skipped: true };
  }

  try {
    const output = execSync(adapted.command, {
      cwd,
      encoding: "utf-8",
      timeout,
      shell: IS_WINDOWS ? "cmd.exe" : "/bin/sh",
      windowsHide: true,
    });
    return { success: true, output: (output || "").trim(), skipped: false };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : "";
    const stdout = err.stdout ? err.stdout.toString().trim() : "";
    return {
      success: false,
      output: (stderr || stdout || err.message).slice(0, 500),
      skipped: false,
    };
  }
}

module.exports = { safeExec, adaptCommand, IS_WINDOWS };
