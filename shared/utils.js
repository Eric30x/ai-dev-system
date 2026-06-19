/**
 * 共享工具函数
 */

const crypto = require("crypto");

function generateId() {
  return crypto.randomUUID().slice(0, 8);
}

function timestamp() {
  return new Date().toISOString();
}

module.exports = { generateId, timestamp };
