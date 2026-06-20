# Deployment Guide

## Option 1: VPS (Recommended)

```bash
# 1. Clone on server
git clone https://github.com/Eric30x/ai-dev-system.git
cd ai-dev-system
npm install

# 2. Environment
cp .env.example .env
# Edit: BASE_URL, JWT_SECRET, API keys

# 3. Infrastructure
docker compose up -d postgres redis

# 4. Database
npm run db:generate && npm run db:push

# 5. PM2 (process manager)
npm install -g pm2
pm2 start apps/api/index.js --name api
pm2 start workers/worker-core/index.js --name worker
pm2 save
pm2 startup

# 6. Nginx reverse proxy
# Add HTTPS with certbot, proxy_pass to localhost:3000
```

## Option 2: Docker Compose (All-in-One)

```bash
docker compose up -d
# Starts: postgres, redis, api, worker
```

## Option 3: Railway / Render

- **Build Command**: `npm install && npm run db:generate`
- **Start Command (API)**: `node apps/api/index.js`
- **Start Command (Worker)**: `node workers/worker-core/index.js`
- **Environment Variables**: Set all from `.env.example` in the dashboard

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `DATABASE_URL` | Yes | `postgresql://localhost:5432/aidev` |
| `REDIS_URL` | Yes | `redis://localhost:6379` |
| `JWT_SECRET` | Yes (prod) | Auto-generated in dev |
| `PORT` | No | `3000` |
| `BASE_URL` | Yes (prod) | `http://localhost:3000` |
| `ANTHROPIC_API_KEY` | Yes | — |
| `ANTHROPIC_BASE_URL` | No | — |
| `MODEL_NAME` | No | `deepseek-v4-pro` |
| `CLAUDE_API_KEY` | No | — |
| `OPENAI_API_KEY` | No | — |
| `GEMINI_API_KEY` | No | — |
| `STRIPE_SECRET_KEY` | No | — |
| `WORKER_CONCURRENCY` | No | `3` |
| `MAX_FIX_ROUNDS` | No | `3` |
