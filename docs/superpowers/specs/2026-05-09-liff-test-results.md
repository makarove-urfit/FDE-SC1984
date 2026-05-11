# LIFF 參數測試結果（S1 結論）

**測試日期**：2026-05-10
**LIFF ID**：`2009976374-VYUpM905`
**LIFF Endpoint**：`https://ordering.apps.ai-go.app/ext-runtime`
**Scopes**：`openid, profile`
**測試人 LINE userId**：`U9d748b63373fe09c8ad25064b37a8e43`（徐培鈞）
**測試環境**：Pixel 8 + LINE 26.6.1 LIFF browser
**對應 spec**：`docs/superpowers/specs/2026-05-09-liff-param-test-page-design.md`

## TL;DR

**路線 1 完全可行，S2 走路線 1。**

- 自訂參數**只有 query string 形式**（`?key=value&...`）能存活，會被 LIFF 包進 `?liff.state=...` 的 URL-encoded 內層
- hash 形式（`#key=value`）被 LIFF 吃掉
- path 形式（`/path?key=value`）被當字串塞進 `liff.state`，無法乾淨解析
- **LINE userId、姓名、頭像**永遠在 hash 的 `id_token`（JWT）裡，純前端解 base64 第二段就能拿到
- **不需要 LIFF SDK**（在 LINE 內建瀏覽器載入永遠失敗，可能 CSP 擋）
- AI GO 平台會自動把 LINE OAuth 換成 Custom App User Token（hash 裡的 `access_token`，HS256）

## 5 組 URL 完整結果

| # | 測試 LIFF URL | `search` | `liff.state` 解出 | 結論 |
|---|---|---|---|---|
| 1 | `https://liff.line.me/{LIFF_ID}` | `""`（空） | `null` | 進站正常，無自訂參數 |
| 2 | `?cust=ABC123` | `?liff.state=%3Fcust%3DABC123` | `{cust: "ABC123"}` | ✅ 乾淨 |
| 3 | `?cust=ABC&token=XYZ` | `?liff.state=%3Fcust%3DABC%26token%3DXYZ` | `{cust: "ABC", token: "XYZ"}` | ✅ 乾淨多參數 |
| 4 | `#cust=ABC123` | `?liff.state=%23cust%3DABC123` | `{"#cust": "ABC123"}` | ❌ hash 被 URL-encode 進 liff.state，內層 `#cust=...` 不是合法 query string |
| 5 | `/some/path?cust=ABC` | `?liff.state=%2Fsome%2Fpath%3Fcust%3DABC` | `{"/some/path?cust": "ABC"}` | ❌ path 也被當字串塞進去 |

每組的 `hash` 都包含相同結構的 LIFF token bundle：
```
#context_token=<JWT-ES256>&access_token=<JWT-HS256>&feature_token=<opaque>
&id_token=<JWT-ES256>&client_id=2009976374&mst_challenge=<opaque>
```

## id_token 解析（每組都一致）

JWT 第二段 base64url decode：

```json
{
  "iss": "https://access.line.me",
  "sub": "U9d748b63373fe09c8ad25064b37a8e43",
  "aud": "2009976374",
  "exp": 1778427422,
  "iat": 1778423822,
  "name": "徐培鈞",
  "picture": "https://profile.line-scdn.net/0heYkBsKOPOnZWOyrO5ZJFIWp-NBshFTw-LgpzEiY4YkZyDX0mPVl2GXYzZk96D34ibFlwF3VoZhYu"
}
```

- `sub` = LINE userId — 路線 1 綁定的核心鍵
- `aud` = LIFF channel ID（LIFF ID 的數字部分）
- `exp - iat = 3600`（一小時，每次點擊都新鮮簽發）

## context_token 結構（解析第二段）

```json
{
  "type": "utou",
  "utouId": "0e9d7d52-16ed-4ade-b4b3-0fe0aef05686",
  "userId": "U9d748b63373fe09c8ad25064b37a8e43",
  "liffId": "2009976374-VYUpM905",
  "viewType": "full",
  "endpointUrl": "https://ordering.apps.ai-go.app/ext-runtime",
  "scope": ["openid", "profile"],
  "hasLinkedBot": false,
  "permanentLinkPattern": "concat",
  "...": "其他能力旗標"
}
```

`userId` 也在這裡（與 id_token 一致）。但 id_token 是標準 JWT、有完整簽章可在後端驗證；context_token 是 LIFF 內部結構。**S2 應該用 id_token 不用 context_token**。

## 副作用觀察

1. **LIFF SDK 載入永遠失敗**（`script load failed` from `https://static.line-scdn.net/liff/edge/2/sdk.js`）
   - 推測：AI GO `/ext-runtime` 注了 CSP 擋掉 third-party script
   - **不影響可行性**：純前端解 hash JWT 就拿到所有需要的資訊
   - S2 設計**完全不依賴 SDK**

2. **AI GO 平台自動完成 OAuth 換 token**
   - hash 裡的 `access_token` 是 HS256（平台簽），不是 ES256（LINE 簽）
   - 表示平台已經把 LINE id_token 兌換成自己的 Custom App User Token
   - S2 前端綁定流程**直接拿這個 access_token** 打 ext action，不用再走 `custom-app-oauth/.../line/authorize`

