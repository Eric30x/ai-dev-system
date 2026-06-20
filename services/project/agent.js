/**
 * Agent Service V10.2 — 真正的项目 Agent
 *
 * 用户消息 → 分析项目上下文 → LLM 生成补丁 → 实际修改文件 → 返回结果
 */

const path = require("path");
const fs = require("fs-extra");
const llm = require("../../workers/llm-router");
const workspace = require("./workspace");
const config = require("../../shared/config");

/**
 * Agent 主入口
 * @param {string} projectId
 * @param {string} userMessage
 * @returns {{ modifiedFiles: string[], logs: string[], summary: string }}
 */
async function runAgent(projectId, userMessage) {
  const logs = [];
  const modifiedFiles = [];

  // ═══ Step 1: 收集项目上下文 ═══
  logs.push("🔍 分析项目结构...");
  const outputDir = path.join(config.WORKSPACE_DIR, projectId);
  await fs.ensureDir(outputDir);

  let fileTree = await workspace.getFileTree(projectId);

  // 如果 DB 中文件树为空，从磁盘同步
  if (!fileTree || Object.keys(fileTree).length === 0) {
    fileTree = await workspace.syncFileTree(projectId);
  }

  const fileList = Object.keys(fileTree).filter(k => fileTree[k]?.type === "file");
  const fileCount = fileList.length;

  // 读取关键文件内容（最多 8 个，避免 token 爆炸）
  const keyFiles = [];
  const priorityFiles = fileList.filter(f =>
    f === "package.json" ||
    f.endsWith("server.js") || f.endsWith("index.js") || f.endsWith("app.js") ||
    f.endsWith("main.js") || f.endsWith(".ts") ||
    f.endsWith(".html") || f.endsWith(".css")
  ).slice(0, 8);

  for (const fp of priorityFiles) {
    try {
      const content = await workspace.readFile(projectId, fp);
      if (content) {
        keyFiles.push({ path: fp, content: content.slice(0, 3000) });
      }
    } catch (e) { /* skip unreadable files */ }
  }

  logs.push(`📂 发现 ${fileCount} 个文件，读取 ${keyFiles.length} 个关键文件`);

  // ═══ Step 2: 构建 Prompt ═══
  const contextBlock = keyFiles.map(f =>
    `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``
  ).join("\n\n");

  const systemPrompt = `你是一个专家级全栈工程师 Agent。你可以直接修改项目文件。

## 规则
1. 分析用户需求
2. 确定需要修改/创建哪些文件
3. 返回一个 JSON，格式如下：
{
  "analysis": "对需求的分析（一句话）",
  "files": [
    { "path": "相对路径/文件名", "content": "文件的完整新内容" }
  ],
  "summary": "修改总结"
}

## 重要
- content 必须是文件的**完整内容**，不是 diff
- 如果是新文件，直接提供完整内容
- 如果是修改文件，提供修改后的完整内容
- 保持代码风格一致
- 不要遗漏任何必要的 import/require
- 只返回 JSON，不要加 markdown 代码块标记`;

  const userPrompt = `## 项目当前文件结构
${fileList.slice(0, 30).join("\n")}

## 关键文件内容
${contextBlock || "(空项目，无现有文件)"}

## 用户需求
${userMessage}

请分析需求并返回修改方案（JSON格式）。`;

  // ═══ Step 3: 调用 LLM ═══
  logs.push("🤖 调用 LLM 分析需求...");
  let response;
  try {
    response = await llm.chat(systemPrompt, userPrompt, {
      temperature: 0.2,
      maxTokens: 12000,
      timeout: 120000,
    });
  } catch (err) {
    logs.push(`❌ LLM 调用失败: ${err.message}`);
    return { modifiedFiles: [], logs, summary: `AI 调用失败: ${err.message}` };
  }

  // ═══ Step 4: 解析 LLM 响应 ═══
  logs.push("📋 解析 AI 响应...");
  let plan;
  try {
    plan = llm.extractJSON(response);
  } catch (err) {
    // 如果 LLM 返回了代码块而不是纯 JSON，尝试提取
    logs.push(`⚠️ JSON 解析失败: ${err.message}，尝试修复...`);
    // 回退：将整个响应保存为 plan.md
    await fs.writeFile(
      path.join(outputDir, "agent-plan.md"),
      `# Agent Plan\n\n## User Request\n${userMessage}\n\n## AI Response\n${response}`,
      "utf-8"
    );
    return {
      modifiedFiles: [],
      logs: [...logs, "⚠️ AI 返回了非结构化内容，已保存为 agent-plan.md"],
      summary: "AI 返回了文本回复（非结构化），无法自动应用修改。回复已保存到 agent-plan.md。",
    };
  }

  const analysis = plan.analysis || "";
  const files = plan.files || [];

  if (!files.length) {
    logs.push("⚠️ AI 未返回任何文件修改");
    return { modifiedFiles: [], logs, summary: analysis || "AI 分析完成，但未返回文件修改方案。" };
  }

  // ═══ Step 5: Apply Patches ═══
  logs.push(`🔧 应用 ${files.length} 个文件修改...`);

  for (const file of files) {
    if (!file.path || file.content === undefined) {
      logs.push(`⚠️ 跳过无效条目: ${JSON.stringify(file).slice(0, 80)}`);
      continue;
    }

    // 安全检查
    const filePath = String(file.path).replace(/\\/g, "/");
    if (filePath.includes("..") || filePath.startsWith("/")) {
      logs.push(`🚫 拒绝不安全路径: ${filePath}`);
      continue;
    }

    try {
      await workspace.writeFile(projectId, filePath, String(file.content));
      modifiedFiles.push(filePath);
      logs.push(`✅ 已写入: ${filePath}`);
    } catch (err) {
      logs.push(`❌ 写入失败 ${filePath}: ${err.message}`);
    }
  }

  // ═══ Step 6: 同步文件树 ═══
  if (modifiedFiles.length > 0) {
    await workspace.syncFileTree(projectId);
    logs.push("🔄 文件树已同步");
  }

  const summary = plan.summary || analysis || `已修改 ${modifiedFiles.length} 个文件`;

  return { modifiedFiles, logs, summary };
}

module.exports = { runAgent };
