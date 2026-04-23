---
source: https://www.ai-go.app/docs/integration-guide
fetched: 2026-04-23
---

# AI GO Integration Guide

> **唯一參考標準之一。** 此文件 + `demo/` 資料夾是本專案所有實作的依據。

---

## 三種 Proxy 對照

| 特性 | Internal Proxy | External Proxy | Open Proxy |
|------|----------------|----------------|-----------|
| URL 前綴 | `/api/v1/proxy/{app_id}/` | `/api/v1/ext/proxy/` | `/api/v1/open/proxy/` |
| 認證 | Supabase JWT | Custom App Token (Bearer) | API Key (`X-API-Key`) |
| app_id in path | ✅ | ❌ | ❌ |
| Reference 版本 | Live | **Published snapshot** | **Published snapshot** |
| limit 上限 | 500 | 1000 | 1000 |

---

## Custom App User 認證

**登入：**
```
POST /api/v1/custom-app-auth/{app_slug}/login
{ "email": "user@example.com", "password": "..." }
```

**Token 規格：**
- Access Token TTL：15 分鐘（900 秒）
- Refresh Token TTL：7 天
- Refresh 機制：Token Rotation（舊 token 立即失效）

**Refresh：**
```
POST /api/v1/custom-app-auth/{app_slug}/refresh
{ "refresh_token": "..." }
```

**OAuth（LINE）：**
```
GET /api/v1/custom-app-oauth/{app_slug}/auth-providers
GET /api/v1/custom-app-oauth/{app_slug}/line/authorize
```

---

## Open Proxy API（系統表，API Key 認證）

### 簡易查詢

```
GET /api/v1/open/proxy/{table}?limit=100&offset=0
```

### 進階查詢

```
POST /api/v1/open/proxy/{table}/query

{
  "filters": [
    { "column": "status", "op": "eq", "value": "active" },
    { "column": "amount_total", "op": "gte", "value": 1000 }
  ],
  "order_by": [{ "column": "created_at", "direction": "desc" }],
  "search": "keyword",
  "search_columns": ["name", "email"],
  "select_columns": ["id", "name", "email"],
  "limit": 50,
  "offset": 0,
  "count_only": false
}
```

### Filter Operators

| Operator | SQL | Value Type |
|----------|-----|-----------|
| `eq` | = | any |
| `ne` | != | any |
| `gt` | > | number/string |
| `gte` | >= | number/string |
| `lt` | < | number/string |
| `lte` | <= | number/string |
| `like` | LIKE | string |
| `ilike` | ILIKE | string |
| `is_null` | IS NULL | N/A |
| `is_not_null` | IS NOT NULL | N/A |
| `in` | IN (...) | array |

**Multiple filters → AND only；不支援 OR / nested grouping。**

### 新增記錄

```
POST /api/v1/open/proxy/{table}

{
  "name": "New Customer",
  "email": "new@example.com"
}
```

Response 201: `{ "id": "uuid", "created_at": "...", "data": {...} }`

> `tenant_id` 由系統自動注入。

### 更新記錄

```
PATCH /api/v1/open/proxy/{table}/{row_id}

{
  "name": "Updated Name"
}
```

Response 200: `{ "id": "uuid", "updated": true }`

### 刪除記錄

```
DELETE /api/v1/open/proxy/{table}/{row_id}
```

Response 204 No Content

### 自動型別轉換

| 輸入格式 | 轉換目標 |
|----------|---------|
| `YYYY-MM-DD`（正好 10 字） | `date` |
| ISO string 含 `T` | `datetime` |
| JSON object/array | `jsonb` |
| UUID 格式字串（`_id` 欄位） | `uuid` |
| 空字串 `""`（`_id` 欄位） | `NULL` |

### Approval Workflow

寫入操作可能被 approval workflow 攔截：
```json
{
  "id": "uuid",
  "updated": false,
  "approval_status": "pending",
  "approval_request_id": "uuid",
  "approval_message": "This update requires approval (2 levels)"
}
```
必須判斷 `approval_status === "pending"` 避免誤判為成功。

