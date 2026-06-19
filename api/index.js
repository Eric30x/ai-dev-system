/**
 * Vercel Serverless 入口
 * 将 Express app 导出为 serverless function
 */

require("dotenv").config({ path: __dirname + "/../.env" });

const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

// ─── 中间件 ───
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件
app.use(express.static(path.join(__dirname, "..", "server", "public")));

// 下载目录
const downloadsDir = path.join(__dirname, "..", "downloads");
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
app.use("/downloads", express.static(downloadsDir));

// ─── API 路由 ───
const taskRoutes = require("../server/routes/task");
app.use("/api/task", taskRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/download", taskRoutes);

// ─── 首页 ───
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "server", "public", "index.html"));
});

module.exports = app;
