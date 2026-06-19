/**
 * V9 全局配置 — 上线加固版
 */

const crypto = require("crypto");

// JWT_SECRET 自动生成 fallback（生产环境务必通过 .env 显式设置）
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

module.exports = {
  // Server
  PORT: parseInt(process.env.PORT) || 3000,
  HOST: process.env.HOST || "0.0.0.0",           // 公网可访问
  NODE_ENV: process.env.NODE_ENV || "development",
  BASE_URL: process.env.BASE_URL || "http://localhost:3000",

  // Database
  DATABASE_URL: process.env.DATABASE_URL || "postgresql://localhost:5432/aidev",

  // Redis
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",

  // Auth
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  // AI Providers
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  MODEL_NAME: process.env.MODEL_NAME || "deepseek-v4-pro",

  // Billing
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
  STRIPE_PRO_PRICE_ID: process.env.STRIPE_PRO_PRICE_ID || "",

  // Rate Limiting
  FREE_TIER_DAILY_LIMIT: 5,
  PRO_TIER_DAILY_LIMIT: 100,

  // Worker
  WORKER_CONCURRENCY: parseInt(process.env.WORKER_CONCURRENCY) || 3,
  MAX_FIX_ROUNDS: 3,
  MAX_VERIFY_RETRIES: 3,

  // Storage
  WORKSPACE_DIR: process.env.WORKSPACE_DIR || "./workspaces",
  DOWNLOADS_DIR: process.env.DOWNLOADS_DIR || "./downloads",
  QUEUE_DIR: process.env.QUEUE_DIR || "./.queue",
};
