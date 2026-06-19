/**
 * API 入口 — Express 应用
 * 同时兼容 Vercel serverless 和本地运行
 */

require("dotenv").config({ path: __dirname + "/../.env" });

const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件
app.use(express.static(path.join(__dirname, "..", "web")));

// 下载目录
const config = require("../shared/config");
fs.mkdirSync(config.DOWNLOADS_DIR, { recursive: true });
app.use("/downloads", express.static(config.DOWNLOADS_DIR));

// 路由
app.post("/api/create-task", require("./create-task"));
app.get("/api/get-task", require("./get-task"));
app.get("/api/download", require("./download"));
app.get("/api/health", require("./health"));

// 首页
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "web", "index.html"));
});

// 本地启动
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🌐 API Server: http://localhost:${PORT}\n`);
  });
}

module.exports = app;
