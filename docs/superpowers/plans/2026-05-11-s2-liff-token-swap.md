# S2 LIFF Token Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 客戶在 LINE 點 LIFF URL 後，AI-GO 平台自動把 LIFF id_token 換成 Custom App User Token、寫入 localStorage、ordering 載入並完成 invite 綁定，全程零互動。

**Architecture:** 新 endpoint `POST /api/v1/custom-app-oauth/{slug}/liff-swap` 驗證 LINE id_token（HS256）並用假 email `line_<sub>@line.no-email.local` 走既有 `_find_or_create_user` 建/找用戶；前端 `useAppRuntime` 在 localStorage 檢查前先偵測 hash 並打 swap；ordering App.tsx 從 `liff.state` 解出 invite_token 後呼叫既有 `redeem_invite_token`。

**Tech Stack:** AI-GO backend（FastAPI + pyjwt + SQLAlchemy）/ AI-GO frontend（Next.js + React hooks）/ FDE-SC1984 ordering（React + AI GO VFS）

**Spec：** `docs/superpowers/specs/2026-05-11-s2-liff-token-swap-design.md`

**測試框架說明：**
- AI-GO backend 有 pytest，但 `custom_app_oauth.py` 沒既有測試模板；新 endpoint 純粹編排既有 tested helpers，新邏輯只有「假 email 生成」一行。本 plan 採**手動端到端驗證**，跳過 unit test。
- AI-GO 沒 staging（記憶 `project_aigo_no_staging.md`），AI-GO 端的 deploy 由使用者手動 cherry-pick 到 main 觸發。
- FDE-SC1984 同樣手動部署。

---

## Task 1: 切 AI-GO 分支

**Files:** 無修改（純 git 操作）

- [ ] **Step 1：在 AI-GO repo 同步 dev 並切新分支**

```bash
cd /home/username/桌面/AI-GO
git fetch origin
git checkout dev
git pull --ff-only origin dev
git checkout -b feat/liff-token-swap
```

Expected：成功切到 `feat/liff-token-swap`，base 是 `origin/dev` 的最新 commit（`8959b24 feat: 整合 Resend 系統信功能`）

- [ ] **Step 2：確認位置**

```bash
git branch --show-current  # → feat/liff-token-swap
git log --oneline -1       # → 8959b24（或更新）
```

---

## Task 2: 新增 `/liff-swap` endpoint (AI-GO backend)

**Files:**
- Modify: `/home/username/桌面/AI-GO/backend/app/api/custom_app_oauth.py`（接在第 333 行 `_line_decode_id_token` 函式後、第 339 行 `@router.get("/{slug}/auth-providers")` 之前的 endpoint 區）

- [ ] **Step 1：在 schemas 加 request body 型別**

讀 `/home/username/桌面/AI-GO/backend/app/schemas/custom_app_auth.py` 在 `OAuthCompleteEmailRequest` 那行（約 131）後加：

```python
class LiffSwapRequest(BaseModel):
    id_token: str
```

- [ ] **Step 2：在 custom_app_oauth.py imports 補上新型別**

找到第 40-44 行的 schema imports，把 `LiffSwapRequest` 加進去：

```python
from app.schemas.custom_app_auth import (
    CustomAppAuthTokenResponse,
    CustomAppUserResponse,
    OAuthCompleteEmailRequest,
    LiffSwapRequest,  # 新增
)
```

- [ ] **Step 3：在 custom_app_oauth.py 加 endpoint**

緊接在 `_line_decode_id_token` 函式（第 333 行結束）之後、`# ============================================================` 分隔線之前，加入：

