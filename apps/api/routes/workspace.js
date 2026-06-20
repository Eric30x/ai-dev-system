/**
 * Workspace API V10 — 项目工作区（文件树 + 读写 + SSE + 对话）
 */

const { Router } = require("express");
const workspace = require("../../../services/project/workspace");
const chatService = require("../../../services/project/chat");
const sse = require("../../../services/project/sse");
const { getPrisma } = require("../../../db/client");

const router = Router();

// ═══ SSE 实时日志 ═══
router.get("/:id/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.write(`event: connected\ndata: {"status":"ok"}\n\n`);
  sse.addClient(req.params.id, res);
});

// ═══ 文件树 ═══
router.get("/:id/files", async (req, res) => {
  try {
    const tree = await workspace.getFileTree(req.params.id);
    res.json({ tree });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ 读取文件（?path=xxx） ═══
router.get("/:id/file", async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: "请提供文件路径（?path=xxx）" });
    const content = await workspace.readFile(req.params.id, filePath);
    if (content === null) return res.status(404).json({ error: "文件不存在" });
    res.json({ path: filePath, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ 写入文件 ═══
router.put("/:id/files", async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) return res.status(400).json({ error: "请提供 path 和 content" });
    const result = await workspace.writeFile(req.params.id, filePath, content);
    sse.pushFileChange(req.params.id, "update", filePath, content);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ 同步文件树（从磁盘到 DB） ═══
router.post("/:id/sync", async (req, res) => {
  try {
    const tree = await workspace.syncFileTree(req.params.id);
    res.json({ tree, fileCount: Object.keys(tree).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ Chat 对话 ═══
router.get("/:id/chat", async (req, res) => {
  try {
    const conv = await chatService.getOrCreateConversation(req.params.id, req.query.userId || "system");
    const messages = await chatService.getMessages(conv.id);
    res.json({ conversationId: conv.id, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/chat", async (req, res) => {
  try {
    const { message, userId } = req.body;
    if (!message) return res.status(400).json({ error: "请提供 message" });

    const conv = await chatService.getOrCreateConversation(req.params.id, userId || "system");
    const reply = await chatService.sendMessage(conv.id, req.params.id, userId || "system", message);
    res.json({ conversationId: conv.id, reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ 项目详情 =═══
router.get("/:id", async (req, res) => {
  try {
    const prisma = getPrisma();
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { logs: { orderBy: { createdAt: "desc" }, take: 50 } },
    });
    if (!project) return res.status(404).json({ error: "项目不存在" });
    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
