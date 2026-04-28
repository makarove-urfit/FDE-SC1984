# CLAUDE.md

<!-- DISCIPLINE_START: rules -->
<!-- DISCIPLINE_END: rules -->

## 唯一參考標準

- `demo/` 資料夾（官方 SDK 模板）與 `demo/CUSTOM_APP_DEV_GUIDE.md`、`demo/INTEGRATION_GUIDE.md` 是**唯一技術參考標準**。
- **嚴禁修改 demo/ 資料夾。**
- `scripts/` 資料夾的舊 Python 腳本**只能參考業務邏輯流程**（如訂單欄位、資料關係），**不得照抄 API 呼叫方式、URL 或 payload 格式** — 這些已過時且有已知錯誤。

## 專案結構

```
vfs/
  admin/          ← Admin App 前端原始碼（TSX/TS + actions/）
  ordering/       ← Ordering App 前端原始碼（TSX/TS + actions/）
  scripts/
    deploy_lib.py      ← 共用部署函式（login、ensure_references、read_vfs、upload_vfs、publish_app）
    db_admin.py        ← Admin AppDataReference 宣告（SSOT）
    db_ordering.py     ← Ordering AppDataReference 宣告（SSOT）
    deploy_admin.py    ← Admin 部署入口（薄包裝）
    deploy_ordering.py ← Ordering 部署入口（薄包裝）
demo/             ← AI-Go 官方模板參考（唯讀，禁止修改）
```

## 部署

```bash
set -a && source .env && set +a
python3 vfs/scripts/deploy_admin.py
python3 vfs/scripts/deploy_ordering.py
```

部署流程（4 步）：
1. **登入** — 用 `.env` 的 `AIGO_EMAIL` / `AIGO_PASSWORD` 取得 token
2. **設定 DB References** — 對照 `db_admin.py` / `db_ordering.py` 的 `REFS`，逐表 create 或 patch AppDataReference
3. **上傳 VFS** — 讀取 `vfs/admin/` 或 `vfs/ordering/` 下所有原始碼，上傳至平台；自動過濾以下非原始碼目錄與檔案：
   - 目錄：`node_modules`、`.git`、`__pycache__`、`.venv`、`dist`、`.cache`
   - 檔案：`package-lock.json`、`yarn.lock`、`.DS_Store`
4. **發布** — 觸發平台編譯並上線

## Dev 模式執行 Action（不需發布）

平台支援 `use_dev=true` 參數，讓 action 直接吃 `vfs_state`（未發布草稿），**不走 publish 流程**，適合開發期間測試 action 邏輯：

```
POST /api/v1/actions/apps/{app_id}/execute-by-name?action_name=xxx&use_dev=true
```

**正確開發流程**（寫 action、測試、確認後才 publish）：
1. 在本地寫好 action Python 檔
2. 只執行 deploy 的步驟 1-3（上傳 VFS，**不發布**）
3. 呼叫 `execute-by-name?use_dev=true` 測試
4. 確認結果正確後，才執行步驟 4（發布）

這樣就不會每次測試都動到 production。

## 資料存取原則

- **前端不准寫死任何資料**，所有資料一律 runtime 從資料庫讀取
- Admin 與 Ordering 的**寫入、需身分過濾的讀取一律走 server-side action**
- 純公開讀取（商品定義、分類、單位等）Admin 可繼續用 `/proxy/{APP_ID}/`
- **Ordering：禁止前端直接呼叫 `/ext/proxy/`**（x_ 表及 `product_products` 均回傳 500）
- 各 App 可存取的表與欄位由 `db_admin.py` / `db_ordering.py` 的 `REFS` 決定；新增欄位或表先改這兩個檔再部署

## Server-Side Action 規範

**Action 端點（實測確認）：**

| App 類型 | URL |
|---------|-----|
| Admin（內部 app，Supabase JWT） | `POST /api/v1/actions/apps/{app_id}/run/{action_name}` |
| Ordering（外部 app，Custom App User Token） | `POST /api/v1/ext/actions/run/{action_name}` |

**ctx.db 可用方法（實測）：**

| 方法 | 用途 | 備注 |
|------|------|------|
| `ctx.db.query(table, limit=N)` | 查標準 Odoo 表 | x_ 表不可用，會 error |
| `ctx.db.query_object(table, limit=N)` | 查 x_ 自訂表 | 回傳 flat dict，不需 AppDataReference |
| `ctx.db.insert(table, data)` | 新增記錄 | |
| `ctx.db.update(table, id, data)` | 更新記錄 | |
| `ctx.db.remove(table, row_id)` | 硬刪除，回傳 `{"success": True}` | 方法名是 remove，不是 delete |

**軟刪除**：平台沒有通用軟刪除 API，直接 `ctx.db.update(table, id, {"active": false})` 即可。

**前端刪除**：`db.ts` 的 `deleteRow` 走 `DELETE /proxy/{app_id}/{table}/{id}`，同樣支援。

**前端呼叫（`db.ts` 的 `runAction`）：**
- Admin 內部 app：`runAction('action_name', params)` → 走 `/actions/apps/{appId}/run/{name}`
- ⚠️ `action.ts` 的 URL pattern 已修正（原本少了 `apps/`，app_id 位置錯誤）
