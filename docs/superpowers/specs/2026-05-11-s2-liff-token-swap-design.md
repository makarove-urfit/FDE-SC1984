# S2：LIFF Token Swap 設計（B-fake）

**狀態**：草稿
**前置**：S1 完成（`docs/superpowers/specs/2026-05-09-liff-test-results.md`）
**日期**：2026-05-11

## 目標

LINE 客戶點 LIFF URL → 平台自動把 LIFF id_token 換成 Custom App User Token → 寫 localStorage → ordering 直接載入。**全程 0 密碼、0 email 補填、0 客戶手動操作。**

代價：DB 的 `email` 欄填假值 `line_<sub>@line.no-email.local`（`.local` TLD 不 routable）。可接受，需要真 email 時可後續 migration。

## 三 repo 改動範圍

| Repo | 分支 | 改動 |
|------|------|------|
| AI-GO | 新切 `feat/liff-token-swap`（從 `dev`） | backend 1 endpoint、frontend 1 hook |
| FDE-SC1984 | 留 `feat/daily-reports` | App.tsx 加 LIFF invite 解析與呼叫 |
| LINE Developers Console | — | 不動（scope 仍是 `openid, profile`） |

**重要設計決策**：**不新增 ext action**。FDE 端複用既有 `redeem_invite_token`，input 只需 `{ token }`，跟既有 `?ct=base64({token,email})` invite 流程共用同一個綁定機制（`customer_custom_app_user_rel` 表）。

## AI-GO Backend

### 新 endpoint：`POST /api/v1/custom-app-oauth/{slug}/liff-swap`

檔案：`backend/app/api/custom_app_oauth.py`（與既有 LINE OAuth 邏輯同檔）

**Request**:
```json
{ "id_token": "<LINE id_token JWT>" }
```

**Response（success）**:
```json
{
  "access_token": "<HS256 JWT>",
  "refresh_token": "<hex64>",
  "expires_in": 900,
  "user": { "id": "...", "email": "line_U.../@line.no-email.local", "display_name": "...", ... }
}
```

**Response（fail）**: 標準 4xx/5xx with detail message。

**Backend 邏輯（pseudo-code）**:
```python
@router.post("/{app_slug}/liff-swap")
async def liff_token_swap(app_slug, body, request, db):
    # 1. 撈 app + origin 白名單
    app = await get_app_for_user_auth(app_slug, db)
    check_origin_allowed(request, app)

    # 2. 撈 LINE provider 設定（既有 model）
    provider_config = await get_provider_config(app, provider="line", db)
    channel_id = provider_config.client_id
    channel_secret = decrypt(provider_config.client_secret_encrypted)

    # 3. 驗證 id_token（重用既有 helper）
    payload = _line_decode_id_token(body.id_token, channel_secret, channel_id)
    # raises 401 if 過期 / 簽章錯 / iss/aud 錯

    sub = payload["sub"]
    name = payload.get("name") or f"LINE_{sub[:6]}"
    picture = payload.get("picture")

    # 4. 生成 placeholder email
    placeholder_email = f"line_{sub}@line.no-email.local"

    # 5. 重用既有 _find_or_create_user
    user = await _find_or_create_user(
        app=app, provider_config=provider_config,
        provider_uid=sub, email=placeholder_email,
        display_name=name, avatar_url=picture,
        profile_data=payload, db=db,
    )
    # 第一次：identity 找不到 + 假 email 也是新的 → 建 user
    # 第二次：identity (sub) 命中 → 回現有 user
    # _find_or_create_user 在 email != None 時不會回 None

    # 6. 發 token pair
    tokens = await create_token_pair(user, db)
    await db.commit()

    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "expires_in": tokens["expires_in"],
        "user": CustomAppUserResponse.model_validate(user),
    }
```

**重用的既有元件（不動）**:
- `_line_decode_id_token`（`custom_app_oauth.py:313-333`，HS256 驗證）
- `_find_or_create_user`（`custom_app_oauth.py:110-266`）
- `get_app_for_user_auth` / `check_origin_allowed`（既有 helper）
- `create_token_pair`（`custom_app_auth_utils.py:86-114`）
- `CustomAppUserResponse` schema（既有）

### 不動的事
- `CustomAppUser` model schema（email NOT NULL 維持）
- alembic migration（不寫）
- `_pending_oauth` 機制（這版用不到）

## AI-GO Frontend

### 改 `frontend/src/hooks/useAppRuntime.ts`

