/**
 * API Gateway — V9 SaaS 入口（上线加固版）
 *
 * - 监听 0.0.0.0 支持公网访问
 * - 路由独立加载，单点失败不影响整体
 * - 挂载 Web UI + 下载 + 任务 API
 */

require("dotenv").config({ path: __dirname + "/../../.env" });

const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("../../shared/config");

const app = express();

// ─── 中间件 ───
app.use(cors());
app.use(express.json());

// ─── 路由加载器（独立 try/catch，单路由失败不崩溃） ───
function loadRoute(routePath, modulePath, name) {
  try {
    const route = require(modulePath);
    app.use(routePath, route);
    console.log(`  ✅ 路由已加载: ${name} (${routePath})`);
  } catch (err) {
    console.error(`  ⚠️  路由加载失败: ${name} (${routePath}) — ${err.message}`);
    const { Router } = require("express");
    const fallback = Router();
    fallback.all("*", (req, res) => {
      res.status(503).json({ error: `${name} 服务暂不可用`, reason: err.message });
    });
    app.use(routePath, fallback);
  }
}

// ─── V9 核心路由 ───
loadRoute("/api/auth", "./routes/auth", "Auth");
loadRoute("/api/projects", "./routes/projects", "Projects");
loadRoute("/api/billing", "./routes/billing", "Billing");
loadRoute("/api/keys", "./routes/api-keys", "API Keys");
loadRoute("/api/health", "./routes/health", "Health");

// ─── Web UI 桥接路由（前端期望的 API） ───
loadRoute("/api", "./routes/tasks", "Tasks (create/get)");
loadRoute("/api/download", "./routes/download", "Download");

// ─── 静态文件：Web UI ───
const webDir = path.join(__dirname, "..", "web");
app.use(express.static(webDir));

// SPA fallback：所有非 API / 非静态文件请求返回 index.html
app.use((req, res, next) => {
  // /api/* 路径已经由路由处理
  if (req.path.startsWith("/api/")) return next();
  // 已经有静态文件匹配的不会到达这里
  res.sendFile(path.join(webDir, "index.html"), (err) => {
    if (err && err.code !== "ENOENT") next(err);
  });
});

// ─── 启动 ───
if (require.main === module) {
  app.listen(config.PORT, config.HOST, () => {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║     🌐 AI Dev Platform V9 — API Gateway       ║`);
    console.log(`╚══════════════════════════════════════════════╝`);
    console.log(`\n   🚀 ${config.BASE_URL}`);
    console.log(`   🔗 监听: ${config.HOST}:${config.PORT}`);
    console.log(`   🌍 Web UI: ${config.BASE_URL}/`);
    console.log(`   📋 API: /api/auth, /api/projects, /api/billing`);
    console.log(`   📥 下载: /api/download?id=xxx`);
    console.log();
  });
}

module.exports = app;
