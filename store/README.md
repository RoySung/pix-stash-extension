# PixStash 商店上架準備

狀態：準備中，尚未送審。更新日期：2026-11-03。

此資料夾統一管理商店文案、品牌素材、截圖及送審資料。先以 Chrome Web Store 為準備方向，Firefox Add-ons 為後續待確認渠道。平台欄位與素材規格需在送審前對照官方後台確認。

自動打包與送審設定請見 [Chrome Web Store CI/CD](../docs/chrome-web-store-deployment.md)；部署使用 WXT 的 `wxt submit`。

## 目錄

- `copy/zh-TW.md`：繁中文案草稿。
- `copy/en-US.md`：英文文案草稿。
- `assets/icons/`：由 public/icon 複製的現有圖示，修改來源後需重新同步。
- `assets/screenshots/`：已製作繁中／英文各 5 張真實操作截圖。
- `assets/promotional/`：已製作繁中／英文各 2 張商店宣傳圖。
- `assets/BRIEF.md`：視覺素材腳本與交付命名。
- `review/checklist.md`：送審檢查與待確認資訊。
- `review/privacy-and-permissions.md`：權限用途與隱私揭露準備筆記，非已發布政策。

文案依目前原始碼整理；實際操作驗收與商店欄位審核仍待執行。不要宣稱整頁長截圖、跨裝置同步、雲端備份或匯出功能。

素材交付與來源說明請見 [assets/README.md](assets/README.md)。

## 送審準備進度（2026-11-03）

開發者：RoySung；支援信箱：roysunghan@gmail.com。權限盤點、政策草稿、支援頁檔案、本機驗收及發布候選 ZIP 均已準備。

- [完整上架檢查表](review/checklist.md)
- [資料流盤點](review/data-flow-audit.md)
- [公開政策／支援頁待部署檔案](publish/README.md)
- [發布候選包與測試紀錄](release/README.md)

下一步：補公開頁面網址，完成原生右鍵選單與目標網站人工驗收，再填商店後台送審。
