/**
 * Auth Routes — 注册 / 登录
 */

const { Router } = require("express");
const authService = require("../../../services/auth/auth");

const router = Router();

router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: "请提供邮箱和密码" });

    const result = await authService.register(email, password, name);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "请提供邮箱和密码" });

    const result = await authService.login(email, password);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
