# LIFF 參數測試頁設計（S1）

**狀態**：草稿，等使用者最終確認
**分支**：feat/daily-reports（待切新分支）
**日期**：2026-05-09

## 背景

會議定下「廢除傳統登入頁、改用 LINE LIFF 無縫進站下單」的目標。為避免後續設計綁定流程時走冤枉路，主管要求**先做技術驗證**：LIFF 點擊進來時，URL 上的自訂參數能不能抵達 ordering app。驗證結果會決定下一階段（S2）走哪一條路：

- **路線 1（理想）**：LIFF URL 帶客戶識別參數 → 第一次點擊系統同時拿到「參數」和 LINE userId → 直接 DB 綁定，全自動無密碼
- **路線 2（備案）**：若參數帶不過去 → 業務後台產 6 位 OTP → 客戶第一次進來輸入 OTP 完成綁定

這份 spec 只設計 **S1：測試端點本身**，不涵蓋 S2 / S3。

## 範圍

### 在範圍內

- 在 ordering app 內新增一個 LiffTestPage，能顯示：
  - URL 各來源（`window.location.search`、`hash`、`liff.state`）的完整內容
  - LIFF SDK 探測結果（`init`、`isInClient`、`isLoggedIn`、`getProfile`、`getIDToken`、`getDecodedIDToken`）
- 在 App.tsx 加一個 `LIFF_TEST_MODE` 開關，true 時整個 ordering app 直接接管成測試頁，跳過所有登入流程
- 提供 5 組標準測試 URL 範本與「複製結果為 JSON」按鈕，方便手動測試與回報

### 不在範圍內

- LINE userId ↔ 客戶 DB 綁定邏輯（S2）
- 6 位 OTP 流程（S2 備案）
- LINE 選單按鈕替換登入頁（S3）
- 自動化測試
- 後端 action（純前端工具）
- production 環境隔離 / feature flag 服務 — 用 git revert 處理

## 既有狀態觀察

- `vfs/ordering/src/pages/LoginPage.tsx:10-34` 前任已有 `DEBUG_INFO` textarea 嘗試從 `search` / `hash` / `liff.state` 三處抓 `ct` 參數，但結論未記錄
- `vfs/ordering/src/App.tsx:69-88` 已有同樣三來源邏輯為 InvitePage 服務
- `vfs/ordering/src/App.tsx:117-118` 會自動從 `localStorage` 載入登入態，導致已登入使用者跳過 LoginPage
- `vfs/ordering/package.json` 沒有 `@line/liff` 依賴；AI GO 平台對 VFS 的 npm install 行為不明
- LINE Developers 後台已設定完成：
  - LIFF Endpoint URL：`https://ordering.apps.ai-go.app/ext-runtime`（即整個 ordering app）
  - Scopes：`openid, profile`
  - LIFF ID：`2009976374-VYUpM905`

## 架構

### 檔案異動

**新增**
- `vfs/ordering/src/pages/LiffTestPage.tsx`

**修改**
- `vfs/ordering/src/App.tsx`
  - 頂部加常數 `const LIFF_TEST_MODE = true;`
  - 在 `App` 函式 `useState` 之後、第一個 `useEffect` 之前加：
    ```ts
    if (LIFF_TEST_MODE) return <LiffTestPage />;
    ```
  - import LiffTestPage

**不動**
- LoginPage、InvitePage、其他 actions、package.json、CSS、deploy 腳本

### LIFF SDK 載入

- 不加 npm 依賴，於 LiffTestPage 內動態注入 `<script>`：
  - URL：`https://static.line-scdn.net/liff/edge/2/sdk.js`
  - `onload`：呼叫 `liff.init({ liffId: "2009976374-VYUpM905" })`
  - 5 秒 timeout：若 script 未載入完成，標記 `sdkLoad: "timeout"`
- LIFF ID 寫死在 LiffTestPage 檔案常數，不抽 .env（測試代碼，會 revert）

## UI 結構

頁面從上到下四個區塊，全用 inline style，不引入新 CSS class：

### 區塊 1：標頭

- 標題「LIFF 參數測試頁」
- 提示文字「目前是測試模式，正式登入暫時關閉」
- 渲染時間戳記（讓多次測試結果可區分）

### 區塊 2：URL 來源解析

- `href`：`window.location.href`
- `search`：`window.location.search`
- `hash`：`window.location.hash`
- `liff.state`：若 `search` 內含 `liff.state` 參數，把它當 query 再 parse 一次顯示

每行 monospace 可選取複製。

### 區塊 3：LIFF SDK 探測

按執行順序顯示：

