# Chrome Web Store CI/CD

使用專案已安裝的 WXT：`wxt zip` 打包，`wxt submit` 上傳並送審。
參考 [WXT Publishing](https://wxt.dev/guide/essentials/publishing)。

## 自動流程

- PR 與 `main` 更新：安裝鎖定依賴、型別檢查、測試、Chrome ZIP 打包；ZIP 保留為 GitHub Actions artifact 14 天。
- 推送 `v*` 標籤：先執行相同 CI，確認標籤等於 `v` 加上 `package.json` 版本，再使用通過檢查的 ZIP 執行 `wxt submit`。
- 手動執行 **Chrome Web Store** workflow：同樣檢查及打包，但只執行 `wxt submit --dry-run`，驗證憑證，不上傳或送審。
- 商店部署循序執行，不會取消正在上傳的工作。送審成功後仍需等待 Google 審核，審核通過後發布。

部署憑證僅提供給送審步驟；PR 的 CI 不讀取商店憑證。

## 首次設定

1. 在 Chrome Web Store Developer Dashboard 建立商店項目、完成首次手動上傳及必要的商店資料、隱私聲明與發行設定。WXT 無法建立商店項目。
2. 依照 [Chrome Web Store API 設定說明](https://developer.chrome.com/docs/webstore/using-api/)，啟用 API 並設定 OAuth 用戶端與 refresh token。憑證所屬帳號必須能管理該商店項目。
3. 執行 `pnpm submit:init`，選擇 Chrome 並完成互動設定。WXT 會產生本機 `.env.submit`；此檔已排除於 Git，請勿提交或貼到 issue／日誌。
4. 到 GitHub repository → Settings → Secrets and variables → Actions，新增下列 repository secrets，值沿用 `.env.submit`：

   | Secret | 用途 |
   | --- | --- |
   | `CHROME_EXTENSION_ID` | 商店項目的擴充功能 ID |
   | `CHROME_CLIENT_ID` | OAuth 用戶端 ID |
   | `CHROME_CLIENT_SECRET` | OAuth 用戶端密鑰 |
   | `CHROME_REFRESH_TOKEN` | OAuth refresh token |

5. 將 workflow 推送至預設分支後，在 Actions 手動執行 **Chrome Web Store**。確認 dry run 通過，再使用版本標籤正式送審。

目前 WXT 0.19.11 內建的 submit 工具使用上述 OAuth 設定；請依 `pnpm exec wxt submit --help` 確認本專案支援的參數。
`.env.submit.example` 提供欄位範本，不含憑證。

## 發布新版

1. 更新 `package.json` 的 `version`（Chrome 每次更新必須使用較高版本），將變更提交並推送至 `main`。
2. 在該提交建立相符的標籤，例如版本為 `0.1.1`：

   ```sh
   git tag v0.1.1
   git push origin v0.1.1
   ```

3. 在 Actions 查看 **Chrome Web Store** 執行結果，再到商店後台確認審核狀態。CI 失敗、版本不符或缺少 secret 時不會送審。

本機驗證憑證亦可執行（需先完成 `.env.submit`）：

```sh
pnpm zip
pnpm submit:chrome --dry-run --chrome-zip .output/*-chrome.zip
```

請在乾淨的輸出目錄執行，確保萬用字元只匹配當前版本的一個 Chrome ZIP。
dry run 只驗證認證，不代表商店內容或套件已通過審核。
