---
name: xiongquan-business-logic
trigger: always_on
description: "雄泉鮮食核心業務邏輯：價格機制、配送日、下單流程。任何涉及報價、price_unit、配送日期的程式碼必須先讀此規則。"
---

# 雄泉鮮食業務邏輯規範

## 1. 價格機制（最重要）

### 參考價 vs 實際計費價

| | 說明 |
|--|------|
| **參考價（display only）** | 來自 `x_price_log` 最新一筆，deploy 時 embed 為 `price_data.json`。顯示於商品頁，供客戶瀏覽時參考。 |
| **下單時帶入的 price_unit** | 從 `price_data.json` 帶入，寫入 `sale_order_lines.price_unit`，僅作記錄，**非最終計費依據**。 |
| **實際計費價** | 以**配送日的市場實價**為準，由業主配送後在 Admin 後台更新 `sale_order_lines.price_unit`。 |

**禁止行為**：
- 將 `price_data.json` 的價格當作最終計費金額
- 在前端顯示「總金額」時讓客戶誤以為是帳單金額
- 移除「參考」字樣或 effective_date 顯示，讓客戶誤解這是確定價格

**前端正確顯示方式**：
```
$150  參考 4/9
```
其中 `4/9` 是 `effective_date`（最近報價日），不是配送日。

---

## 2. 配送日期

- 客戶在 Ordering App（商品頁或購物車頁）選擇**預計配送日期**
- 配送日期存於 `sale_orders.note`，格式：`配送日期：YYYY-MM-DD\n備註...`
- `sale_order_lines.delivery_date` 也寫入相同日期（欄位有效，型別 DATE）
- 可配送日期由 `holiday_data.json` 排除假日後計算，從明天起算 30 天
- **配送日期不影響 price_unit 的計算**；price_unit 只是參考，實價由業主事後調整

---

## 3. 下單流程（原子操作）

```
客戶選日期 + 加購物車
  → CartPage → runAction("place_order", { items, note, delivery_date })
  → place_order.py（server-side action，ctx.db）
      → 查/建 customer by email
      → insert sale_orders { customer_id, date_order: DATE, note }
      → insert sale_order_lines × N { order_id, product_template_id, name, qty, price_unit, delivery_date }
      → 若任一 line insert 失敗 → 嘗試 cancel order → response.error（rollback best-effort）
  → 成功回傳 { order_id, order_name, delivery_date, items_count }
```

**price_unit 來源**：`price_data.json[product_template_id].price`（參考價，非實價）

---

## 4. x_price_log 欄位說明

| field_key | 意義 |
|-----------|------|
| `product_id` | 對應 `product_templates.id`（template 層級） |
| `price` | 該日報價 |
| `effective_date` | 報價生效日（非配送日） |

每次 deploy 從 `x_price_log` 取每個 product_id 最新一筆 embed 進 `price_data.json`。
