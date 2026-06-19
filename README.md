# AI Dev Platform V9

商业级 AI 自动开发 SaaS 系统。

## 架构

```
Web UI → API Gateway (Auth + RateLimit + Billing)
           ↓
       Redis Queue (BullMQ)
           ↓
       Worker Pool (Docker / Cluster)
           ↓
       AI Engine (Planner + Executor + LLM Router)
           ↓
       Project → zip → Download
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动基础设施

```bash
docker compose up -d postgres redis
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 ANTHROPIC_API_KEY 等
```

### 4. 初始化数据库

```bash
npm run db:generate
npm run db:push
```

### 5. 启动服务（两个终端）

```bash
# 终端 1：API
npm start

# 终端 2：Worker
npm run worker
```

打开 http://localhost:3000

### Docker 一键启动

```bash
docker compose up -d
```

## 目录结构

```
├── apps/
│   ├── api/          # API Gateway (Express)
│   └── web/          # Web UI
├── services/
│   ├── auth/         # JWT 认证
│   ├── billing/      # Stripe 计费
│   ├── queue/        # Redis + BullMQ
│   └── project/      # 项目 CRUD
├── workers/
│   ├── worker-core/  # 主 Worker 进程
│   ├── planner/      # 任务拆解
│   ├── executor/     # 代码生成
│   └── llm-router/   # LLM 多 Provider 路由
├── db/
│   ├── schema.prisma # 数据模型
│   └── client.js     # Prisma 客户端
├── shared/
│   ├── config.js     # 全局配置
│   └── types/        # 类型常量
├── infra/docker/     # Docker 配置
├── docker-compose.yml
└── vercel.json
```

## API 接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/auth/register | 注册 | ❌ |
| POST | /api/auth/login | 登录 | ❌ |
| GET | /api/projects | 项目列表 | ✅ |
| POST | /api/projects | 创建项目 | ✅ |
| GET | /api/projects/:id | 项目详情 | ✅ |
| GET | /api/projects/:id/logs | 项目日志 | ✅ |
| GET | /api/projects/:id/download | 下载 | ✅ |
| POST | /api/billing/checkout | 升级 Pro | ✅ |
| GET | /api/billing/usage | 查看用量 | ✅ |
| POST | /api/keys | 创建 API Key | ✅ |
| GET | /api/health | 健康检查 | ❌ |

## 计费

- Free: 5 个项目/天
- Pro: 无限项目

## LLM 路由

自动 fallback: Claude → OpenAI