| 欄位 | 來源 |
|------|------|
| `sdkLoad` | script 載入狀態：`loading` / `ok` / `timeout` / `error: ...` |
| `init` | `liff.init()` 結果：`ok` / `error: ...` |
| `isInClient` | `liff.isInClient()` |
| `isLoggedIn` | `liff.isLoggedIn()` |
| `profile` | `liff.getProfile()` 結果：`{ userId, displayName, pictureUrl, statusMessage }` 或 `error: ...` |
| `idToken` | `liff.getIDToken()` 前 40 字 + `...`（防爆版）或 `null` |
| `decodedIdToken` | `liff.getDecodedIDToken()` pretty JSON 或 `error: ...` |

### 區塊 4：操作

- 「複製全部結果為 JSON」按鈕：把區塊 2 + 3 + 時間戳 + `navigator.userAgent` 序列化複製到剪貼簿
- 「重新跑 SDK 探測」按鈕：重新呼叫 SDK 系列 API（不重新載入 script）
- 5 組測試 URL 範本（顯示為可選取複製的 monospace 文字）：
  1. `https://liff.line.me/2009976374-VYUpM905`
  2. `https://liff.line.me/2009976374-VYUpM905?cust=ABC123`
  3. `https://liff.line.me/2009976374-VYUpM905?cust=ABC&token=XYZ`
  4. `https://liff.line.me/2009976374-VYUpM905#cust=ABC123`
  5. `https://liff.line.me/2009976374-VYUpM905/some/path?cust=ABC`

## 資料流

```
使用者在 LINE 點 LIFF URL
  → LIFF Platform 處理（可能改寫 URL）
  → 重導到 https://ordering.apps.ai-go.app/ext-runtime
  → ordering app 載入，App.tsx 執行
  → LIFF_TEST_MODE === true → return <LiffTestPage />
  → LiffTestPage 立即同步讀 window.location 各來源（區塊 2）
  → useEffect 注入 script 載入 LIFF SDK
  → SDK onload → liff.init() → 各探測 API → 更新 state（區塊 3）
  → 使用者按「複製為 JSON」回報
```

## 錯誤處理

每個 SDK API 各自 try/catch，不讓單一失敗中斷其他探測：

| 情境 | 顯示 |
|------|------|
| SDK script 載入失敗或 5 秒逾時 | `sdkLoad: "timeout"` 或 `"error: ..."` |
| `liff.init()` reject | `init: "error: ..."`，後續 API 全部跳過顯示 `skipped` |
| `isInClient() === false` | 正常顯示 `false`（一般瀏覽器測 URL passthrough 也是有效情境） |
| `getProfile()` reject（未登入 LINE） | `profile: "error: not logged in"` |
| `getIDToken()` 回傳 null（scope 不足或未登入） | `idToken: null` |
| `getDecodedIDToken()` reject | `decodedIdToken: "error: ..."` |

整頁絕不可白屏；最壞情況區塊 2 仍可顯示 URL 資訊。

## 測試計畫

無自動化測試。手動測試流程：

1. 開發完成後 `python3 vfs/scripts/deploy_ordering.py` 部署
2. 在 LINE 對話貼上測試 URL 1，點擊
3. LiffTestPage 開出 → 按「複製為 JSON」→ 貼回 chat
4. 重複 URL 2 ~ 5
5. 額外：在桌面瀏覽器直接打開 LIFF URL（看 LIFF 平台會不會 redirect 到 LINE Login web flow），記錄差異
6. 5 組結果整理成測試報告，包含三個結論：
   - **路線 1 可行性**：哪種 URL 形式（query / hash / path）的參數能存活到 ordering app
   - **LINE userId 取得方式**：`getProfile().userId` 與 `getDecodedIDToken().sub` 哪個可用 / 兩者一致與否
   - **S2 spec 建議方向**：路線 1 還是路線 2

## 退場機制

測試完成後二擇一：

1. 把 `LIFF_TEST_MODE` 改 false，留 `LiffTestPage.tsx` 在 codebase（之後再開測方便）
2. `git revert` 整個 PR，回到 main 完全乾淨

預設選 1（成本低、不留垃圾），但 PR review 時可重新討論。

## 風險

| 風險 | 影響 | 緩解 |
|------|------|------|
| 測試窗口期所有 LIFF 點擊（含正式客戶）都會看到測試頁 | 客戶看到 debug 畫面 | 測試窗口控制在分鐘等級；或限定測試時段 / 通知主管 |
| LIFF SDK CDN 不通 | 區塊 3 失敗 | 區塊 2（URL 解析）仍可呈現純前端結果 — 部分目標仍達成 |
| LIFF 把所有自訂參數都吃掉（最壞情境） | 路線 1 失敗 | 即為「應該走路線 2（OTP）」的決策依據，本身就是有效測試結果 |
| 測完忘記改回 false | LIFF 持續顯示測試頁 | PR 描述、commit message 強調，並建議測完當天就 revert |

## 後續

S1 完成 → 產出測試報告 → 開 S2 spec（依結果決定路線 1 或 2）→ 完成 S2 → 開 S3 spec（用 LINE Rich Menu 替換登入頁、無縫進站）。
