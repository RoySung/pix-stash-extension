# Chrome 商店送審欄位草稿

狀態：可供填寫參考，尚未提交。權限文字須與最終 manifest 完全一致；tabs 已從發布設定移除。

## Single purpose

PixStash helps users collect web images and screenshots into a local visual reference library and organize those references with folders, tags, and notes for later review.

## Permission justifications

- activeTab: Used after a user invokes collection or capture to access the active page and capture its visible viewport. Region capture crops that viewport locally.
- contextMenus: Provides user-triggered image collection and extension action menu commands to capture the viewport or open the library.
- scripting: Injects the bundled page-image detector and region-selection interface when a user invokes these features on a tab without the content script available.
- storage: Stores the language preference so the extension UI and injected capture interface can use the selected language.
- Host permissions (<all_urls>): Images selected by users may come from arbitrary websites and separate image/CDN hosts. The current implementation retrieves those images to create local library copies and supports the bundled capture interface on supported pages. It does not upload the library to a developer service.

## Remote code

No remote executable code is used in the reviewed production application. JavaScript and fonts are bundled with the extension. Remote image content is retrieved as media, not as application code. Confirm again against the final ZIP.

## Data usage worksheet

Do not automatically select “no data handling” because the library is local. Inventory to compare with the dashboard's current definitions:

- Website content: saved images/screenshots, page titles, image/source metadata.
- Browsing-related information: source URLs and website names attached to saved references; no complete browsing-history database was found.
- User-entered content: notes, tags, folder names; these can contain personal information even though PixStash does not require it.
- Preferences: language and display settings stored locally.
- Network requests: source image hosts may receive ordinary request information. This is not a developer analytics endpoint.

Dashboard selections must be decided using the current field definitions and actual final behavior. This worksheet is not a preselected or certified questionnaire response. Policy, listing, and dashboard disclosures must agree.

## Reviewer instructions

1. Open an ordinary HTTP/HTTPS page containing an image; no PixStash login is required.
2. Open the extension popup and save the detected page image.
3. Test visible viewport capture and region capture. For region capture, draw a region, then confirm; Escape cancels.
4. Right-click an ordinary page image and choose “Stash image to PixStash”.
5. Open the library. Create a folder, assign tags, add a note, search, and open the preview.
6. Open Settings to switch between Traditional Chinese and English.
7. Delete test items from the library. Data is stored locally in this browser profile.

Protected browser pages or restricted image hosts may not support all capture methods. Viewport capture is not full-page scrolling capture.

## Publisher fields still needed

- Developer display name: RoySung. Support email: roysunghan@gmail.com. Public support URL: pending.
- Published privacy policy URL and effective date.
- Confirm first-launch store, language, category, distribution regions, and visibility.
- Developer account registration, verification and security requirements must be checked in the publisher dashboard.

Official reference: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
