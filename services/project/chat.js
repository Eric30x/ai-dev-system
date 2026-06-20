/**
 * Chat Service V10 — 项目级 AI 对话
 */

const { getPrisma } = require("../../db/client");
const llm = require("../../workers/llm-router");
const workspace = require("./workspace");

/**
 * 获取或创建项目对话
 */
async function getOrCreateConversation(projectId, userId, title) {
  const prisma = getPrisma();
  let conv = await prisma.conversation.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  if (!conv) {
    conv = await prisma.conversation.create({
      data: { projectId, userId, title: title || "New Chat" },
    });
  }
  return conv;
}

/**
 * 获取对话历史
 */
async function getMessages(conversationId, limit = 50) {
  const prisma = getPrisma();
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/**
 * 发送消息并获取 AI 回复
 */
async function sendMessage(conversationId, projectId, userId, content) {
  const prisma = getPrisma();

  // 保存用户消息
  await prisma.message.create({
    data: { conversationId, role: "user", content },
  });

  // 获取上下文
  const history = await getMessages(conversationId);
  const fileTree = await workspace.getFileTree(projectId);
  const fileTreeSummary = Object.keys(fileTree).slice(0, 30).join(", ");

  // 构建 system prompt
  const systemPrompt = `你是一个 AI 编程助手，正在帮助用户开发一个项目。
当前项目的文件结构: ${fileTreeSummary || "(空项目)"}

你可以：
1. 回答关于代码的问题
2. 建议文件修改
3. 当用户要求修改代码时，用以下格式回复：
\`\`\`file:path/to/file.js
// 文件的新内容
\`\`\`

简洁、直接、不要过度解释。`;

  // 构建对话上下文
  const context = history.slice(-10).map(m =>
    `${m.role === "user" ? "用户" : "助手"}: ${m.content}`
  ).join("\n");

  const prompt = `${context}\n用户: ${content}\n助手:`;

  try {
    const reply = await llm.chat(systemPrompt, prompt, { temperature: 0.4 });

    // 保存 AI 回复
    await prisma.message.create({
      data: { conversationId, role: "assistant", content: reply },
    });

    return { role: "assistant", content: reply };
  } catch (err) {
    const errorMsg = `AI 回复失败: ${err.message}`;
    await prisma.message.create({
      data: { conversationId, role: "system", content: errorMsg },
    });
    return { role: "system", content: errorMsg };
  }
}

module.exports = { getOrCreateConversation, getMessages, sendMessage };