在主 useEffect（即現有第 182 行 `getCustomAppAccessToken(slug)` 那行）**之前**插入 LIFF hash 偵測：

```typescript
// 在 useEffect 開頭、getCustomAppAccessToken 之前
if (authType === 'custom_app') {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const liffIdToken = hashParams.get('id_token');
  const liffContextToken = hashParams.get('context_token');

  if (liffIdToken && liffContextToken) {
    try {
      const res = await fetch(`/api/v1/custom-app-oauth/${slug}/liff-swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: liffIdToken }),
      });
      if (res.ok) {
        const tokens = await res.json();
        setCustomAppTokens(slug, tokens);
        // 清掉 hash 防 refresh 重 swap，但保留 search（liff.state=?invite=... 由 ordering 解析）
        window.history.replaceState({}, '', window.location.pathname + window.location.search);
        // 不 return，讓下面的 getCustomAppAccessToken 自然撈到剛寫的 token
      } else {
        // swap 失敗 → fallback 到既有 wrapper 邏輯（不 return，繼續走 getCustomAppAccessToken，會發現沒 token → wrapper）
      }
    } catch {
      // swap 例外 → 同上 fallback
    }
  }
}
// 繼續走原本：const token = await getCustomAppAccessToken(slug); ...
```

### 不動的事
- `CustomAppAuthLogin.tsx`、`ExternalAppRuntimePage.tsx`（fallback 路徑沿用既有）
- `setCustomAppTokens` 函式本身

## FDE-SC1984 Ordering

### 改 `vfs/ordering/src/App.tsx`

**新增常數**（在第 90 行 `_initInvite` block 之後）：
```typescript
// LIFF 流程：liff.state 內層的 ?invite=<token>
const LIFF_INVITE_TOKEN: string = (() => {
  try {
    const liffState = new URL(window.location.href).searchParams.get("liff.state");
    if (!liffState) return "";
    const inner = liffState.startsWith("?") ? liffState.slice(1) : liffState;
    return new URLSearchParams(inner).get("invite") || "";
  } catch { return ""; }
})();
```

**新增 state**：在 App 函式既有 useState 群裡加一個 `branchesNonce`，預設 0。

**改既有 useEffect**：找到既有「load branches」useEffect（依賴 `[user]` 那個），把 deps 改成 `[user, branchesNonce]`。

**新增 useEffect**（在 App 函式內，user load 後執行）：
```typescript
useEffect(() => {
  if (!user || !LIFF_INVITE_TOKEN) return;
  db.runAction("redeem_invite_token", { token: LIFF_INVITE_TOKEN })
    .then(() => {
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
      setBranchesNonce(n => n + 1);  // 觸發 list_my_branches 重新撈
    })
    .catch((e) => console.error("[LIFF] redeem_invite_token 失敗:", e));
}, [user]);
```

**為什麼要 nonce**：避免 race condition — ordering 載入時 `list_my_branches` useEffect 和新 redeem useEffect 平行觸發，list 可能在 redeem 完成前就回傳（看不到剛綁好的 rel 列），導致 BranchPicker 不顯示新分店。Nonce + redeem 成功後遞增 = 強制 list 重撈一次。

### 不動的事
- `LoginPage.tsx`、`InvitePage.tsx`（legacy email + ct 邀請流程保留）
- `redeem_invite_token.py` action（直接重用）
- `list_my_branches.py` action（綁定資料寫到既有 rel 表，現有查詢邏輯自然吃到）
- `LiffTestPage.tsx`、`LIFF_TEST_MODE`（保持 false 不影響）

## LINE Developers Console

不動。LIFF App scope 維持 `openid, profile`。

## 資料流時序

```
[首次 LIFF（含 invite）]
LINE 對話點 https://liff.line.me/{LIFF_ID}?invite=<token>
   ↓ LINE 同意頁（profile + userId），「許可」
   ↓ LIFF redirect → ordering.apps.ai-go.app/ext-runtime
                     ?liff.state=%3Finvite%3D<token>
                     #context_token=...&access_token=...&id_token=...
   ↓ useAppRuntime hook：偵測 hash 有 id_token + context_token
   ↓ POST /custom-app-oauth/{slug}/liff-swap { id_token }
   ↓ backend：驗 JWT、_find_or_create_user(假 email)、create_token_pair
   ↓ frontend：setCustomAppTokens(slug, tokens)、清 hash（保留 search）
   ↓ useEffect 下一輪：getCustomAppAccessToken → 撈到 token → loadAndCompile
   ↓ Shadow DOM render → ordering main.tsx → React 啟動
   ↓ App.tsx：user 從 localStorage 自動載入（已登入態）
   ↓ LIFF_INVITE_TOKEN 解出 → useEffect 偵測 invite + user → redeem_invite_token
   ↓ 既有邏輯：找 branch by invite_token → 寫 customer_custom_app_user_rel
   ↓ clearReplace URL → 進主畫面

