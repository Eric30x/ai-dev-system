/**
 * Auth Service — JWT 认证
 */

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const config = require("../../shared/config");
const { getPrisma } = require("../../db/client");

async function register(email, password, name) {
  const prisma = getPrisma();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("邮箱已注册");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });

  return { user: { id: user.id, email: user.email, name: user.name, plan: user.plan } };
}

async function login(email, password) {
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("邮箱或密码错误");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("邮箱或密码错误");

  const token = jwt.sign({ userId: user.id, email: user.email, plan: user.plan }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  });

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
  };
}

function verifyToken(token) {
  return jwt.verify(token, config.JWT_SECRET);
}

async function createApiKey(userId, name) {
  const prisma = getPrisma();
  const key = `aidev_${crypto.randomBytes(32).toString("hex")}`;

  const apiKey = await prisma.apiKey.create({
    data: { key, userId, name },
  });

  return apiKey;
}

async function getUserByApiKey(key) {
  const prisma = getPrisma();
  const apiKey = await prisma.apiKey.findUnique({
    where: { key },
    include: { user: true },
  });

  if (!apiKey) return null;

  // 更新 lastUsed
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsed: new Date() },
  });

  return apiKey.user;
}

module.exports = { register, login, verifyToken, createApiKey, getUserByApiKey };
