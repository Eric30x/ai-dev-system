/**
 * Billing Routes — Stripe 计费
 * 当 STRIPE_SECRET_KEY 未配置时自动进入 Mock 模式，不阻塞系统启动。
 */

const express = require("express");
const { Router } = express;
const { requireAuth } = require("../../../services/auth/middleware");
const billingService = require("../../../services/billing/stripe");
const config = require("../../../shared/config");

// Stripe 是否可用
const STRIPE_ENABLED = !!config.STRIPE_SECRET_KEY;

const router = Router();

// 创建 Checkout Session
router.post("/checkout", requireAuth, async (req, res) => {
  if (!STRIPE_ENABLED) {
    return res.status(501).json({ error: "Billing 未配置（缺少 STRIPE_SECRET_KEY）" });
  }
  try {
    const session = await billingService.createCheckoutSession(
      req.user.userId,
      req.user.email
    );
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stripe Webhook（仅在 Stripe 启用时生效）
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!STRIPE_ENABLED) {
    return res.status(501).json({ error: "Billing 未配置" });
  }
  try {
    const stripe = billingService.getStripe();
    const sig = req.headers["stripe-signature"];
    const event = stripe.webhooks.constructEvent(req.body, sig, config.STRIPE_WEBHOOK_SECRET);

    await billingService.handleWebhook(event);
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 查看用量
router.get("/usage", requireAuth, async (req, res) => {
  const quota = await billingService.checkQuota(req.user.userId);
  res.json(quota);
});

module.exports = router;
