---
name: aigo-integration-guide
trigger: always_on
description: "AI GO 系統串接指南精要：認證機制、Open Proxy 查詢語法、Custom Table API、References 白名單管理。需要串接外部 API 或操作 Odoo 系統表時必讀。"
---

# AI GO 系統串接指南

> 官方文件：https://www.ai-go.app/docs/integration-guide  
> 版本：v1.4 | 最後確認：2026-04-10

---

## 1. 認證機制總覽

| 使用者類型 | 取得方式 | Header 格式 | 適用路徑 |
|-----------|---------|------------|---------|
| **平台管理員** | `POST /api/v1/auth/login` | `Authorization: Bearer {token}` | `/proxy/{app_id}/`、`/data/`、Builder API |
| **Custom App 外部用戶** | `POST /api/v1/custom-app-auth/{slug}/login` | `Authorization: Bearer {token}` | `/ext/proxy/`、`/ext/actions/` |
| **Server-to-Server** | 建立 Integration + API Key | `X-API-Key: {key}` | `/open/proxy/`、`/open/data/` |

### 取得 Admin Token

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "admin@example.com", "password": "..." }
```

回傳：`access_token`、`refresh_token`、`expires_in`

### Custom App 外部用戶登入

```http
POST /api/v1/custom-app-auth/{app_slug}/login
Content-Type: application/json

{ "email": "user@example.com", "password": "..." }
```

回傳 JWT，payload 含 `auth_type: "custom_app_user"`、`scope: "app_runtime"`。

---

## 2. References（白名單）管理

所有 Proxy 資料存取都受 **References 白名單**保護，未列舉的欄位無法讀寫。

### 查詢現有 References

```http
GET /api/v1/refs/apps/{app_id}
Authorization: Bearer {admin_token}
```

### 新增 Reference

```http
POST /api/v1/refs/apps/{app_id}
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "table_name": "sale_orders",
  "columns": ["id", "name", "state", "date_order", "customer_id", "note"],
  "permissions": ["read", "create", "update"]
}
```

### 更新 Reference

```http
PATCH /api/v1/refs/{ref_id}
Authorization: Bearer {admin_token}
Content-Type: application/json

{ "columns": [...], "permissions": [...] }
```

> **本專案做法**：`ensure_references()` 函式在每次 deploy 時自動同步白名單。修改欄位清單後必須重新 deploy 才生效。

---

## 3. Open Proxy API（Odoo 系統表）

### 路徑與認證

| 路徑 | 認證 | 操作 |
|------|------|------|
| `/api/v1/proxy/{app_id}/{table}` | Admin Bearer | 讀 + 寫 |
| `/api/v1/ext/proxy/{table}` | Custom App User Bearer | 讀 + 寫 |
| `/api/v1/open/proxy/{table}` | `X-API-Key` Header | 讀（GET 會 422）+ 寫 |

### 簡單查詢（GET）

```http
GET /api/v1/ext/proxy/sale_orders?limit=50&offset=0
Authorization: Bearer {token}
```

### 進階查詢（POST /query）

```http
POST /api/v1/ext/proxy/sale_orders/query
Authorization: Bearer {token}
Content-Type: application/json

{
  "filters": [
    { "column": "customer_id", "op": "eq", "value": "abc-123" }
  ],
  "order_by": [{ "column": "date_order", "direction": "desc" }],
  "limit": 50,
  "offset": 0
}
```

### Filter 運算子

`eq` `ne` `gt` `gte` `lt` `lte` `like` `ilike` `in` `is_null` `is_not_null`

### 新增記錄（POST）

```http
POST /api/v1/ext/proxy/sale_orders
Authorization: Bearer {token}
Content-Type: application/json

