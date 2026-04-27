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
1. **登入** — 用 `.env` 的 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 取得 token
2. **設定 DB References** — 對照 `db_admin.py` / `db_ordering.py` 的 `REFS`，逐表 create 或 patch AppDataReference
3. **上傳 VFS** — 讀取 `vfs/admin/` 或 `vfs/ordering/` 下所有原始碼，上傳至平台；自動過濾以下非原始碼目錄與檔案：
   - 目錄：`node_modules`、`.git`、`__pycache__`、`.venv`、`dist`、`.cache`
   - 檔案：`package-lock.json`、`yarn.lock`、`.DS_Store`
4. **發布** — 觸發平台編譯並上線

## 資料存取原則

- **前端不准寫死任何資料**，所有資料一律 runtime 從資料庫讀取
- Admin：Odoo 表透過 `/proxy/{APP_ID}/`，custom table 由 `db.ts` 動態查 UUID
- **Ordering：所有資料庫操作一律透過 server-side action（Python ctx.db），禁止前端直接呼叫 `/ext/proxy/`**
  - `/ext/proxy/` 對 x_ 自訂表及 `product_products` 均回傳 500
  - action ctx.db 支援所有表，包含 x_ 前綴的 Odoo 自訂模型
- 各 App 可存取的表與欄位由 `db_admin.py` / `db_ordering.py` 的 `REFS` 決定；新增欄位或表先改這兩個檔再部署
