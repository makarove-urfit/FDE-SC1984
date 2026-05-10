# S2: LINE 綁定流程設計筆記（草稿）

**狀態**：草稿筆記，等 S1 測試結果回來再寫成完整 spec
**前置依賴**：`docs/superpowers/specs/2026-05-09-liff-param-test-page-design.md`（S1）
**相關 plan**：`docs/superpowers/plans/2026-05-09-liff-param-test-page.md`

> 這份是 S1 brainstorm 過程中順手記下的 S2 觀察。**不是設計方案**，只是「之後寫 S2 spec 時必須回來看的事實清單」。

---

## 觸發契機

使用者在 S1 brainstorm 期間問：「後台『客戶管理 modal』裡的『下單帳號信箱』欄位，LINE LIFF 完成後是不是會調整？」

答案：會。需要在 S2 處理。

## 「下單帳號信箱」現有角色（容易誤解）

位置：`customers.custom_data.contact_email`（branch 那筆 customer 記錄）

**它不是登入帳號本身**。它是兩個用途的混合：

1. **邀請流程的預填值**
   - admin 建分店時填這個 email
   - 被 base64 包進邀請連結 `?ct=...` 一起發給客戶
   - 客戶在 LINE 點連結 → `InvitePage.tsx` 用 `defaultEmail` 預填表單
   - 客戶只要設密碼就完成綁定

2. **業務聯絡資訊**
   - 業務寄報表、通知、對帳用

**真正的登入帳號**在另一張表：`custom_app_auth_{APP_SLUG}` —— 由 `custom-app-auth/register` 在 InvitePage 流程末段建立。`customers.custom_data.contact_email` 與 `custom_app_auth.email` 是**不同記錄**，只是值通常一樣。

> ⚠️ 寫 S2 spec 時，先用 db-query skill 連 DB 確認上述 schema 是否仍正確 — 這份筆記是 2026-05-10 當天閱讀程式碼推論，沒有實際查表驗證。

## 既有相關檔案

- `vfs/admin/src/pages/admin/CustomersPage.tsx` — 客戶管理 modal，三處 `下單帳號信箱` label（建立、編輯分店、加新分店）
- `vfs/admin/actions/create_customer_bundle.py` — 建客戶 + 分店 + 聯絡人 bundle action，produce `invite_token`
- `vfs/admin/actions/list_customers_for_me.py` — 列客戶
- `vfs/ordering/src/pages/InvitePage.tsx` — 客戶端邀請落地頁，吃 ct param
- `vfs/ordering/actions/redeem_invite_token.py` — server 端兌換 token、綁定分店

## 路線 1（理想）採用後的 S2 工作項

**前提**：S1 測試結果證實「LIFF URL 帶 query 參數可以抵達 ordering app」

| 區塊 | 工作 |
|------|------|
| **schema** | `customers.custom_data` 新增 `line_user_id`、`bound_at` 兩個 key（最快），或新建 `customer_line_bindings` mapping 表（規矩，要動 `db_admin.py`） |
| **admin/客戶 modal** | 「下單帳號信箱」label 改為「聯絡 email」（語意更準），旁邊加「綁定狀態」欄：未綁 / 已綁定 LINE 顯示名 + userId |
| **admin/邀請連結** | 改用 LIFF URL 格式 `https://liff.line.me/{LIFF_ID}?invite={invite_token}`（取代現有 `/runtime/{slug}/?ct={base64}`）。「複製連結」按鈕產生這種 URL |
| **ordering/前端** | 進站時偵測 `invite` query param + LIFF SDK 抓 LINE userId → 一次性 POST 到綁定 action |
| **ordering/action** | 新增 `bind_line_user_to_branch`（吃 `invite_token` + `line_id_token` 或 `line_user_id`）→ 寫入 `customers.custom_data.line_user_id` 與 `bound_at`；同時把 `invite_token` 標記為已用 |
| **ordering/後續登入** | 既有客戶從 LINE 進來時，無 `invite` 參數但有 LINE userId → server 查 `customers` where `custom_data.line_user_id = ...` → 直接發 token 登入 |
| **舊 InvitePage** | 路線 1 純成功後可廢除；過渡期保留為 fallback |
| **email/密碼登入** | LoginPage 是否完全廢除待定 — 業務後台帳號可能仍需要密碼登入；客戶端可以廢除 |

## 路線 2（OTP 備案）採用後的 S2 工作項

**前提**：S1 測試結果證實「LIFF 把 query/hash 都吃掉，參數抵達不了」

差異：
- 不需要新的 LIFF URL 格式，業務發通用 LIFF URL（不帶參數）
- admin/客戶 modal 多一個「產生 6 位 OTP」按鈕，列已產生但未使用的 OTP + 失效時間
- schema：除了 `line_user_id`、`bound_at`，多 `pending_otp`、`otp_expires_at`（建議放 OTP 專用表，避免 OTP 過期後汙染 customers 記錄）
- ordering 端：第一次進來偵測 LINE userId 已綁 → 直接登入；未綁 → 跳「請輸入業務給的 6 位密碼」畫面 → 後端 action 比對 OTP，找到對應 branch、寫入 `line_user_id`、把 OTP 標記為已用

## 兩條路線都會踩到的共同問題

1. **scope = `openid, profile`** — `liff.getProfile().userId` 與 `liff.getDecodedIDToken().sub` 都應該可拿；S1 測試會確認哪個比較穩
2. **LIFF 在桌面瀏覽器點擊**會跳 LINE Login web flow（非 LINE 內），這時 `liff.isInClient() === false` — 需要在前端設計成這個情境也能 fallback（或顯示明確訊息「請在 LINE 內開啟」）
3. **LIFF Add Friend = aggressive** — 客戶第一次進來會被引導加 OA 好友，這是好事（之後業務可以推播），但要在客戶溝通文宣標明
4. **多分店共用同一個 LINE 帳號**的情境 — 一個老闆有 3 家分店、用同一個 LINE，目前 schema 是「branch ↔ LINE userId」一對一綁定。S2 要決定：
   - (a) 不准（同 LINE 只能綁一店）— 簡單但限制大
   - (b) 准（一 LINE → N branches）— UI 要做切換，shema 要改成 N:N

## S2 spec 撰寫前必做

1. 等 S1 測試報告（`docs/superpowers/specs/2026-05-09-liff-test-results.md`，待產）
2. 用 db-query skill 連 DB 驗證上述 schema 假設
3. 用 verifying-oltp-tables skill 確認 `customers` ↔ `custom_app_auth_*` 的實際關聯（光看程式碼推論不夠）
4. 重新跑 brainstorming 流程，這份筆記只是輸入材料之一

## 不會在 S2 處理的事（推到 S3）

- LINE Rich Menu 設定 / 圖片設計
- LINE OA bot 自動回應 / 客服
- 行銷推播
- 把 ordering 的 `BottomNav` 收掉、改用 LINE 原生 menu
