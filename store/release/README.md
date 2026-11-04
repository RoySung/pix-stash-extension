# 0.1.0 發布候選包

日期：2026-11-03。狀態：本機檢查通過，尚未送審；仍有人工驗收與公開政策網址待辦。

## 本次發布修正

1. library/main.tsx：測試圖庫的載入與清理移入開發模式；正式版不再因 ?mock=1 建立測試素材，也不包含對應 Picsum 測試程式。
2. wxt.config.ts：移除重複的 tabs 權限，保留 activeTab、contextMenus、scripting、storage 及跨網站主機授權。

## 驗證

- pnpm typecheck：通過。
- pnpm test：3 個檔案，13/13 通過。
- pnpm zip：成功，輸出 pix-stash-extension-0.1.0-chrome.zip。
- smoke.cjs：獨立測試瀏覽器 13 項流程檢查通過；結果見 smoke-results.json。
- 實際 ZIP 共 29 個檔案，無開發測試圖庫、Picsum 入口、inspector、測試檔或 sourcemap，含字型授權。詳細大小與 SHA-256 見 package-audit.json。

重跑流程需從專案根目錄執行。smoke.cjs 支援 PLAYWRIGHT_MODULE、CHROMIUM_PATH 環境變數，不使用個人瀏覽器設定檔。圖片測試使用本機頁面，不代表所有網站均已測過。

## 人工驗收

使用此 ZIP 解壓後載入獨立 Chrome 設定檔，先不要帶入個人素材。測試圖片原生右鍵選單、工具列彈窗、目標網站與外部 CDN、限制頁面及錯誤提示。最後測試清除資料／移除擴充功能，確認測試圖庫資料已被移除。

不要用自己的主要圖庫驗證移除行為。功能程式或 manifest 再變更後，需重新驗證、打包及更新 ZIP 雜湊。
