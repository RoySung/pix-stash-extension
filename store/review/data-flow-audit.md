# 權限與資料流盤點

日期：2026-11-03；範圍：目前 src、wxt.config.ts 與 Chrome production build。這是原始碼檢查，動態測試的範圍另見 release/。

## 資料流

| 動作 | 讀取與處理 | 保存／接收者 |
| --- | --- | --- |
| 網頁載入 | content script 初始化語言與訊息監聽；不在初始化時自動掃描或保存圖片 | 語言從 browser.storage.local 讀取 |
| 開啟收集介面 | 讀取目前分頁網址、標題，按訊息偵測 meta 圖片、指定網站圖片或候選 img | 先回傳擴充功能介面，尚未建立圖庫項目 |
| 儲存頁面圖片 | 向候選圖片 URL 發出 fetch，轉換為 data URL 及預覽 | 圖片與來源資訊存入 IndexedDB |
| 圖片轉存失敗 | 彈窗收圖流程保留遠端 URL；右鍵收圖流程則回傳失敗 | 彈窗流程的圖庫／預覽可能再次請求圖片來源 |
| 即時／區域截圖 | captureVisibleTab，區域模式在本機 canvas 裁切 | 圖片及來源資訊存入 IndexedDB |
| 整理 | 資料夾、標籤、筆記、擷取時間、模式、尺寸、來源類型 | IndexedDB pixstash v2 的 items、collections |
| 偏好 | 語言、圖庫顯示方式與圖片大小 | localStorage；語言另存 browser.storage.local |
| 回訪來源 | 由使用者點選來源連結 | 在新分頁開啟來源網站 |
| 刪除素材 | 刪除對應 IndexedDB 紀錄 | 不承諾磁碟鑑識等級抹除 |
| 刪除資料夾 | 刪除資料夾與項目上的對應關聯 | 素材本身保留；可能仍屬其他資料夾 |

截圖與筆記可能包含個人或敏感內容；來源網址亦可能包含查詢參數或權杖。使用者應選擇合適內容，政策不可宣稱完全不處理個資。

## 外部服務

在應用原始碼中未發現開發者後端、帳號、廣告、分析 SDK、遙測或雲端同步入口。這是已檢查範圍內的發現，不是對所有執行環境的保證。外部圖片來源／來源頁會依請求得知 IP 等一般連線資訊，並受其政策約束。字型及主要程式碼隨擴充功能打包。

發現正式版可用 ?mock=1 載入 Picsum 測試圖庫；已將測試圖庫初始化移至 import.meta.env.DEV 區塊。正式包應無 dev-seed、picsum.photos 或 inspector 入口；以壓縮檔檢查及動態驗證為準。

## 權限結論

| 權限 | 實際位置與用途 | 結論 |
| --- | --- | --- |
| activeTab | background captureVisibleTab、目前分頁操作 | 保留，支援使用者操作後的目前分頁擷取 |
| contextMenus | background onInstalled／onClicked | 保留，圖片右鍵收集與操作選單 |
| scripting | background executeScript | 保留，向已開啟但尚未載入腳本的分頁補注入 |
| storage | i18n.ts set、content script get | 保留，儲存與讀取語言 |
| tabs | background tabs.query/get 的 URL、title | 已移除；在目前網站授權下仍可取得必要來源資訊，動態驗證通過 |
| <all_urls> 主機授權 | 外站／CDN 圖片讀取、分頁資訊與注入 | 跨站圖片來源無固定白名單，因此目前保留。不是雲端上傳權限 |
| <all_urls> content script | 跨網站訊息監聽、區域選取與收集提示 | 可改成操作時注入，但須另行設計與測試，這次未改動 |

本次已移除 tabs，並以獨立瀏覽器驗證來源資訊、收圖、截圖與區域擷取。保留全站主機授權以支援任意來源網站與第三方圖片主機；按需注入及動態主機授權屬後續架構改善，不在此次發布修正範圍。

## 官方參考

- [Tabs API 與權限](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [隱私欄位](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [資料政策 FAQ，包含本機處理](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