[第二次以後（無 invite）]
LINE 對話點 https://liff.line.me/{LIFF_ID}（無 invite）
   ↓ swap 流程同上（identity 命中既有 user，無新 row）
   ↓ ordering 載入，LIFF_INVITE_TOKEN = "" → 不呼叫 redeem
   ↓ 既有 list_my_branches 撈到該 user 的 branches → BranchPicker / 主畫面
```

## Auth / Security

| 防線 | 機制 |
|------|------|
| /liff-swap 未授權呼叫 | origin 白名單（同 register/login） |
| 偽造 id_token | HS256 簽章（channel_secret 攻擊者拿不到） |
| 換 channel 的 id_token | audience 驗證（aud === channel_id） |
| 換 issuer | issuer 驗證（iss === `https://access.line.me`） |
| Replay | id_token `exp` 1 小時自然過期；無額外 nonce 機制（YAGNI） |
| bind 偽造 | redeem_invite_token 需 Bearer token、用 ctx.user.id（platform 端可信） |
| 重複 redeem | 既有 dedup 邏輯（rel 表已綁過就 skip） |

## 假 email 影響

- 格式：`line_<sub>@line.no-email.local`（`.local` TLD 不 routable，發信不會誤投）
- unique constraint `(custom_app_id, email)` 因 sub 唯一而保有意義
- 副作用：admin 看 customers 表會看到 `line_U...@line.no-email.local`，建議 future work 加 mask 顯示「LINE: <displayName>」
- 反向 migration（之後想拿真 email）：admin 後台讓客戶手動填、或啟用 LIFF email scope 再 backfill

## 錯誤處理

| 情境 | 行為 |
|------|------|
| hash 無 id_token | 不觸發 swap，走 localStorage 檢查（既有路徑） |
| id_token 過期/簽章錯 | backend 401 → frontend fallback wrapper |
| `_find_or_create_user` 拋例外 | backend 500 → frontend fallback wrapper |
| 同 invite_token 重複點 | 既有 dedup（rel 已存在不重插） |
| swap 成功但 redeem 失敗 | console.error，不阻斷主流程（user 可看 BranchPicker） |
| 桌面瀏覽器點 LIFF（非 LINE 內） | LINE 平台會跳 Web OAuth flow，可能 hash 沒 id_token → wrapper（user 用 email/密碼登入） |

## 測試策略

無 staging，分段手動測 production：

1. **swap endpoint 單獨測**：用 curl + 真 LINE id_token（從 LiffTestPage 抓）打 `/liff-swap`，確認回正確 token shape
2. **frontend 整合測**：開 `LIFF_TEST_MODE = true` 部署 ordering、點 LIFF URL，確認 useAppRuntime 攔截成功、寫入 localStorage、清 hash、LiffTestPage 看到「已登入態」
3. **bind 完整測**：admin 後台產生新 invite_token、客戶（手機 LINE）點 `?invite=<token>` LIFF URL、確認 `customer_custom_app_user_rel` 表多一筆、BranchPicker 顯示該分店

## 部署順序

1. AI-GO `feat/liff-token-swap`：backend + frontend 改完、merge to dev（測 dev 環境... 喔等等沒 dev 環境）→ merge to main → auto deploy → 同時開始效力
2. FDE-SC1984：App.tsx 改完、`python3 vfs/scripts/deploy_ordering.py`
3. 順序：**先部 AI-GO（提供 endpoint）再部 FDE（使用 endpoint）**。AI-GO 部完但 FDE 還沒 → 沒人會呼叫新 endpoint，0 副作用。

## 不在範圍內

- LINE Developers Console 加 email scope（之後若想用真 email 才做）
- 假 email 反向遷移（future work）
- LIFF SDK 載入失敗的根因排查（CSP？S1 發現但不影響本設計）
- admin 客戶 modal「下單帳號信箱」label 改名為「聯絡 email」加綁定狀態欄（拉到 S2.1 後續）
- Rich Menu 替換登入頁（S3）
