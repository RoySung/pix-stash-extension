# 商店圖像交付

完成日期：2026-11-03。共 14 張 PNG，繁中及英文各一套。

## 操作截圖

每張 1280×800，直接擷取目前 production build 的真實擴充功能介面，於獨立測試瀏覽器使用示範圖庫，未重繪介面。

1. 01-library：圖庫網格。
2. 02-list：列表與素材資訊。
3. 03-organize：資料夾與標籤整理。
4. 04-search：搜尋篩選。
5. 05-preview：大圖預覽。

原規劃的彈窗擷取畫面此次改為列表畫面，避免混用模擬的瀏覽器情境。

## 宣傳圖

- promo-small：440×280，品牌名稱、標語與原創插畫。
- promo-large：1400×560，品牌標語與真實圖庫截圖。
- 語言尾碼：zh-TW / en-US。

尺寸依據：[Chrome Web Store 圖像說明](https://developer.chrome.com/docs/webstore/images)。送出前仍以當時後台規格為準。

## 來源與修改

- 品牌圖示：專案 public/icon/128.png。
- 示範插畫：本次以 SVG 幾何圖形原創製作，來源位於 ../source/artwork/；未使用網路照片或第三方品牌。
- 示範來源網站為 example.com，僅作展示，不代表外部合作或背書。
- 字型：專案 Noto Sans TC，授權見 ../../src/assets/fonts/OFL.txt。
- 宣傳圖可編輯 HTML：../source/promo-*.html。
- 重製腳本：../source/render.cjs 與 promotional.cjs。從專案根目錄先 pnpm build，再用 Node 執行；可透過 PLAYWRIGHT_MODULE、CHROMIUM_PATH 指定本機套件與瀏覽器。使用 /tmp/pixstash-store-profile 獨立測試設定，不操作個人圖庫。
- manifest.json 記錄輸出尺寸與 SHA-256。

已完成尺寸驗證及全部 14 張的獨立視覺檢查。英文側欄會依實際介面寬度縮略較長資料夾名稱；整理視窗可見完整名稱。此項與產品現況一致。
