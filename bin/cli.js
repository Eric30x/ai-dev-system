#!/usr/bin/env node

/**
 * AI Dev CLI — 命令行入口
 *
 * 用法：
 *   ai-dev create "做一个 Express API 项目"
 *   ai-dev create -t "做一个 CLI 工具"
 */

const { Command } = require("commander");
const runAgent = require("../core/runner");
const pkg = require("../package.json");

const program = new Command();

program
  .name("ai-dev")
  .description("🤖 AI 自动开发系统 — 输入任务描述，自动生成完整项目")
  .version(pkg.version);

program
  .command("create")
  .description("根据任务描述自动生成项目")
  .argument("<task>", "任务描述（自然语言）")
  .option("-o, --output <dir>", "输出目录", "output")
  .action(async (task, options) => {
    try {
      await runAgent(task, options);
    } catch (err) {
      console.error(`\n💥 执行失败: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
