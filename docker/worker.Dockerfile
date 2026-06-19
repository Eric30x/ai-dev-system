FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY . .

RUN mkdir -p workspaces downloads logs .queue

CMD ["node", "worker/index.js"]
