---
title: Material Database
sdk: docker
app_port: 7860
---

# AI Engineering Material SaaS Dashboard

這是一個為機電工程材料管理打造的前端 MVP 加後端示範 API 的專案。

## 已新增後端
- 使用 `Express` + `CORS` + `dotenv`
- 單一 Express 服務同時提供前端靜態檔案與後端 API
- 支援從 `nvidia API .txt` 讀取 NVIDIA API Key
- 提供 `/api/materials`, `/api/materials/:id`, `/api/price-history`, `/api/ai/query`, `/api/health`

## 本地開發

```bash
npm install
npm run dev
```

開發模式會啟動同一個 Express 伺服器，並透過 Vite middleware 提供熱重載前端與 API。

## 佈署流程

```bash
npm install
npm run build
npm start
```

生產模式會先編譯前端到 `dist`，再由 Express 提供靜態資源與 API。

## 環境變數

請依照 `.env.example` 建立 `.env`：

```env
PORT=4000
APP_PASSWORD=your_secret_password
OPENAI_API_KEY=your_openai_api_key
NVIDIA_API_URL=https://api.nvidia.com/v1/ai/query
NVIDIA_API_KEY=your_nvidia_api_key
```

請將 NVIDIA API Key 以純文字形式放在專案根目錄的 `nvidia API .txt` 檔案中，伺服器啟動時會自動讀取該金鑰；如果你希望，也可以直接設定 `NVIDIA_API_KEY` 環境變數。

## 部署說明

目前此專案是一個 Node + React 雙層應用：
- 前端：Vite
- 後端：Express

若要部署到 Hugging Face Spaces，請選擇可以執行 Node.js 的動態空間，或使用其他支援 server-side 的平台。