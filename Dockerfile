# 使用輕量 Node 環境進行雙階段建置
FROM node:20-alpine AS builder
WORKDIR /app

# 複製軟體包清單並安裝套件
COPY package.json package-lock.json* ./
RUN npm install

# 將所有根目錄檔案複製進去並編譯
COPY . .
RUN npm run build

# 生產環境執行階段
FROM node:20-alpine AS runtime
WORKDIR /app

# 複製編譯產物與後端必要檔案
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/package.json ./package.json

EXPOSE 7860
ENV NODE_ENV=production
ENV PORT=7860

CMD ["node", "server.js"]
