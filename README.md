# pi-bao-health-tracker

這是一個由 Vite 提供支援的 React 應用程式。

## 執行與開發

1. **安裝依賴套件**:
   ```bash
   npm install
   ```

2. **開發環境測試**:
   啟動本機伺服器：
   ```bash
   npm run dev
   ```

3. **專案打包**:
   建立產品環境的建置檔案：
   ```bash
   npm run build
   ```

## 部署

本地端會自動透過 `.github/workflows/deploy.yml` 將 `main` 分支推送到 GitHub Pages。
推送後，你的修改會自動發布到 GitHub Pages。

## 開發任務紀錄
*   **package.json**: 確認所有依賴 (React, Vite 等) 版本並透過 `npm install` 與 `npm run build` 安裝與驗證成功
*   **.github/workflows/deploy.yml**: 設定 `pages: write` 允許 Vite 建置出的 `dist` 目錄上傳至 GitHub Pages。
*   **.gitignore**: 新增 `.env`、`.env.*` 確保金鑰不外洩。
*   **vite.config.ts**: 設定 `base: '/pibao/'` 修正 GitHub Pages 靜態資源空白的問題。