```python
# ============================================================
# LIFF Token Swap — LINE 客戶端 id_token → 平台 access_token
# ============================================================

@router.post("/{slug}/liff-swap", response_model=CustomAppAuthTokenResponse)
async def liff_token_swap(
    slug: str,
    body: LiffSwapRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """LIFF id_token → Custom App User Token

    LINE 客戶在 LIFF browser 內點 LIFF URL 後，LIFF SDK 會自動把 id_token / access_token 等
    塞進 hash redirect 到 app endpoint。本 endpoint 讓 ordering 前端把 id_token 拿來
    換成平台簽的 Custom App User Token，繞過 email/密碼登入 wrapper。

    安全：
      - origin 白名單（同 register/login）
      - HS256 簽章驗證（channel_secret 機密、攻擊者拿不到）
      - audience / issuer 驗證（id_token aud === channel_id, iss === access.line.me）
      - replay：id_token exp 1 小時自然過期

    無 email 處理：LINE id_token 在 scope=openid,profile 下不會帶 email，
    本 endpoint 用假 email line_<sub>@line.no-email.local 走既有 _find_or_create_user。
    """
    # 1. 撈 app + origin 白名單
    app = await get_app_for_user_auth(slug, db)
    from app.api.custom_app_auth_utils import check_origin_allowed
    check_origin_allowed(request, app)

    # 2. 撈 LINE provider 設定
    provider_config = await _get_provider_config(app.id, "line", db)
    channel_id = provider_config.client_id
    channel_secret = _decrypt_client_secret(provider_config.client_secret_encrypted)

    # 3. 驗 id_token（HS256，重用既有 helper）
    payload = _line_decode_id_token(body.id_token, channel_secret, channel_id)

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=400, detail="id_token 缺少 sub")
    name = payload.get("name") or f"LINE_{sub[:8]}"
    picture = payload.get("picture")

    # 4. 生成 placeholder email（.local TLD 不 routable）
    placeholder_email = f"line_{sub}@line.no-email.local"

    # 5. 走既有 _find_or_create_user
    user = await _find_or_create_user(
        app=app,
        provider_config=provider_config,
        provider_uid=sub,
        email=placeholder_email,
        display_name=name,
        avatar_url=picture,
        profile_data=payload,
        db=db,
    )
    if user is None:
        # _find_or_create_user 只在 email is None 時回 None，我們一定給了 email，
        # 走到這代表內部例外，保底 500
        raise HTTPException(status_code=500, detail="使用者建立失敗（unexpected None）")

    # 6. 簽 token pair（重用既有 helper）
    tokens = await create_token_pair(user, db)
    await db.commit()

    logger.info(f"[LIFF Swap] LINE userId={sub[:10]}... → CustomAppUser id={user.id}")

    return CustomAppAuthTokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        expires_in=tokens["expires_in"],
        user=CustomAppUserResponse.model_validate(user),
    )
```

- [ ] **Step 4：靜態檢查 — 手動讀一遍**

讀整段 endpoint 確認：
- 所有 import 都在檔案頂端可用（`HTTPException`、`Depends`、`get_db`、`AsyncSession` 都已 import）
- `check_origin_allowed` 是用 `from ... import` 拿（既有沒 import，所以函數內 local import）
- pyjwt 已在 `pyproject.toml`（line 26）

- [ ] **Step 5：Commit**

```bash
cd /home/username/桌面/AI-GO
git add backend/app/api/custom_app_oauth.py backend/app/schemas/custom_app_auth.py
git commit -m "$(cat <<'EOF'
feat(custom-app-oauth): 加 /liff-swap endpoint — LINE id_token 兌換 Custom App User Token

LIFF 客戶端 hash 帶來的 id_token 用 HS256 + channel_secret 驗證，
配合 placeholder email (line_<sub>@line.no-email.local) 走既有 _find_or_create_user。
重用 _line_decode_id_token、_find_or_create_user、create_token_pair，不另開 helper。

設計：身分綁定靠 provider_uid (LINE sub)，假 email 唯一性靠 sub。
之後若想拿真 email：LIFF App 加 email scope、後端讀 payload.email 覆蓋假值。

對應 spec: fde-sc1984/docs/superpowers/specs/2026-05-11-s2-liff-token-swap-design.md
EOF
)"
```

---

## Task 3: useAppRuntime hook 加 LIFF hash 偵測 (AI-GO frontend)

**Files:**
- Modify: `/home/username/桌面/AI-GO/frontend/src/hooks/useAppRuntime.ts`

- [ ] **Step 1：確認 `setCustomAppTokens` 的 import 路徑**

```bash
cd /home/username/桌面/AI-GO
grep -n "setCustomAppTokens\|getCustomAppAccessToken" frontend/src/hooks/useAppRuntime.ts | head -5
```

Expected：看到既有的 import line（大約 `import { getCustomAppAccessToken, setCustomAppTokens, ... } from '...'`），記下 module 路徑。

- [ ] **Step 2：找到主 useEffect 內的 token 檢查位置**

