# CLAUDE.md

<!-- DISCIPLINE_START: rules -->
<!-- DISCIPLINE_END: rules -->

## 開發參考規則

不知道怎麼做就去參考 `demo/` 資料夾。**嚴禁修改 demo/ 資料夾。**

## 專案結構

```
vfs/admin/      ← Admin App 前端原始碼（真正的 TSX/TS 檔）
vfs/ordering/   ← Ordering App 前端原始碼（真正的 TSX/TS 檔）
demo/           ← AI-Go 官方模板參考（唯讀，禁止修改）
scripts/
  deploy_admin.py    ← 讀 vfs/admin/ 上傳並發布
  deploy_ordering.py ← 讀 vfs/ordering/ 上傳並發布
```

## 部署

```bash
set -a && source .env && set +a
python3 scripts/deploy_admin.py
python3 scripts/deploy_ordering.py
```

## 資料存取原則

- **前端不准寫死任何資料**，所有資料一律 runtime 從資料庫讀取
- Admin：Odoo 表透過 `/proxy/{APP_ID}/`，custom table 由 `db.ts` 動態查 UUID
- Ordering：Odoo 表透過 `/ext/proxy/`，config/假日/價格由 `get_config` action 提供
- deploy script 只負責上傳 VFS，不拉任何資料
