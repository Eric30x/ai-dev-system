/**
 * Redis 客户端 — 支持 ioredis
 */

const Redis = require("ioredis");
const config = require("../../shared/config");

let _redis;

function getRedis() {
  if (!_redis) {
    _redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    _redis.on("error", (err) => {
      console.error("Redis 连接错误:", err.message);
    });

    _redis.on("connect", () => {
      console.log("✅ Redis 已连接");
    });
  }
  return _redis;
}

module.exports = { getRedis };