讀 `frontend/src/hooks/useAppRuntime.ts` 第 180-200 行附近，找到這行：

```typescript
const token = await getCustomAppAccessToken(slug);
```

（行號可能會因 dev 分支有新 commit 而漂移，以「主 useEffect 內 getCustomAppAccessToken 第一次出現」為準。）

- [ ] **Step 3：在 token 檢查那行之前插入 LIFF 偵測**

在 `const token = await getCustomAppAccessToken(slug);` 那行**之前**加入：

```typescript
// LIFF hash 偵測：若 hash 帶 LIFF token，先 swap 寫入 localStorage
// 之後 getCustomAppAccessToken 會直接撈到剛寫的 token，跳過 wrapper
if (authType === 'custom_app' && typeof window !== 'undefined') {
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
        // 清掉 hash 防 refresh 再 swap；保留 search 給 ordering 解析 liff.state.invite
        window.history.replaceState(
          {},
          '',
          window.location.pathname + window.location.search,
        );
      } else {
        console.warn('[useAppRuntime] LIFF swap 失敗，fallback 到既有 wrapper', res.status);
      }
    } catch (e) {
      console.warn('[useAppRuntime] LIFF swap 例外，fallback', e);
    }
  }
}
```

注意：**不寫 `return` 或 `else` 提前退出**，目的就是讓下面的 `getCustomAppAccessToken` 自然撈到剛寫的 token；失敗時也讓 fallback 走原本「沒 token → wrapper」邏輯。

- [ ] **Step 4：型別檢查**

```bash
cd /home/username/桌面/AI-GO/frontend
npm run build 2>&1 | tail -20
# 或
npx tsc --noEmit 2>&1 | tail -20
```

Expected：無新增 type error。如果有「`authType` not defined」之類錯誤，往上爬看它是不是已經在 useEffect 內可見的變數（從 hook arg 傳進來，應該可見）。

- [ ] **Step 5：Commit**

```bash
cd /home/username/桌面/AI-GO
git add frontend/src/hooks/useAppRuntime.ts
git commit -m "$(cat <<'EOF'
feat(useAppRuntime): 加 LIFF hash 偵測 — 自動 swap LINE id_token → platform token

在 getCustomAppAccessToken 前偵測 hash 內 id_token+context_token，
若有就 POST /liff-swap 換 token 寫入 localStorage，
然後讓既有 getCustomAppAccessToken 自然撈到 token、跳過 CustomAppAuthLogin wrapper。

失敗時不 return，fallback 到既有 wrapper 邏輯（保險網）。
清掉 hash 防 refresh 重 swap，但保留 search 給 ordering app 解析 liff.state.invite。
EOF
)"
```

---

## Task 4: FDE-SC1984 ordering App.tsx 加 LIFF invite 流程

**Files:**
- Modify: `/home/username/桌面/fde-sc1984/vfs/ordering/src/App.tsx`

- [ ] **Step 1：加 LIFF_INVITE_TOKEN 常數**

讀 `vfs/ordering/src/App.tsx`，找到第 89 行 `const INVITE_EMAIL: string = _initInvite.email || "";`（既有 ct 邀請流程的最後一行），在它之後加：

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

- [ ] **Step 2：加 branchesNonce state**

讀第 105-109 行附近找到 useState 群（既有 `selectedBranch`、`branches`、`branchesLoading` 等），在最後一個 `useState` 後加：

```typescript
const [branchesNonce, setBranchesNonce] = useState(0);
```

- [ ] **Step 3：把 list_my_branches useEffect 的 deps 加 branchesNonce**

讀第 163-182 行的 list_my_branches useEffect，找到它的 deps array：

```typescript
}, [user]);
```

改成：

```typescript
}, [user, branchesNonce]);
```

- [ ] **Step 4：加 LIFF redeem useEffect**

在 list_my_branches useEffect 結束的 `}, [user, branchesNonce]);` 那一行**之後**加一個新 useEffect：

```typescript
// LIFF 流程：使用者首次 LIFF 進站帶 invite_token，自動走既有 redeem_invite_token 綁定
useEffect(() => {
  if (!user || !LIFF_INVITE_TOKEN) return;
  db.runAction("redeem_invite_token", { token: LIFF_INVITE_TOKEN })
    .then(() => {
      // 清 URL 防重複呼叫 + 觸發 list_my_branches 重撈
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
      setBranchesNonce(n => n + 1);
    })
    .catch((e) => console.error("[LIFF] redeem_invite_token 失敗:", e));
}, [user]);
```

