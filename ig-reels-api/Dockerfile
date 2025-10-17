# 使用官方 Playwright + Node 環境
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .

# 設定 Render 預設 PORT
ENV PORT=10000

EXPOSE 10000
CMD ["node", "server.js"]
