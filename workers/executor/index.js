/**
 * Executor — 文件操作 + Shell 执行
 */

const fs = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process");

const IS_WINDOWS = process.platform === "win32";

const COMMAND_MAP = {
  chmod: { action: "skip" },
  chown: { action: "skip" },
  "rm -rf": { win: "rmdir /s /q", unix: "rm -rf" },
  cat: { win: "type", unix: "cat" },
  ls: { win: "dir", unix: "ls" },
};

function adaptCommand(cmd) {
  const trimmed = cmd.trim();
  for (const [pattern, rule] of Object.entries(COMMAND_MAP)) {
    if (trimmed.startsWith(pattern) || trimmed === pattern) {
      if (rule.action === "skip") return { command: null, skipped: true };
      if (IS_WINDOWS && rule.win) return { command: trimmed.replace(pattern, rule.win), skipped: false };
    }
  }
  return { command: trimmed, skipped: false };
}

function safeExec(command, cwd, timeout = 30000) {
  const adapted = adaptCommand(command);
  if (adapted.skipped) return { success: true, output: "skipped", skipped: true };

  try {
    const output = execSync(adapted.command, {
      cwd,
      encoding: "utf-8",
      timeout,
      shell: IS_WINDOWS ? "cmd.exe" : "/bin/sh",
      windowsHide: true,
    });
    return { success: true, output: (output || "").trim() };
  } catch (err) {
    return {
      success: false,
      output: (err.stderr || err.stdout || err.message || "").toString().slice(0, 500),
    };
  }
}

async function executeStep(step, outputDir) {
  switch (step.action) {
    case "create_file": {
      const filePath = path.join(outputDir, step.target);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, step.content, "utf-8");
      return { file: step.target };
    }
    case "edit_file": {
      const filePath = path.join(outputDir, step.target);
      if (!(await fs.pathExists(filePath))) throw new Error(`文件不存在: ${step.target}`);
      await fs.writeFile(filePath, step.content, "utf-8");
      return { file: step.target };
    }
    case "run_command": {
      const result = safeExec(step.target, outputDir);
      if (!result.success) throw new Error(result.output);
      return { command: step.target, output: result.output };
    }
    case "done":
      return { message: "done" };
    default:
      throw new Error(`未知操作: ${step.action}`);
  }
}

async function executeSteps(steps, outputDir, onStep) {
  const results = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (onStep) onStep(i + 1, steps.length, step.description);

    try {
      const result = await executeStep(step, outputDir);
      results.push({ step: i + 1, success: true, ...result });
    } catch (err) {
      results.push({ step: i + 1, success: false, error: err.message });
    }
  }
  return results;
}

function getFileTree(outputDir) {
  try {
    const walk = (dir, prefix = "") => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      let result = "";
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          result += `📁 ${relPath}/\n` + walk(path.join(dir, entry.name), relPath);
        } else {
          result += `📄 ${relPath}\n`;
        }
      }
      return result;
    };
    return walk(outputDir) || "(空)";
  } catch {
    return "(无法读取)";
  }
}

module.exports = { executeStep, executeSteps, safeExec, getFileTree };
