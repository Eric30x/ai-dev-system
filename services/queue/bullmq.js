/**
 * BullMQ 任务队列 — 分布式队列系统
 */

const { Queue, Worker } = require("bullmq");
const { getRedis } = require("./redis");
const config = require("../../shared/config");

const QUEUE_NAME = "ai-dev-tasks";

let _queue;

/**
 * 获取任务队列（生产者端）
 */
function getQueue() {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return _queue;
}

/**
 * 添加任务到队列
 */
async function addTask(projectId, type, data = {}) {
  const queue = getQueue();
  const job = await queue.add(type, {
    projectId,
    type,
    ...data,
  });
  return job.id;
}

/**
 * 创建 Worker（消费者端）
 */
function createWorker(processor) {
  const redis = getRedis();
  const worker = new Worker(QUEUE_NAME, processor, {
    connection: redis,
    concurrency: config.WORKER_CONCURRENCY,
    limiter: { max: 10, duration: 60000 }, // 每分钟最多 10 个任务
  });

  worker.on("completed", (job) => {
    console.log(`✅ 任务完成: ${job.id} (${job.data.type})`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ 任务失败: ${job.id} — ${err.message}`);
  });

  return worker;
}

/**
 * 获取队列状态
 */
async function getQueueStatus() {
  const queue = getQueue();
  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);
  return { waiting, active, completed, failed };
}

module.exports = { getQueue, addTask, createWorker, getQueueStatus };
