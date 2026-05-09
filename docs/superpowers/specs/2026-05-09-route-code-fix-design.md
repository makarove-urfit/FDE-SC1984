# 採購單路線代號顯示修復設計

**日期**：2026-05-09
**分支**：`feat/daily-reports`
**作者**：HsuPeiChun（與 Claude 共同 brainstorming）
**狀態**：設計階段（待 review）

---

## 1. 問題陳述

採購單列印頁的「路線代號」（region_tag）100% 顯示不出來。Phase 1 系統性 debug 確認 root cause：

1. `vfs/ordering/actions/place_order.py` 用 `customers.email == user_email` 比對找 customer，再寫入 `sale_orders.customer_id`。
2. 業務資料現況：只有 hq 填 email、branch 沒填 email；但 `region_tag_id` 只存在 branch 的 `custom_data`。
3. → email 比對永遠 match 到 hq → `sale_orders.customer_id` 永遠寫 hq.id → 採購單反查 customer 時拿不到 `region_tag_id` → 路線代號永遠空。

**實測數據**：56 筆 sale_orders 中，0 筆能透過 customer 拿到 region_tag_id（31 筆指 hq、25 筆指 ghost customer，0 筆指 branch）。

**附加 bug**：`place_order.py` line 57-63，當 email 沒 match 時會「自動建立一筆新 customer」（kind 為空、無 region_tag_id），這就是 25 筆 ghost 的來源。

## 2. 業務目標

- 修復後，新下的單必須能讓採購單顯示正確的路線代號。
- 既有 31 筆 hq 訂單需 backfill（隨機分配 branch，僅供 UI 開發階段驗證畫面用，業務正確性不要求）。
- 25 筆 ghost 訂單不處理（後續手動清理）。

## 3. 業務規則

- **User-Branch 關係**：1:N（一個 user 可綁多個 branch，例如多店面老闆、中央採購員）。
- **下單時行為**：user 必須自己選哪一間 branch 下單。
- **Session UX**：第一次進 ordering 選一次，存 `localStorage`；header 提供「切換分店」入口。

## 4. 架構總覽

```
┌── Ordering App (Frontend) ─────────────────────────────────────┐
│  App.tsx → 檢查 localStorage[selected_branch]                   │
│            無 → <BranchPicker> modal (canDismiss=false)         │
│            有 → header chip 顯示「分店：{name}」                │
│  CartPage.handleSubmit → runAction("place_order", { branch_id })│
└────────────────────────────────────────────────────────────────┘
                          ↓
┌── Ordering Backend ────────────────────────────────────────────┐
│  list_my_branches.py (新增)                                     │
│    rel WHERE user_id == ctx.user_id → 回傳 branches             │
│  place_order.py (重寫)                                          │
│    1. ctx.user_id 必填、params.branch_id 必填                   │
│    2. verify rel: (user_id, branch_id) 存在 → 否則 403          │
│    3. customer_id = branch_id                                   │
│    4. 砍掉 email 比對 + ghost customer 自動建立                 │
└────────────────────────────────────────────────────────────────┘
                          ↓
┌── Admin Backend ───────────────────────────────────────────────┐
│  backfill_sale_orders_branch.py (新增, dev 期一次性)            │
│    隨機把 hq 訂單分配到該 hq 底下的 branch                      │
│  db_admin.py REFS 補 customer_custom_app_user_rel + custom_app_users│
│  db_ordering.py REFS 補 customer_custom_app_user_rel(read)      │
└────────────────────────────────────────────────────────────────┘
```

## 5. 後端詳細設計

### 5.1 `vfs/ordering/actions/list_my_branches.py`（新增）

**用途**：給前端 picker 拉「我能下單的 branch 清單」。

**邏輯**：
1. `uid = ctx.user_id`，無則回空陣列。
2. query `customer_custom_app_user_rel`，過濾 `custom_app_user_id == uid`，得 my_customer_ids。
3. query `customers`，建 id → customer 字典。
4. 對 my_customer_ids 中每個 cid：必須 `kind == 'branch'`、`active != False`，才納入結果。
5. 回傳 `[{branch_id, branch_name, hq_name}]`，依 `(hq_name, branch_name)` 排序。

**為什麼只回 branch 不回 hq**：rel 表設計上 user redeem 後同時綁 (branch + hq) 兩筆，但下單寫入對象必須是 branch（路線跟 branch），所以 picker 只該顯示 branch。