3. **第一次進站會跳 LINE 同意頁 + 平台「外部應用—下單」綁定 email/密碼頁**（測試窗口期實際看到）
   - 同意頁：請求 `主要個人檔案資訊` + `內部識別碼` 權限，按「許可」即過
   - 平台 wrapper：要求 email/密碼 — **這是 AI GO 平台對首次 LINE 登入的客戶，強制建立一個 platform 端「下單帳號」的步驟**
   - **這個 wrapper 是 S2 必須要繞過的關卡**，否則「無密碼進站」目標破功（路線 1 還能做到「帶 invite_token 自動綁定客戶 ↔ LINE userId」，但客戶仍需先設一組 platform-level 密碼）

## S2 設計建議

### 邀請連結格式（admin 後台「複製連結」按鈕產生）

```
https://liff.line.me/2009976374-VYUpM905?invite=<branch.invite_token>
```

僅用 query string 形式（不能 hash、不能 path）。

### ordering 前端進站邏輯（取代 LiffTestPage 的核心解析）

```ts
// 1. 從 search.liff.state 解出原本 query 帶的 invite token
function extractInviteToken(): string | null {
  const liffState = new URL(window.location.href).searchParams.get("liff.state");
  if (!liffState) return null;
  const inner = liffState.startsWith("?") ? liffState.slice(1) : liffState;
  return new URLSearchParams(inner).get("invite");
}

// 2. 從 hash.id_token 解出 LINE userId / 姓名 / 頭像（client side preview，後端會再驗一次）
function extractLineProfileFromIdToken() {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const idToken = hashParams.get("id_token");
  if (!idToken) return null;
  const payload = idToken.split(".")[1];
  const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
  const decoded = JSON.parse(atob(padded));
  return { userId: decoded.sub, name: decoded.name, picture: decoded.picture };
}

// 3. 平台 access_token（直接拿來打 ext action）
function extractAccessToken(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get("access_token");
}
```

### server-side action（新增 `bind_line_user_to_branch`）

吃 `{ invite_token, id_token }`：
1. 驗 id_token 簽章（用 LINE 公鑰，可從 `https://api.line.me/oauth2/v2.1/certs` 拉，但要在 sandbox 白名單）
2. 從 id_token payload 取 sub（LINE userId）
3. 找 `customers` where `custom_data.invite_token = ?` AND `custom_data.kind = "branch"`
4. 寫入 `customers.custom_data.line_user_id = sub`、`bound_at = now`
5. 把 `invite_token` 標記為已用（或直接刪除該 key）
6. 回傳成功旗標

> ⚠️ 若 id_token 簽章驗證在 AI GO sandbox 跑不起來（記憶 `project_aigo_sandbox_imports.md` 顯示 random 等被擋；JWT 簽章驗證需要 `cryptography` 或類似套件，可能在白名單外），備案是**信任 platform access_token + ext context.user.id 已經是 LINE-authenticated user**，不在後端驗 id_token 簽章。

### 既有客戶第二次以後進站

- 沒有 `?invite=` 參數
- ordering 前端把 `id_token` 送給 server
- server 查 `customers` where `custom_data.line_user_id = sub` → 找到對應分店 → 直接發 token 登入
- 不再經過 InvitePage / LoginPage

### 「外部應用—下單」wrapper 真相（2026-05-10 查證 AI-GO repo 後校正）

**初版誤判**是「平台強制 email + 密碼」，查證 AI-GO repo 後實際情況：

- 那個畫面是 AI-GO 平台前端的 `CustomAppAuthLogin` 元件（`AI-GO/frontend/src/components/CustomAppAuthLogin.tsx`）
- 出現原因：`useAppRuntime` hook（`AI-GO/frontend/src/hooks/useAppRuntime.ts:182-191`）**不認得 LIFF 塞的 hash token**，只認 localStorage 的 Custom App user token 與 `?oauth_token=` query callback；LIFF 把 token 塞 hash 掉在死角，hook 判定 `needsAuth=true`，顯示登入頁
- `password_hash` model 允許 NULL（`AI-GO/backend/app/models/custom_app_auth.py:36`），**OAuth 用戶不必設密碼**
- email 仍強制（`/custom-app-oauth/{slug}/oauth/complete-email` body.email 必填，無 flag 可繞）
- wrapper **只跳第一次**，之後 localStorage 有 token 永遠無縫

### S2 三條解法（建議走 A）

| 方案 | 客戶體驗 | 工程成本 | 評價 |
|------|---------|---------|------|
| **A. 接受 wrapper 第一次跳** | 第一次填 email（無密碼），之後永遠無縫 | 0 程式改動 | ⭐ 推薦 |
| B. ordering 自己 swap LINE id_token → Custom App user token | 完全無縫 | 需平台提供 endpoint，跨產品線協調 | 跨團隊成本高 |
| C. LIFF App 啟用 email scope | 部分客戶 LINE 沒設 email 仍卡 | LINE Developers Console 設定 | 不可控 |

「不必設密碼」已達成 80% 無密碼精神；一次性填 email 由業務在發連結時協助即可。

## 不在範圍內的後續

- S2 完整 spec：依本報告 + 「外部應用—下單」處理方式決定
- S3：LINE Rich Menu 替換登入頁、無縫進站
- LIFF SDK 在 LINE 內建瀏覽器載入失敗的根因（CSP？）— 暫時不解，因為設計已不依賴 SDK
