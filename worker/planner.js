/**
 * Planner — 任务拆解 + 修复方案生成
 */

const llm = require("./llm-client");

const PLAN_PROMPT = `你是一个软件开发规划器。将用户的任务分解为 JSON 步骤数组。

每个步骤格式：
- action: "create_file" | "edit_file" | "run_command" | "done"
- target: 文件路径或命令
- content: 文件内容（create/edit 时）
- description: 中文说明

规则：
1. 只返回 JSON 数组
2. 最后一步必须是 {"action":"done","target":"","content":"","description":"完成"}
3. 优先使用 npm/node/git 等跨平台命令
4. package.json 必须有 start script`;

const FIX_PROMPT = `你是错误修复专家。根据失败信息生成 patch 修复步骤。

失败步骤：{step}
错误：{error}
文件结构：{tree}
平台：{platform}

返回 JSON 数组（1~3步），只修复失败部分，不要重写。`;

async function plan(task) {
  const response = await llm.chat(PLAN_PROMPT, task);
  return llm.extractJSON(response);
}

async function generateFix(step, error, fileTree, platformInfo) {
  const prompt = FIX_PROMPT
    .replace("{step}", JSON.stringify(step))
    .replace("{error}", error)
    .replace("{tree}", fileTree || "(无)")
    .replace("{platform}", JSON.stringify(platformInfo));

  try {
    const response = await llm.chat("你是错误修复专家，只返回 JSON 数组。", prompt);
    return llm.extractJSON(response);
  } catch (e) {
    return [];
  }
}

module.exports = { plan, generateFix };
