/**
 * AI Fixer V10.3 — LLM 驱动的智能修复
 *
 * 替代 V10 的硬编码 if/else 规则引擎。
 *
 * 输入: 执行错误 + 项目上下文 + 完整文件内容
 * 输出: 具体文件修复 (JSON)
 * 应用: 直接写入磁盘
 * 最大: 3 轮
 */

const fs = require("fs-extra");
const path = require("path");
const llm = require("../llm-router");

/**
 * AI 修复主入口
 *
 * @param {string} outputDir     项目输出目录
 * @param {string[]} issues       Verifier 发现的问题列表
 * @param {object[]} failedSteps  执行失败的步骤
 * @param {string} originalTask   原始任务描述
 * @returns {{ fixed: boolean, changes: number, details: string[] }}
 */
async function aiFix(outputDir, issues, failedSteps, originalTask) {
  const details = [];
  let totalChanges = 0;

  if (!issues.length && !failedSteps.length) {
    return { fixed: true, changes: 0, details: ["无需修复"] };
  }

  // ═══ Step 1: 收集上下文 ═══
  details.push("🔍 收集项目上下文...");

  const fileTree = getFileTreeString(outputDir);
  const keyFiles = readKeyFiles(outputDir);

  details.push(`📂 文件树: ${fileTree.split('\n').length} 行, ${keyFiles.length} 个文件已读取`);

  // ═══ Step 2: 构建 Prompt ═══
  const systemPrompt = `你是一个专家级全栈 Debug 工程师。你需要修复项目中的问题。

## 规则
1. 分析所有错误，找出根因
2. 确定需要修改/创建哪些文件
3. 返回修复方案 JSON：

{
  "diagnosis": "问题的根因分析",
  "files": [
    {
      "path": "相对路径",
      "reason": "为什么要修改这个文件",
      "content": "修改后的完整文件内容"
    }
  ],
  "commands": ["需要运行的命令，如 npm install xxx"],
  "summary": "修复总结"
}

## 重要
- content 必须是文件的**完整内容**，不是 diff
- 不要省略任何现有代码
- 如果是新文件，提供完整内容
- 保持代码风格一致
- 只返回 JSON，不要加 markdown 标记`;

  const errorBlock = [
    ...issues.map((i, idx) => `### 问题 ${idx + 1}\n${i}`),
    ...failedSteps.map(s => `### 失败步骤\n步骤 ${s.step}: ${s.description || ''}\n错误: ${s.error || ''}`),
  ].join("\n\n");

  const userPrompt = `## 原始任务
${originalTask}

## 错误信息
${errorBlock || "(无具体错误信息)"}

## 项目文件结构
${fileTree}

## 关键文件内容
${keyFiles.map(f => `### ${f.path}\n\`\`\`${f.lang || ''}\n${f.content}\n\`\`\``).join("\n\n")}

请诊断问题并返回修复方案 JSON。`;

  // ═══ Step 3: 调用 LLM ═══
  details.push("🤖 调用 LLM 诊断并生成修复方案...");

  let response;
  try {
    response = await llm.chat(systemPrompt, userPrompt, {
      temperature: 0.2,
      maxTokens: 12000,
      timeout: 120000,
    });
  } catch (err) {
    details.push(`❌ LLM 调用失败: ${err.message}`);
    return { fixed: false, changes: 0, details };
  }

  // ═══ Step 4: 解析修复方案 ═══
  details.push("📋 解析修复方案...");

  let fixPlan;
  try {
    fixPlan = llm.extractJSON(response);
  } catch (err) {
    details.push(`⚠️ 无法解析 AI 响应为 JSON: ${err.message}`);
    // 保存原始响应用于调试
    try {
      fs.writeFileSync(path.join(outputDir, "fix-debug.txt"), response, "utf-8");
      details.push("💾 原始响应已保存到 fix-debug.txt");
    } catch (e) { /* ignore */ }
    return { fixed: false, changes: 0, details };
  }

  const diagnosis = fixPlan.diagnosis || "";
  const files = fixPlan.files || [];
  const commands = fixPlan.commands || [];

  if (diagnosis) details.push(`🔎 诊断: ${diagnosis}`);

  // ═══ Step 5: 执行命令 ═══
  for (const cmd of commands) {
    details.push(`⚡ 执行: ${cmd}`);
    try {
      const { execSync } = require("child_process");
      const output = execSync(cmd, {
        cwd: outputDir,
        encoding: "utf-8",
        timeout: 60000,
        shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
        windowsHide: true,
      });
      details.push(`✅ 命令成功: ${(output || "").trim().slice(0, 200)}`);
    } catch (err) {
      details.push(`⚠️ 命令失败: ${err.message.slice(0, 200)}`);
    }
  }

  // ═══ Step 6: Apply File Patches ═══
  if (!files.length) {
    details.push("⚠️ AI 未返回文件修改方案");
    return { fixed: false, changes: 0, details };
  }

  details.push(`🔧 应用 ${files.length} 个文件修改...`);

  let appliedChanges = 0;
  for (const file of files) {
    if (!file.path || file.content === undefined) {
      details.push(`⚠️ 跳过无效条目`);
      continue;
    }

    const fp = String(file.path).replace(/\\/g, "/");
    if (fp.includes("..") || fp.startsWith("/")) {
      details.push(`🚫 拒绝不安全路径: ${fp}`);
      continue;
    }

    try {
      const fullPath = path.resolve(outputDir, fp);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, String(file.content), "utf-8");
      appliedChanges++;
      details.push(`✅ 已修复: ${fp} (${file.reason || "AI 建议修改"})`);
    } catch (err) {
      details.push(`❌ 写入失败 ${fp}: ${err.message}`);
    }
  }

  totalChanges = appliedChanges;
  const summary = fixPlan.summary || `修复了 ${appliedChanges} 个文件`;

  details.push(`📊 ${summary}`);

  return {
    fixed: appliedChanges > 0,
    changes: appliedChanges,
    details,
    diagnosis,
    summary,
  };
}

// ═══ Helpers ═══

/**
 * 生成文件树字符串
 */
function getFileTreeString(dir) {
  try {
    const walk = (d, prefix = "") => {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      let result = "";
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          result += `📁 ${rel}/\n${walk(path.join(d, entry.name), rel)}`;
        } else {
          result += `📄 ${rel}\n`;
        }
      }
      return result;
    };
    return walk(dir) || "(空)";
  } catch {
    return "(无法读取)";
  }
}

/**
 * 读取项目中的关键文件（最多 10 个，避免 token 溢出）
 */
function readKeyFiles(dir) {
  const results = [];
  const priority = ["package.json", "server.js", "index.js", "app.js", "main.js"];

  function collect(d, prefix = "") {
    if (!fs.pathExistsSync(d)) return;
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name.endsWith(".lock")) continue;
      const full = path.join(d, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { collect(full, rel); }
      else if (entry.name.endsWith(".js") || entry.name.endsWith(".ts") || entry.name.endsWith(".json") ||
               entry.name.endsWith(".html") || entry.name.endsWith(".css") || entry.name.endsWith(".py") ||
               entry.name.endsWith(".md") || entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")) {
        results.push({ path: rel, priority: priority.includes(entry.name) ? 0 : 1 });
      }
    }
  }

  collect(dir);

  // 优先读取关键文件
  results.sort((a, b) => a.priority - b.priority);
  const top = results.slice(0, 10);

  return top.map(f => {
    try {
      const content = fs.readFileSync(path.join(dir, f.path), "utf-8");
      const ext = path.extname(f.path).slice(1);
      const langMap = { js: "javascript", ts: "typescript", json: "json", html: "html", css: "css", py: "python", md: "markdown" };
      return { path: f.path, content: content.slice(0, 4000), lang: langMap[ext] || "" };
    } catch (e) {
      return { path: f.path, content: "(无法读取)", lang: "" };
    }
  });
}

module.exports = { aiFix };
