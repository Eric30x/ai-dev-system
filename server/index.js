/**
 * AI Dev Platform V7 — Web Server
 *
 * 启动：npm run server
 */

require("dotenv").config({ path: __dirname + "/../.env" });

const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// 将 BASE_URL 挂到 app 上，供路由使用
app.locals.baseUrl = BASE_URL;

// ─── 中间件 ───
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件
app.use(express.static(path.join(__dirname, "public")));

// 下载目录
const downloadsDir = path.join(__dirname, "..", "downloads");
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
app.use("/downloads", express.static(downloadsDir));

// ─── API 路由 ───
const taskRoutes = require("./routes/task");
app.use("/api/task", taskRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/download", taskRoutes);

// ─── 健康检查 ───
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "7.0.0", baseUrl: BASE_URL });
});

// ─── 首页 ───
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── 仅非 serverless 环境启动监听 ───
if (require.main === module || process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════════╗`);
    console.log(`║     🌐 AI Dev Platform V7 — Production Server    ║`);
    console.log(`╚══════════════════════════════════════════════════╝`);
    console.log(`\n   🚀 ${BASE_URL}`);
    console.log(`   📋 API: POST /api/task/create`);
    console.log(`   📋 API: GET  /api/task/status/:id`);
    console.log(`   📋 API: GET  /api/tasks`);
    console.log(`   📋 API: GET  /api/health`);
    console.log(`   📦 CLI: ai-dev create "任务"`);
    console.log();
  });
}

module.exports = app;
