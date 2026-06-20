/**
 * SSE Manager V10 — Server-Sent Events 实时日志推送
 *
 * 替代 V9 的轮询方式，Worker 推送 → 前端实时接收
 */

// 所有 SSE 连接（按 projectId 分组）
const clients = new Map(); // projectId → Set<response>

/**
 * 注册 SSE 客户端连接
 */
function addClient(projectId, res) {
  if (!clients.has(projectId)) {
    clients.set(projectId, new Set());
  }
  clients.get(projectId).add(res);

  // 客户端断开时清理
  res.on("close", () => {
    const set = clients.get(projectId);
    if (set) {
      set.delete(res);
      if (set.size === 0) clients.delete(projectId);
    }
  });

  return res;
}

/**
 * 向指定项目的所有客户端推送事件
 */
function emit(projectId, event, data) {
  const set = clients.get(projectId);
  if (!set || set.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const res of set) {
    try {
      res.write(payload);
    } catch (e) {
      set.delete(res);
    }
  }
}

/**
 * 推送日志
 */
function pushLog(projectId, level, message, extra = {}) {
  emit(projectId, "log", {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...extra,
  });
}

/**
 * 推送进度
 */
function pushProgress(projectId, state, progress, currentStep) {
  emit(projectId, "progress", { state, progress, currentStep });
}

/**
 * 推送文件变更
 */
function pushFileChange(projectId, action, filePath, content) {
  emit(projectId, "fileChange", { action, path: filePath, content });
}

/**
 * 获取已连接的客户端数
 */
function getClientCount(projectId) {
  const set = clients.get(projectId);
  return set ? set.size : 0;
}

module.exports = { addClient, emit, pushLog, pushProgress, pushFileChange, getClientCount };
