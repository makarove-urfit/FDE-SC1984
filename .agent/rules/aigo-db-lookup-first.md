---
name: aigo-db-lookup-first
trigger: always_on
description: "強制規範：撰寫任何 DB insert/update/query 前，必須先查驗目標表的欄位名稱、型別與 FK 關係，禁止憑印象猜測。"
---

# AI GO DB 欄位查驗優先規範

## 核心規則

**在撰寫任何針對 Odoo Proxy 表（sale_orders、sale_order_lines、customers 等）的 insert / update / query 程式碼前，必須先確認：**

1. **欄位名稱**：字面上看起來合理的名稱不一定存在（例如 `product_id` vs `product_template_id`）
2. **資料型別**：尤其是日期（`DATE` 接受 `YYYY-MM-DD`，拒絕 ISO datetime `YYYY-MM-DDTHH:mm:ss`）
3. **FK 對象**：Many2one 欄位的目標表（`sale_order_lines.product_id` 指向 `product_products`，不是 `product_templates`）
4. **欄位是否在白名單**：`ensure_references` 內未列的欄位即使 DB 存在也無法寫入

## 查驗方式（依優先順序）

| 來源 | 查驗方式 |
|------|---------|
| **AI GO 整合文件**（首選） | [https://www.ai-go.app/docs/integration-guide](https://www.ai-go.app/docs/integration-guide) → 搜尋對應表名的 Schema 區段 |
| **部署腳本白名單** | `scripts/deploy_ordering.py` 或 `deploy_admin.py` 的 `ensure_references()` — 列出已授權欄位 |
| **README.md 資料模型** | 本專案根目錄，列有各表的主要欄位與已知限制 |

**不接受的查驗方式**：憑記憶、憑欄位名稱「看起來合理」推測。

## 已知的高風險欄位

| 表 | 容易錯的欄位 | 正確欄位 / 注意事項 |
|----|------------|-------------------|
| `sale_orders` | `date_order` 送 ISO datetime | 型別為 `DATE`，只送 `YYYY-MM-DD`（例：`new Date().toISOString().slice(0, 10)`） |
| `sale_orders` | `delivery_date` | **此欄位不存在**，配送日期存在 `note` 欄位，格式：`配送日期：YYYY-MM-DD\n備註...` |
| `sale_orders` | `state` | 由 Odoo 自動管理，**不可直接寫入**，insert 時省略 |
| `sale_order_lines` | `product_id` → 誤以為是 `product_templates.id` | 實際為 `product_products.id`（variant 層級） |
| `sale_order_lines` | `product_template_id` | FK 指向 `product_templates.id`（template 層級），這才是前端通常操作的 ID |
| `sale_order_lines` | `delivery_date` | 型別為 `DATE`，**有效存在**，可寫入 |
| `customers` | `customer_type` | `NOT NULL`，值為 `"company"` 或 `"individual"`，缺少會造成 500 |

## 新增欄位到白名單

修改 `ensure_references` 後必須重新部署，API 才能接受新欄位：

```bash
set -a && source .env && set +a
python3 scripts/deploy_ordering.py   # 或 deploy_admin.py
```

## 禁止行為

- 在未查驗欄位的情況下直接 `db.insert()` 或 `db.update()`，期望「應該會成功」
- 看到錯誤後只改錯誤訊息提到的那個欄位，而不全面比對 schema
- 假設「欄位名稱在 deploy script 裡沒有」就代表欄位不存在（可能只是未開放白名單）