---

## Custom Table API（AI-Go JSONB 動態表，API Key 認證）

與系統表不同：不需要 reference whitelist，schema 由 CustomField 定義，資料以 JSONB 儲存。

```
GET    /api/v1/open/data/objects               列出所有自訂表
GET    /api/v1/open/data/objects/{id}/records  列出記錄（id 或 api_slug）
POST   /api/v1/open/data/objects/{id}/records  新增記錄
PATCH  /api/v1/open/data/records/{record_id}   更新記錄（merge mode）
DELETE /api/v1/open/data/records/{record_id}   刪除記錄
```

新增 / 更新 body 格式：`{ "data": { "field": "value" } }`

**Field Types：** `text` `number` `date` `relation`

---

## Reference 管理

```
POST /api/v1/refs/apps/{app_id}
{
  "table_name": "customers",
  "columns": ["id", "name", "email"],
  "permissions": ["read", "create", "update"]
}

PATCH /api/v1/refs/{ref_id}
{ "columns": [...], "permissions": [...] }
```

Permission 對應：`read` → GET/query，`create` → POST，`update` → PATCH，`delete` → DELETE

---

## 安全驗證流程（每次 Proxy 呼叫）

1. Reference whitelist 檢查
2. CRUD permission 檢查
3. Blacklist 表檢查（14 個核心系統表永久封鎖）
4. Column whitelist 驗證
5. Field name regex 驗證（`^[a-zA-Z_][a-zA-Z0-9_]*$`）
6. Operator whitelist 驗證
7. Tenant isolation 注入（自動 `WHERE tenant_id = :tid`）
8. 系統欄位保護

---

## 查詢限制

| 限制 | 說明 | 繞行方法 |
|------|------|---------|
| 無 OR 條件 | Filters 只支援 AND | 用 `search` 做多欄位 OR，或多次查詢後合併 |
| 無 nested 條件 | 不能 `(A AND B) OR C` | 分拆多次查詢 |
| 無 JOIN | 單表查詢 | 分別查詢，app 側合併 |
| 無聚合函數 | 無 SUM/AVG/GROUP BY | 拿原始資料，app 側計算 |
| 無 BETWEEN | 只有單一 operator | 組合 `gte` + `lte` |
| limit 上限 | GET 500, Open 1000 | 用 offset 分頁 |
| 無 cursor pagination | 只有 limit+offset | 搭配 order_by 確保一致性 |

---

## HTTP 狀態碼

| Code | 含義 | 常見原因 |
|------|------|---------|
| 200 | 成功 | |
| 201 | 已建立 | |
| 204 | 無內容 | 成功刪除 |
| 400 | Bad Request | filter 欄位無效、permission 格式錯誤 |
| 401 | 未認證 | API Key 無效/缺少 |
| 403 | 禁止 | 缺少 reference、操作未授權、reference 未發布 |
| 404 | 找不到 | 資源不存在 |
| 500 | 伺服器錯誤 | |

**常見錯誤訊息：**

| 訊息 | 原因 | 解法 |
|------|------|------|
| "App not authorized to access table '{table}'" | 未建立 Reference | 建立 Reference 或改用 `/open/data/` |
| "Reference for table '{table}' not published" | Reference 未發布 | 在 integration 管理發布 |
| "App not authorized to perform '{op}' on table '{table}'" | 操作未在 permissions | 新增操作到 permissions |
| "Unauthorized filter field: {col}" | 欄位未授權 | 加入 Reference columns |

---

## 重要警告

⚠️ **Proxy API 不觸發 Workflow 自動化** — 透過 Proxy 更新 `state` 不會自動產生出貨通知、發票等文件，需手動 INSERT。

⚠️ **Approval Workflow 攔截** — 有審批規則的表可能返回 `approval_status: "pending"` 而非標準成功回應。
