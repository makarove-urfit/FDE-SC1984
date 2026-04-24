---
name: ordering-db-access
trigger: always_on
description: "說明此專案所有資料庫操作必須走 server-side action，以及各表的實際欄位名稱。"
---

# Ordering App 資料庫存取規範

## 核心規則

**所有資料庫操作一律透過 Python server-side action（ctx.db），禁止前端直接呼叫 /ext/proxy/。**

原因：`/ext/proxy/` 對 x_ 前綴 Odoo 自訂模型以及 `product_product` 均回傳 500。

## ctx.db.query（Odoo 標準表）

```python
rows = ctx.db.query("table_name", limit=1000)
rows = ctx.db.query("sale_orders", limit=500, order_by=[{"column": "date_order", "direction": "desc"}])
```

- 不支援 server-side filter，Python 側過濾
- **product_product 在 ordering action ctx.db 不可存取**（UndefinedTableError）

## ctx.db.query_object（AI-Go Data Object）

```python
rows = ctx.db.query_object("x_holiday_settings", limit=1000)
```

- 回傳 flat dict（無 data wrapper）
- x_ 前綴客製表已建成跨 app data objects（promote → app_id = null），可從任何 app action 存取
- **不使用 ctx.db.query 查 x_ 表**（ordering action 沙盒無法存取 Odoo 自訂模型）

## Data Objects（跨 app，已 promote）

| Slug | 欄位 | 說明 |
|------|------|------|
| `x_holiday_settings` | id, **date**, reason | 假日清單 |
| `x_app_settings` | id, **key**, **value**, updated_at | key=`order_cutoff_time` |
| `x_price_log` | id, **tmpl_uuid**, **price**, **effective_date**, purchase_price | 參考價格，tmpl_uuid = product_template UUID |

## Odoo 標準表（ctx.db.query）

| 表名 | 欄位 |
|------|------|
| `product_templates` | id, name, default_code, sale_ok, active, categ_id, list_price, uom_id |
| `product_categories` | id, name, parent_id, active |
| `uom_uom` | id, name, active |
| `customers` | id, name, email, ref, customer_type |
| `sale_orders` | id, name, state, date_order, customer_id, note, amount_total |
| `sale_order_lines` | id, order_id, product_id, product_template_id, product_uom_qty, price_unit, name, delivery_date |

## Action 分工

| Action | 用途 |
|--------|------|
| `get_config` | query_object: x_holiday_settings + x_app_settings + x_price_log |
| `get_catalog` | query: product_templates + product_categories + uom_uom |
| `get_orders` | query: customers + sale_orders + sale_order_lines（by user_email） |
| `place_order` | insert: sale_order + sale_order_lines（用 product_template_id） |
| `update_order_lines` | 修改 sale_order_lines 數量 |

## 如何確認欄位名稱

```bash
# 取得 ordering app 所有 refs 及欄位
TOKEN=$(curl -s -X POST "https://ordering.apps.ai-go.app/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$AIGO_EMAIL\",\"password\":\"$AIGO_PASSWORD\"}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ordering.apps.ai-go.app/api/v1/refs/apps/$ORDERING_APP_ID" \
  | python3 -c "import sys,json; [print(r['table_name'], '|', r.get('published_columns',[])) for r in json.load(sys.stdin)]"
```
