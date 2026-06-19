# 🤖 AI 自动开发系统

基于 Claude API 的自动代码生成系统。接收自然语言任务描述，自动规划并生成完整项目代码。

## 架构

```
用户输入 → [Controller] → [Planner] → [Executor] → 输出文件
                           (Claude API)   (文件操作)
```

- **Controller**: 系统中枢，协调整个流程
- **Planner**: 调用 Claude API 将任务分解为结构化步骤
- **Executor**: 逐步执行计划，创建文件、运行命令

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 API Key

编辑 `.env` 文件：

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 3. 运行

```bash
npm start
```

或指定自定义任务：

```bash
node index.js "创建一个 Todo List 的 CLI 工具"
```

## 项目结构

```
ai-dev-system/
├── index.js              # 项目入口
├── package.json
├── .env                  # API Key 配置
├── .gitignore
├── controller/
│   ├── index.js          # Controller — 流程协调
│   ├── planner.js        # Planner — Claude API 任务分解
│   └── executor.js       # Executor — 计划执行引擎
└── output/               # 生成的项目输出目录（自动创建）
```

## 输出

所有生成的代码文件会写入 `output/` 目录。
