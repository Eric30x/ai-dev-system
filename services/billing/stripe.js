/**
 * Stripe 计费服务
 */

const config = require("../../shared/config");
const { getPrisma } = require("../../db/client");

let _stripe;

function getStripe() {
  if (!_stripe) {
    if (!config.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY 未配置");
    }
    _stripe = require("stripe")(config.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

/**
 * 创建 Stripe Customer
 */
async function createCustomer(userId, email) {
  const stripe = getStripe();
  const customer = await stripe.customers.create({ email, metadata: { userId } });
  return customer;
}

/**
 * 创建 Checkout Session（升级到 Pro）
 */
async function createCheckoutSession(userId, email) {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    customer_email: email,
    payment_method_types: ["card"],
    line_items: [{ price: config.STRIPE_PRO_PRICE_ID, quantity: 1 }],
    mode: "subscription",
    success_url: `${config.BASE_URL}/billing?success=true`,
    cancel_url: `${config.BASE_URL}/billing?canceled=true`,
    metadata: { userId },
  });

  return session;
}

/**
 * 处理 Webhook 事件
 */
async function handleWebhook(event) {
  const prisma = getPrisma();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata.userId;
      await prisma.user.update({
        where: { id: userId },
        data: { plan: "PRO" },
      });
      console.log(`✅ 用户 ${userId} 升级到 PRO`);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      // 找到对应用户并降级
      const customer = await getStripe().customers.retrieve(subscription.customer);
      const userId = customer.metadata.userId;
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: { plan: "FREE" },
        });
        console.log(`⬇️ 用户 ${userId} 降级到 FREE`);
      }
      break;
    }
  }
}

/**
 * 记录用量
 */
async function trackUsage(userId, type, amount = 1) {
  const prisma = getPrisma();
  await prisma.usage.create({
    data: { userId, type, amount },
  });
}

/**
 * 检查用户是否超出配额
 */
async function checkQuota(userId) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { allowed: false, reason: "用户不存在" };

  const limit = user.plan === "PRO" ? config.PRO_TIER_DAILY_LIMIT : config.FREE_TIER_DAILY_LIMIT;

  // 计算今日用量
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayUsage = await prisma.usage.count({
    where: {
      userId,
      type: "project",
      createdAt: { gte: today },
    },
  });

  if (todayUsage >= limit) {
    return {
      allowed: false,
      reason: `已达今日限额 (${limit}次/天)，请升级到 Pro`,
      used: todayUsage,
      limit,
    };
  }

  return { allowed: true, used: todayUsage, limit };
}

module.exports = {
  getStripe,
  createCustomer,
  createCheckoutSession,
  handleWebhook,
  trackUsage,
  checkQuota,
};
