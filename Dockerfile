FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY package.json package-lock.json ./
RUN npm ci --production

# 复制源码
COPY . .

# 创建必要目录
RUN mkdir -p output workspaces downloads logs

# 暴露端口
EXPOSE 3000

# 启动服务
CMD ["node", "server/index.js"]
