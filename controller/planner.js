/**
 * Planner 模块 V5
 * V4 基础 + 支持自定义 outputDir
 */

const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs-extra");
const path = require("path");
const { logError } = require("../utils/error-log");

const SYSTEM_PROMPT = `你是一个软件开发规划器。用户会给你一个开发任务描述，你需要将其分解为具体的执行步骤。

你必须返回一个 JSON 数组，每个步骤是一个对象，包含以下字段：
- action: 操作类型，可选值为 "create_file" | "edit_file" | "run_command" | "done"
- target: 目标文件路径（create_file/edit_file 时）或命令字符串（run_command 时），done 时为空字符串
- content: 文件内容（create_file/edit_file 时），done 时为空字符串
- description: 这一步的简短中文说明

规则：
1. 只返回 JSON 数组，不要有任何其他文字
2. 第一步通常是创建项目目录结构
3. 最后一步必须是 {"action":"done","target":"","content":"","description":"所有任务完成"}
4. 文件路径使用相对路径
5. 代码内容要完整可运行
6. run_command 优先使用跨平台兼容命令（npm/node/git），避免 chmod/chown 等 Unix 专有命令
7. 如果必须用 shell 命令，优先使用 npm scripts 或 node 脚本代替
8. package.json 中必须有 start script`;

const FIX_PROMPT_V4 = `你是一个错误修复专家。一个自动化开发项目执行/运行失败了，你需要生成 patch 级修复方案。

=== 失败的步骤 ===
{step_json}

=== 错误信息 ===
{error_message}

=== 运行日志（如有） ===
{runtime_logs}

=== 项目文件结构 ===
{file_tree}

=== 之前的修复尝试 ===
{previous_fixes}

=== 平台信息 ===
{platform}

请返回一个 JSON 数组，包含修复步骤（1~3步）。只返回 JSON 数组，不要有其他文字。

规则：
1. 只修复导致失败的部分，不要重写整个项目
2. 如果是依赖缺失，添加 npm install 步骤
3. 如果是语法错误，只编辑出错的文件
4. 如果是端口冲突，修改端口号
5. 如果是命令失败，考虑跨平台兼容性
6. 参考之前的修复尝试，不要重复失败的操作`;

class Planner {
  constructor(outputDir) {
    this.client = new Anthropic();
    this.model = process.env.MODEL_NAME || "claude-sonnet-4-20250514";
    this.OUTPUT_DIR = outputDir || path.join(__dirname, "..", "output");
  }

  async _callLLM(systemPrompt, userContent) {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 8096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    return (textBlock?.text || "").trim();
  }

  _extractJSON(text) {
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) return JSON.parse(arrMatch[0]);
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) return JSON.parse(objMatch[0]);
    throw new Error("无法从 LLM 响应中提取 JSON");
  }

  _getFileTree() {
    try {
      const walk = (dir, prefix = "") => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        let result = "";
        for (const entry of entries) {
          if (entry.name === "node_modules" || entry.name === ".git") continue;
          const fullPath = path.join(dir, entry.name);
          const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            result += `📁 ${relPath}/\n`;
            result += walk(fullPath, relPath);
          } else {
            const stat = fs.statSync(fullPath);
            result += `📄 ${relPath} (${stat.size}B)\n`;
          }
        }
        return result;
      };
      return walk(this.OUTPUT_DIR) || "(空目录)";
    } catch {
      return "(无法读取)";
    }
  }

  async plan(task) {
    console.log("\n🧠 [Planner] 正在分析任务并生成计划...\n");
    console.log(`   Model: ${this.model}\n`);

    const responseText = await this._callLLM(SYSTEM_PROMPT, task);
    const steps = this._extractJSON(responseText);

    console.log(`📋 [Planner] 生成了 ${steps.length} 个执行步骤：`);
    steps.forEach((step, i) => {
      const icon = step.action === "create_file" ? "📄" : step.action === "edit_file" ? "✏️" : step.action === "run_command" ? "⚡" : "✅";
      console.log(`   ${i + 1}. ${icon} ${step.description}`);
    });

    return steps;
  }

  async generateFix(context) {
    const { failedStep, errorMessage, runtimeLogs, errorHistory, previousFixes, retryCount } = context;
    console.log(`\n🔄 [Planner] 生成修复方案 (第 ${retryCount} 次重试)...`);

    const platformInfo = JSON.stringify(require("../utils/platform").getPlatformInfo());
    const fileTree = this._getFileTree();

    const prompt = FIX_PROMPT_V4
      .replace("{step_json}", JSON.stringify(failedStep, null, 2))
      .replace("{error_message}", errorMessage)
      .replace("{runtime_logs}", runtimeLogs || "(无)")
      .replace("{file_tree}", fileTree)
      .replace("{previous_fixes}", previousFixes.length > 0 ? JSON.stringify(previousFixes, null, 2) : "(首次修复)")
      .replace("{platform}", platformInfo);

    try {
      const responseText = await this._callLLM("你是错误修复专家，只返回 JSON 数组。", prompt);
      const fixSteps = this._extractJSON(responseText);
      console.log(`   🔧 生成了 ${fixSteps.length} 个修复步骤`);
      return fixSteps;
    } catch (err) {
      logError("generateFix", err);
      console.log(`   ⚠️  修复方案生成失败: ${err.message}`);
      return [];
    }
  }

  async generateVerificationFix(context) {
    const { verifyError, verifyLogs, previousFixes, retryCount } = context;
    console.log(`\n🩹 [Planner] 生成验证修复方案 (第 ${retryCount} 次)...`);

    const fileTree = this._getFileTree();
    const platformInfo = JSON.stringify(require("../utils/platform").getPlatformInfo());

    const prompt = `一个自动生成的项目运行验证失败了，需要修复。

=== 验证错误 ===
${verifyError}

=== 运行日志 ===
${verifyLogs || "(无)"}

=== 项目文件结构 ===
${fileTree}

=== 之前的修复尝试 ===
${previousFixes.length > 0 ? JSON.stringify(previousFixes, null, 2) : "(首次修复)"}

=== 平台 ===
${platformInfo}

请返回一个 JSON 数组，包含修复步骤（1~5步）。只返回 JSON 数组。

规则：
1. 只修复导致运行失败的部分
2. 如果是缺少依赖，在 package.json 中添加并 npm install
3. 如果是语法错误，只编辑出错文件
4. 如果是端口问题，修改端口
5. 不要重写整个项目
6. 参考之前的修复，不要重复失败操作`;

    try {
      const responseText = await this._callLLM("你是错误修复专家，只返回 JSON 数组。", prompt);
      const fixSteps = this._extractJSON(responseText);
      console.log(`   🔧 生成了 ${fixSteps.length} 个验证修复步骤`);
      return fixSteps;
    } catch (err) {
      logError("generateVerificationFix", err);
      console.log(`   ⚠️  验证修复方案生成失败: ${err.message}`);
      return [];
    }
  }
}

module.exports = Planner;