注意 deps **只有 `[user]`**（不含 `LIFF_INVITE_TOKEN`，因為它是模組常數、永不變動）。

- [ ] **Step 5：腦袋跑一遍 race condition**

確認時序：
1. `user` state 從 null 變成有值（既有 useEffect line 111-128 設定的）
2. list_my_branches useEffect 觸發 → 撈 branches（此時可能還沒有新綁的 rel）
3. LIFF redeem useEffect 觸發 → 打 action → 成功 → `setBranchesNonce(1)`
4. branchesNonce 變化觸發 list_my_branches useEffect 再跑一次 → 撈到新 rel

第二輪 list_my_branches 一定會看到剛寫入的 rel（因為 redeem 的 .then 等於 action 已 commit）。OK。

- [ ] **Step 6：Commit**

```bash
cd /home/username/桌面/fde-sc1984
git add vfs/ordering/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(ordering): LIFF 進站自動綁定 — App.tsx 解析 liff.state.invite 並呼叫 redeem_invite_token

LIFF 流程：客戶在 LINE 點帶 invite token 的 LIFF URL → AI-GO 平台 /liff-swap
完成 LINE id_token → platform token 換取 → ordering 載入 → 本 useEffect 偵測 invite
→ 呼叫既有 redeem_invite_token 走 customer_custom_app_user_rel 表綁定。

branchesNonce state 解決 race condition：list_my_branches 與 redeem useEffect 平行跑時，
list 可能在 redeem 完成前撈空；redeem 成功後遞增 nonce 觸發 list 重撈。

不新增 ext action（直接重用 redeem_invite_token）；既有 ct=base64 邀請流程不受影響。
對應 spec: docs/superpowers/specs/2026-05-11-s2-liff-token-swap-design.md
EOF
)"
```

---

## Task 5: AI-GO 部署（USER 親自）

**Files:** 無修改（部署 + 觀察）

- [ ] **Step 1：使用者 cherry-pick 或 merge 到 main**

（AI agent 不執行此步，等使用者操作）

可能的方式：

```bash
cd /home/username/桌面/AI-GO
git checkout main
git cherry-pick <feat/liff-token-swap 上的 commits>
# 或
git merge --no-ff feat/liff-token-swap
git push origin main
```

push 到 origin/main 會觸發 `.github/workflows/deploy-gcp.yml` 自動部署。

- [ ] **Step 2：監控 GitHub Actions**

開 https://github.com/<org>/<AI-GO-repo>/actions 看 `Deploy to GCP` workflow 跑完。預期：
- `Deploy backend` step 成功
- `Run alembic upgrade head` step 成功（本次無 migration，跑 no-op）
- `Deploy frontend` step 成功

- [ ] **Step 3：smoke test 新 endpoint 還活著（最小驗證）**

```bash
curl -i -X POST https://ai-go.app/api/v1/custom-app-oauth/<your-app-slug>/liff-swap \
  -H "Content-Type: application/json" \
  -d '{"id_token": "invalid"}'
```

Expected：401（id_token 驗證失敗），**不是 404**（404 代表路由沒上）。

---

## Task 6: FDE-SC1984 部署 + 端到端測試

**Files:** 無修改（部署 + 測試）

- [ ] **Step 1：部署 ordering**

```bash
cd /home/username/桌面/fde-sc1984
set -a && source .env && set +a
python3 vfs/scripts/deploy_ordering.py 2>&1 | tail -10
```

Expected：5 步驟皆 200，最後 `✅ Ordering 部署完成`

- [ ] **Step 2：admin 後台產生新 invite_token（測試料）**

USER 在 admin 介面建一個新分店或重新產生既有分店的 invite_token，把它記下來作為 `<NEW_INVITE_TOKEN>`。

- [ ] **Step 3：手機 LINE 對話貼 LIFF URL 並點擊**

```
https://liff.line.me/2009976374-VYUpM905?invite=<NEW_INVITE_TOKEN>
```

預期觀察（依序）：
1. LINE 同意頁不再出現（已同意過）
2. ✅ **不**再看到「外部應用—下單」email/密碼 wrapper
3. 直接進到 ordering 主畫面（CatalogPage / BranchPicker）
4. 該分店出現在 BranchPicker 選項
5. 選分店後可以正常下單