### 5.2 `vfs/ordering/actions/place_order.py`（重寫關鍵段）

**新增 params**：`branch_id` (str, required)
**移除 params**：`user_email`

**新增邏輯（在 delivery_date 驗證之後、寫 sale_orders 之前）**：
```python
uid = str(getattr(ctx, "user_id", "") or "")
branch_id = str(ctx.params.get("branch_id") or "")
if not uid:
    ctx.response.json({"error": "未登入"}); return
if not branch_id:
    ctx.response.json({"error": "缺少必要參數（items / branch_id）"}); return

rels = ctx.db.query("customer_custom_app_user_rel", limit=500) or []
authorized = any(
    str(r.get("custom_app_user_id") or "") == uid
    and str(r.get("customer_id") or "") == branch_id
    for r in rels
)
if not authorized:
    ctx.response.json({"error": "無權對此分店下單", "code": "BRANCH_FORBIDDEN"}); return

customer_id = branch_id
```

**砍掉**：
- `user_email` 取參數
- `for c in customers: if c.get("email") == user_email: ...` 整段
- `if not customer_id: ctx.db.insert("customers", {...})`（ghost customer 邏輯）

### 5.3 References 變更

**`vfs/scripts/db_ordering.py`** 新增：
```python
{"table_name": "customer_custom_app_user_rel",
 "columns": ["id", "customer_id", "custom_app_user_id"],
 "permissions": ["read", "create"]}
```
（insert 已在 redeem_invite_token 用，這次補 read。）

**`vfs/scripts/db_admin.py`** 新增：
```python
{"table_name": "customer_custom_app_user_rel",
 "columns": ["id", "customer_id", "custom_app_user_id"],
 "permissions": ["read", "create", "update"]}
{"table_name": "custom_app_users",
 "columns": ["id", "email", "display_name"],
 "permissions": ["read"]}
```
（修 Phase 1 發現的 admin 端 403、未來 backfill 與分析需要。）

### 5.4 Fail Mode 對應表

| 情境 | 後端回傳 | 前端行為 |
|------|---------|----------|
| ctx.user_id 為空 | `{"error": "未登入"}` | 導回登入頁 |
| 無 branch_id | `{"error": "缺少必要參數（items / branch_id）"}` | 顯示「請先選分店」+ 強制開 picker |
| branch_id 不在 rel | `{"error": "無權對此分店下單", "code": "BRANCH_FORBIDDEN"}` | toast「分店權限失效」+ 清 localStorage + 強制開 picker |

## 6. 前端詳細設計

### 6.1 新檔案 `vfs/ordering/src/utils/branchSession.ts`

```ts
const KEY = "selected_branch";
export interface SelectedBranch { branch_id: string; branch_name: string; hq_name: string; }
// getSelectedBranch: localStorage.getItem(KEY) → JSON.parse，try/catch 失敗回 null
// setSelectedBranch: localStorage.setItem(KEY, JSON.stringify(b))
// clearSelectedBranch: localStorage.removeItem(KEY)
```

不引入 React Context，App.tsx top-level state + props drill 即可。

### 6.2 新檔案 `vfs/ordering/src/components/BranchPicker.tsx`

Modal 元件。Props：
- `branches: SelectedBranch[]`
- `onSelect: (b: SelectedBranch) => void`
- `canDismiss?: boolean`（預設 false；header 切換時為 true）

行為：
- 列表渲染 `{hq_name} - {branch_name}`
- 0 筆 branch → 顯示「您尚未綁定任何分店，請使用邀請連結 redeem」+ 連到 InvitePage

### 6.3 `App.tsx` 改動

- 新 state：`selectedBranch`、`branches`（list_my_branches 結果）
- mount 後：若 `user && !selectedBranch` → fetch list_my_branches → 強制開 BranchPicker
- header 加 chip：「分店：{name}」+ 點擊 → 重開 picker（canDismiss=true）

### 6.4 `CartPage.handleSubmit` 改動

- 移除 `user_email: user.email`，改傳 `branch_id: selectedBranch.branch_id`
- 處理 `BRANCH_FORBIDDEN` 錯誤碼：清 localStorage、setSelectedBranch(null)、提示重選

## 7. Backfill 設計

### `vfs/admin/actions/backfill_sale_orders_branch.py`（新增, dev 期一次性）

**Params**：
- `dry_run`: bool (default: true)
- `fallback_strategy`: `"any_branch" | "skip"` (default: `"any_branch"`)