{ "customer_id": "abc-123", "date_order": "2026-04-10", "note": "備註" }
```

> ⚠️ **扁平結構**：新增不需要 `{"data": {...}}` 包裝，直接傳欄位。

### 更新記錄（PATCH）

```http
PATCH /api/v1/ext/proxy/sale_orders/{row_id}
Authorization: Bearer {token}
Content-Type: application/json

{ "data": { "state": "sale" } }
```

> ⚠️ **更新需要 `data` 包裝**：與新增相反，PATCH 必須包一層 `{"data": {...}}`。

### 回傳格式

扁平欄位：`{ "id": "uuid", "col1": "val1", "col2": [id, name], ... }`  
Many2one 欄位可能回傳 `[id, name]` 陣列或純 id，需防禦性解析。

---

## 4. Custom Table API（x_ 前綴表）

Custom Table 使用 JSONB 儲存，不需要 References 白名單，但只有 Admin Bearer token 能存取（Custom App User token 無法）。

### 端點

```
GET    /api/v1/data/objects/{uuid_or_slug}/records
POST   /api/v1/data/objects/{uuid_or_slug}/records
PATCH  /api/v1/data/records/{record_id}
DELETE /api/v1/data/records/{record_id}
```

### 回傳格式

```json
{
  "id": "record-uuid",
  "data": { "field1": "value1", "field2": 123 },
  "created_at": "2026-04-10T...",
  "updated_at": "2026-04-10T..."
}
```

### 新增記錄

```http
POST /api/v1/data/objects/{slug}/records
Authorization: Bearer {admin_token}
Content-Type: application/json

{ "data": { "key": "value", "amount": 100 } }
```

> ⚠️ Custom Table 新增 **需要** `{"data": {...}}` 包裝（與 Odoo Proxy 新增相反）。

### 本專案 Custom Table 清單

| api_slug | Object UUID | 欄位 | 用途 |
|---------|------------|------|------|
| `x_price_log` | `0838e79c-52bb-4d2a-bac8-92eaef87f691` | `product_id`, `price`, `effective_date` | 每日售價，deploy 時靜態 embed |
| `x_holiday_settings` | `96d01299-1d33-4ca7-b437-4bf5c78dfdcf` | `date`, `reason` | 假日清單，deploy 時靜態 embed |
| `x_app_settings` | `fc8e665a-9156-400d-8c6a-a9c2c6f4574e` | `key`, `value`, `updated_at` | 應用設定 |

---

## 5. Tenant 隔離說明

- 所有 Proxy 查詢自動以 `tenant_id` 過濾，無需手動加 filter
- Custom Table 的 `api_slug` unique 範圍是 `(tenant_id, api_slug)`，**跨 app 共用**
  - 在 ordering app 建立的 `x_price_log`，admin app 也能用相同 slug 存取同一份資料

---

## 6. 系統表目錄（Odoo）

50+ 系統表，涵蓋以下模組：

| 模組 | 主要表 |
|------|-------|
| 銷售 | `sale_orders`、`sale_order_lines` |
| 採購 | `purchase_orders`、`purchase_order_lines` |
| 庫存 | `stock_quants`、`stock_locations`、`stock_moves` |
| 產品 | `product_templates`、`product_products`、`product_categories`、`uom_uom` |
| 客戶/供應商 | `customers`、`suppliers`、`product_supplierinfo` |
| 人資 | `hr_employees`、`hr_departments` |
| 會計 | `account_moves`、`account_move_lines` |

完整欄位與 enum 值查閱：https://www.ai-go.app/docs/integration-guide

---

## 7. 部署 CI/CD 標準流程

```
POST /api/v1/auth/login                              → 取得 admin token
GET/PATCH /api/v1/refs/apps/{app_id}                 → 同步白名單
PUT /api/v1/builder/apps/{app_id}/source             → 上傳 VFS
POST /api/v1/compile/compile/{slug}                  → 編譯驗證
POST /api/v1/builder/apps/{app_id}/publish           → 發布
```

> `compile` 失敗時不應 publish（避免發布損壞版本）。
