/**
 * Auth Middleware — JWT + API Key 认证
 */

const authService = require("./auth");

/**
 * 必须认证
 */
function requireAuth(req, res, next) {
  const user = extractUser(req);
  if (!user) {
    return res.status(401).json({ error: "未认证，请登录或提供 API Key" });
  }
  req.user = user;
  next();
}

/**
 * 可选认证（不强制）
 */
function optionalAuth(req, res, next) {
  req.user = extractUser(req) || null;
  next();
}

/**
 * 从请求中提取用户信息
 */
function extractUser(req) {
  // 1. 检查 Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      return authService.verifyToken(token);
    } catch (e) {
      // token 无效，继续检查 API Key
    }
  }

  // 2. 检查 X-API-Key header
  const apiKey = req.headers["x-api-key"];
  if (apiKey) {
    // API Key 是异步查询，需要同步处理
    // 这里返回一个标记，路由中处理
    req._apiKey = apiKey;
    return null; // 由路由异步解析
  }

  return null;
}

/**
 * API Key 异步认证中间件
 */
async function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key) {
    return res.status(401).json({ error: "请提供 API Key" });
  }

  const user = await authService.getUserByApiKey(key);
  if (!user) {
    return res.status(401).json({ error: "API Key 无效" });
  }

  req.user = { userId: user.id, email: user.email, plan: user.plan };
  next();
}

module.exports = { requireAuth, optionalAuth, requireApiKey };
