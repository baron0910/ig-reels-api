# 使用官方 Playwright + Node 環境，支援爬 IG Reels
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

# 設定工作目錄
WORKDIR /app

# 複製 package.json
COPY package*.json ./

# 安裝依賴
RUN npm install

# 複製所有程式碼
COPY . .

# 開放伺服器埠口（Render 預設使用 10000 或 3000）
EXPOSE 3000

# 啟動服務
CMD ["node", "server.js"]
