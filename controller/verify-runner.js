/**
 * Verify Runner 模块 V5
 * V4 基础 + 支持自定义 outputDir
 */

const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs-extra");
const { getExecOptions, isWindows } = require("../utils/platform");
const { logError } = require("../utils/error-log");

const RUN_TIMEOUT = 15000;

class VerifyRunner {
  constructor(outputDir) {
    this.OUTPUT_DIR = outputDir || path.join(__dirname, "..", "output");
    this.process = null;
    this.logs = "";
  }

  async fullVerify() {
    console.log("\n   🔍 [VerifyRunner] 开始验证项目...\n");

    const structureCheck = this._checkStructure();
    if (!structureCheck.ok) {
      return { success: false, error: structureCheck.error, logs: "" };
    }

    if (structureCheck.hasPackageJson) {
      const installResult = await this._npmInstall();
      if (!installResult.success) {
        return { success: false, error: `npm install 失败: ${installResult.error}`, logs: installResult.logs };
      }
    }

    const runResult = await this._runProject(structureCheck);
    this.stop();
    return runResult;
  }

  _checkStructure() {
    const pkgPath = path.join(this.OUTPUT_DIR, "package.json");
    const hasPackageJson = fs.pathExistsSync(pkgPath);

    if (!hasPackageJson) {
      const entryFiles = ["index.js", "app.js", "main.js", "server.js"];
      const hasEntry = entryFiles.some((f) => fs.pathExistsSync(path.join(this.OUTPUT_DIR, f)));
      if (!hasEntry) {
        return { ok: false, error: "项目无入口文件且无 package.json" };
      }
      return { ok: true, hasPackageJson: false, entry: entryFiles.find((f) => fs.pathExistsSync(path.join(this.OUTPUT_DIR, f))) };
    }

    try {
      const pkg = fs.readJsonSync(pkgPath);
      const entry = pkg.main || "index.js";
      const scripts = pkg.scripts || {};
      return {
        ok: true,
        hasPackageJson: true,
        entry,
        scripts,
        hasStartScript: !!scripts.start,
        hasTestScript: !!scripts.test,
        hasDeps: !!(pkg.dependencies && Object.keys(pkg.dependencies).length > 0),
        nodeModulesExists: fs.pathExistsSync(path.join(this.OUTPUT_DIR, "node_modules")),
      };
    } catch (err) {
      return { ok: false, error: `package.json 解析失败: ${err.message}` };
    }
  }

  async _npmInstall() {
    console.log("   📦 安装依赖: npm install");
    try {
      const opts = getExecOptions(this.OUTPUT_DIR);
      opts.timeout = 60000;
      const output = execSync("npm install", opts);
      console.log("   ✅ 依赖安装成功");
      return { success: true, logs: (output || "").trim() };
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString().trim() : "";
      const stdout = err.stdout ? err.stdout.toString().trim() : "";
      logError("npm-install", err);
      return { success: false, error: stderr || stdout || err.message, logs: stderr || stdout };
    }
  }

  async _runProject(structure) {
    this.logs = "";

    let command, args;
    if (structure.hasPackageJson && structure.hasStartScript) {
      command = "npm";
      args = ["start"];
    } else {
      const entry = structure.entry || "index.js";
      command = "node";
      args = [entry];
    }

    console.log(`   🚀 启动项目: ${command} ${args.join(" ")}`);

    return new Promise((resolve) => {
      try {
        this.process = spawn(command, args, {
          cwd: this.OUTPUT_DIR,
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });

        let stdout = "";
        let stderr = "";
        let resolved = false;

        this.process.stdout.on("data", (data) => {
          const chunk = data.toString();
          stdout += chunk;
          this.logs += chunk;
        });

        this.process.stderr.on("data", (data) => {
          const chunk = data.toString();
          stderr += chunk;
          this.logs += chunk;
        });

        this.process.on("error", (err) => {
          if (resolved) return;
          resolved = true;
          logError("verify-spawn", err);
          resolve({ success: false, error: `进程启动失败: ${err.message}`, logs: this.logs });
        });

        this.process.on("exit", (code, signal) => {
          if (resolved) return;
          resolved = true;

          if (code === 0) {
            console.log("   ✅ 项目正常退出 (exit code 0)");
            resolve({ success: true, error: null, logs: this.logs });
          } else if (code === null && signal === "SIGTERM") {
            if (this._checkStartupSuccess(stdout, stderr)) {
              console.log("   ✅ 项目成功启动并响应");
              resolve({ success: true, error: null, logs: this.logs });
            } else {
              resolve({ success: false, error: "项目未能成功启动", logs: this.logs });
            }
          } else {
            const errMsg = stderr || stdout || `exit code ${code}`;
            resolve({ success: false, error: `项目异常退出: ${errMsg.slice(0, 300)}`, logs: this.logs });
          }
        });

        setTimeout(() => {
          if (resolved) return;
          resolved = true;

          if (this._checkStartupSuccess(stdout, stderr)) {
            console.log("   ✅ 项目成功启动（超时保护停止）");
            resolve({ success: true, error: null, logs: this.logs });
          } else {
            resolve({ success: false, error: "项目启动超时，未检测到成功标志", logs: this.logs });
          }
          this.stop();
        }, RUN_TIMEOUT);
      } catch (err) {
        logError("verify-run", err);
        resolve({ success: false, error: `运行异常: ${err.message}`, logs: this.logs });
      }
    });
  }

  _checkStartupSuccess(stdout, stderr) {
    const combined = (stdout + "\n" + stderr).toLowerCase();
    const successPatterns = [
      "listening", "server started", "running on", "started on",
      "ready on", "available on", "app listening", "express started",
      "listening on port", "started server", "server running",
      "http://localhost", "http://127.0.0.1",
    ];
    for (const pattern of successPatterns) {
      if (combined.includes(pattern)) return true;
    }
    if (stdout.length > 0 && !stderr.includes("error") && !stderr.includes("Error")) return true;
    return false;
  }

  stop() {
    if (this.process && !this.process.killed) {
      try {
        if (isWindows) {
          execSync(`taskkill /pid ${this.process.pid} /T /F`, { windowsHide: true });
        } else {
          this.process.kill("SIGTERM");
        }
      } catch (e) { /* ignore */ }
      this.process = null;
    }
  }
}

module.exports = VerifyRunner;
