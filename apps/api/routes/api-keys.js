/**
 * API Key Routes — 管理用户的 API Key
 */

const { Router } = require("express");
const { requireAuth } = require("../../../services/auth/middleware");
const authService = require("../../../services/auth/auth");
const { getPrisma } = require("../../../db/client");

const router = Router();

// 创建 API Key
router.post("/", requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const apiKey = await authService.createApiKey(req.user.userId, name || "default");
    res.json({ id: apiKey.id, key: apiKey.key, name: apiKey.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 列出 API Key
router.get("/", requireAuth, async (req, res) => {
  const prisma = getPrisma();
  const keys = await prisma.apiKey.findMany({
    where: { userId: req.user.userId },
    select: { id: true, name: true, lastUsed: true, createdAt: true },
  });
  res.json({ keys });
});

// 删除 API Key
router.delete("/:id", requireAuth, async (req, res) => {
  const prisma = getPrisma();
  await prisma.apiKey.deleteMany({
    where: { id: req.params.id, userId: req.user.userId },
  });
  res.json({ success: true });
});

module.exports = router;