**邏輯**：
1. query `sale_orders`、`customers`，建 id → customer 字典；建「hq_id → [branches]」字典與「all_active_branches」全集池。
2. 對每筆 sale_orders，看 customer_id 對應的 customer：
   - 已是 branch → 跳過（記錄 `skipped_already_branch`）
   - 是 hq：
     - 該 hq 底下有 active branch → 隨機挑一個（記錄 `rewrote_hq_to_branch`）
     - 該 hq 底下無 active branch → 不寫入（記錄 `no_branch_available`）
   - 是 (empty) kind ghost（無 parent_customer_id）→ 依 `fallback_strategy`：
     - `any_branch`：從 `all_active_branches` **全集池**中隨機挑一個（記錄 `rewrote_ghost_to_random_branch`）
     - `skip`：跳過（記錄 `skipped_ghost`）
3. 改寫呼叫 `ctx.db.update("sale_orders", id, {"customer_id": new_branch_id})`，`dry_run=true` 時只統計不寫入。
4. 若 `all_active_branches` 為空，整個 action 直接回 `{"error": "no branches available, cannot backfill"}`。

**回傳結構**：
```json
{
  "total_orders": 56,
  "skipped_already_branch": 0,
  "rewrote_hq_to_branch": 31,
  "rewrote_ghost_to_random_branch": 25,
  "no_branch_available": 0,
  "sample_changes": [{"order_id": "...", "from": "Logos hq", "to": "Logos branch X"}, ...]
}
```

**執行方式**：
1. `python3 vfs/scripts/deploy_admin.py --no-publish` 上傳。
2. `run_dev` 跑 `dry_run: true` 看 sample。
3. 確認後跑 `dry_run: false` 實際寫入。
4. **不發布到 production**（dev 期一次性工具）。

## 8. 測試策略

| Action | 測試案例 | 工具 |
|--------|---------|------|
| `list_my_branches` | (a) 有 rel → 回對應 branches；(b) 無 rel → 空陣列；(c) rel 指 hq → 不出現在結果 | dev mode + 2 個測試 user |
| `place_order` | (a) 有 rel + branch_id → 寫入成功且 customer_id == branch_id；(b) 無 rel → 403 BRANCH_FORBIDDEN；(c) 無 branch_id → 400 | dev mode |
| `backfill_sale_orders_branch` | dry_run 跑兩次結果一致；非 dry_run 後 query sale_orders 確認 customer_kind 全是 branch | dev mode + 直接 query |
| 採購單 UI | backfill 後，Admin 進採購單頁面，確認路線代號顯示出來 | 手測 + 截圖 |

不引入 pytest（專案無設定且 ctx.db 需 mock）。改用「dev mode 黑箱測試」action：`vfs/admin/actions/test_route_code_fix.py`，內部呼叫並斷言。

## 9. Out of Scope

- 25 筆 (empty) kind ghost customer 本身的清理（後續手動處理）
- 切換分店後購物車是否清空（先預設不清，發現問題再加）
- BranchPicker 的搜尋框（YAGNI）
- 同 user 一次下單跨多 branch
- list_my_branches 的 caching

## 10. 風險清單

| 風險 | 緩解 |
|------|------|
| ordering app 沒 read `customer_custom_app_user_rel` 的權限 | §5.3 加 REFS，部署時自動同步 |
| 既有未 redeem 的 user 將完全無法下單 | 業務上應已全部 redeem；若有遺漏可從 admin 端 query 找出 |
| backfill 後路線顯示錯（隨機分配本來就不準） | 你已說明「方便確認 UI 即可」，業務正確性不要求 |
| BranchPicker 強制 modal 阻塞首屏 | 是預期行為，user 必須先選才能下單 |

## 11. 實作順序（給 writing-plans 參考）

1. **後端 + REFS**（不影響前端）
   - db_ordering.py / db_admin.py 加 REFS
   - 新增 list_my_branches.py
   - 重寫 place_order.py
2. **後端 dev mode 測試**（use_dev=true，不發布）
   - 用 admin 寫的 debug action 驗證 rel verify 邏輯
3. **前端**
   - branchSession.ts、BranchPicker.tsx
   - App.tsx 整合
   - CartPage.handleSubmit 改動
4. **Backfill**
   - 寫 backfill_sale_orders_branch.py
   - dry_run → 實際執行
5. **驗證 + 發布**
   - 採購單 UI 手測
   - 全部發布