- [ ] **Step 4：DB 驗證綁定資料**

```bash
# 用 db-query skill 或既有 admin 工具查
# customer_custom_app_user_rel WHERE customer_id = '<branch_id>'
# 應該有一筆新 row, custom_app_user_id 對到 platform user
```

或開 admin 客戶 modal 看該 branch 的「下單人員管理」（另一個 AI 加的功能）列出新綁的 user。

- [ ] **Step 5：edge case 測試 — 重複點同一 LIFF URL**

再點一次 `https://liff.line.me/2009976374-VYUpM905?invite=<已被綁的同一 token>`

預期：
- swap 成功（identity 命中既有 user）
- redeem_invite_token 成功（dedup，不重插 rel）
- 主畫面正常

- [ ] **Step 6：edge case 測試 — 無 invite 的 LIFF URL**

點 `https://liff.line.me/2009976374-VYUpM905`（無參數）

預期：
- swap 成功
- 無 redeem 呼叫
- list_my_branches 撈到既有綁定 → BranchPicker 正常顯示

- [ ] **Step 7：edge case 測試 — LIFF 同意頁拒絕**

（可選，需要新 LINE 帳號）

按「取消」拒絕授權 → 預期：LIFF 流程中斷，不會抵達 ordering（這是 LINE 平台行為）

---

## Task 7: 收尾

**Files:** 視 Task 6 結果決定

- [ ] **Step 1：若全部 OK，無需收尾**

S2 完成。AI-GO 與 FDE 的改動都已 deploy 上線。S3（Rich Menu 替換登入頁）可以開始 brainstorm。

- [ ] **Step 2：若部分 OK 但有小 bug**

開新 PR 修補。不退版整個 S2。

- [ ] **Step 3：若大幅出錯需退版**

AI-GO 退版（手動觸發 Actions 上一個成功 commit）：
- 開 GitHub Actions UI、找上一個 `Deploy to GCP` 成功的 run、點 `Re-run all jobs`
- 或 git revert 相關 commits、push to main 觸發新部署

FDE 退版：
- `git revert <Task 4 commit>` 然後 `python3 vfs/scripts/deploy_ordering.py`

- [ ] **Step 4：更新記憶**

部署上線後，更新 `~/.claude/projects/-home-username----fde-sc1984/memory/project_line_liff_initiative.md` 把 S2 狀態改 ✅ 完成。

---

## Self-Review Checklist

跑一遍：

- ✅ **Spec coverage**：
  - AI-GO backend endpoint → Task 2
  - AI-GO frontend hook → Task 3
  - FDE App.tsx 三項改動（LIFF_INVITE_TOKEN / branchesNonce / 新 useEffect）→ Task 4 step 1-4
  - 既有 list_my_branches deps 加 branchesNonce → Task 4 step 3
  - 重用 redeem_invite_token 不新增 action → 已在 Task 4 step 4 直接呼叫
  - LINE Console 不動 → Task 5 之前提示
  - 部署順序「先 AI-GO 再 FDE」→ Task 5 → Task 6 順序
  - 測試 swap endpoint 單獨打 → Task 5 step 3
  - 整合測試 LIFF + invite → Task 6 step 3
  - 重複點測試 → Task 6 step 5
  - 無 invite 測試 → Task 6 step 6
- ✅ **無 placeholder**：每個 step 都有具體程式碼或指令
- ✅ **型別一致**：`LiffSwapRequest` 在 Task 2 step 1 定義，Task 2 step 3 使用；`LIFF_INVITE_TOKEN` / `branchesNonce` / `setBranchesNonce` 在 Task 4 連貫使用
- ✅ **路徑明確**：全用絕對路徑

---

## Execution Notes

- 預期 4 個 commit（Task 1 純切分支不 commit，Task 2 / Task 3 各 1 個在 AI-GO branch；Task 4 一個在 FDE feat/daily-reports）
- Task 1~4 純程式改動，本地 0 副作用（不部署、不打 API）
- Task 5 / 6 才會部署到 production，影響線上 LIFF 進站行為
- 部署窗口期建議避開客戶下單尖峰
- 跨 repo：AI-GO 與 FDE-SC1984 是兩個獨立 git repo，commit 不互相牽動
