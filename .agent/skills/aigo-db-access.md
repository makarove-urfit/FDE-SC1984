---
name: aigo-db-access
trigger: always_on
description: "AI-Go 平台資料庫存取機制：AppDataReference 授權層、兩種 sandbox 行為差異、表名規則與 REFS 定義位置。"
---

# AI-Go 資料庫存取規範

## 授權層：AppDataReference

所有表存取都必須通過 `AppDataReference` 授權驗證。沒有對應記錄就會回 403，與 DB 層無關。

**REFS 的唯一定義位置：**
- `vfs/scripts/db_ordering.py` — Ordering app
- `vfs/scripts/db_admin.py` — Admin app

部署時 `deploy_lib.py` 的 `ensure_references()` 會自動 create/patch，`publish_app()` 會發布。

## 兩種 sandbox 行為

| 情境 | 路徑 | use_published | 額外條件 |
|------|------|---------------|---------|
| `ctx.db.query`（Action 沙箱） | action_context → _proxy_query_internal | False | AppDataReference 存在 + read 權限 |
| `ext/proxy/` HTTP | ext_proxy → _proxy_query_internal | True | 同上，且 published_columns 不得為 null |

→ **`ctx.db.query` 不需要發布**，ref 存在就能用。  
→ **`ext/proxy/` 需要發布**，deploy 流程的 `publish_app()` 負責這步。

## 常見錯誤對照

| 錯誤訊息 | 原因 | 修法 |
|---------|------|------|
| `UndefinedTableError` | 表名打錯（平台用複數，如 `product_products`） | 修正 db_*.py 的 table_name |
| `App 未被授權存取表 'x'` | AppDataReference 不存在 | 加進 db_*.py → 重新部署 |
| `表 'x' 的引用尚未發布` | ref 存在但未 publish | 執行 deploy（publish_app 會發布） |

## 表名規則

平台對 Odoo 表名統一用**複數**：

| Odoo 模型 | 平台表名 |
|-----------|---------|
| `product.product` | `product_products` |
| `product.template` | `product_templates` |
| `sale.order` | `sale_orders` |
| `sale.order.line` | `sale_order_lines` |

x_ 前綴客製表用 `ctx.db.query_object`，不走 proxy 授權層。

## ctx.db.query_object（x_ 表）

```python
rows = ctx.db.query_object("x_holiday_settings", limit=1000)
```

- 回傳 flat dict（無 data wrapper）
- x_ 表已 promote（app_id = null），任何 app action 皆可存取
- 不需要建立 AppDataReference
