# FDE-SC1984 雄泉鮮食

蔬果批發營運管理系統，基於 **AI GO Platform** 的 Custom App 架構，前端以 VFS 注入，後端透過 Server-Side Actions + Odoo ERP proxy 實現。

---

## 系統概覽

```
客戶下單 (Ordering) → 訂單確認 → 採購到貨 → 出貨分配 → 司機配送 (Admin)
```

| App | 對象 | App ID | 網址 |
|-----|------|--------|------|
| **Ordering** | 客戶（C 端） | `fe9c0a29-d8c0-4129-b2c1-f3d0dc57c958` | `ordering.apps.ai-go.app` |
| **Admin** | 業主／員工（B 端） | `6d1b56d0-0b54-4bda-8d41-9bf201d0cb78` | `admin.apps.ai-go.app` |

---

## 目錄結構

```
fde-sc1984/
├── scripts/
│   ├── deploy_ordering.py     ← Ordering 部署腳本（登入→設 refs→注入 VFS→編譯→發布）
│   ├── ordering_vfs.py        ← Ordering VFS 內容（所有前端程式碼＋actions）
│   ├── deploy_admin.py        ← Admin 部署腳本
│   ├── v5_css.py / v5_pages.py / v6_pages.py  ← Admin VFS 模組
│   └── admin_vfs.py（若存在）
├── .agent/rules/
│   ├── aigo-custom-app-dev.md    ← AI GO Custom App 開發規範
│   └── aigo-api-discrepancies.md ← 官方文件 vs 實際行為差異紀錄
└── .env                       ← 認證資訊（gitignored）
```

---

## 部署

```bash
set -a && source .env && set +a

# Ordering
python3 scripts/deploy_ordering.py

# Admin
python3 scripts/deploy_admin.py
```

### 所需環境變數（`.env`）

```
AIGO_EMAIL=admin@sc1984.com
AIGO_PASSWORD=...
ORDERING_APP_ID=fe9c0a29-d8c0-4129-b2c1-f3d0dc57c958
ADMIN_APP_ID=6d1b56d0-0b54-4bda-8d41-9bf201d0cb78
```

---

## AI GO Platform 技術參考

### 認證

| 類型 | 使用方 | 方式 |
|------|--------|------|
| Admin JWT | 部署腳本 | `POST /api/v1/auth/login` → `Bearer {access_token}` |
| Custom App User Token | Ordering 前端用戶 | `POST /api/v1/custom-app-auth/{slug}/login` → Bearer JWT，`auth_type: "custom_app_user"` |

### Proxy API 路徑（重要）

| 路徑前綴 | 認證方式 | 支援操作 | 用途 |
|---------|---------|---------|------|
| `/api/v1/proxy/{app_id}/` | Admin Bearer | 讀 + 寫 | 部署腳本或 Admin App |
| `/api/v1/ext/proxy/` | Custom App User Bearer | **讀 + 寫**（同引擎） | Ordering 前端 |
| `/api/v1/open/proxy/` | `X-API-Key` | 讀 + 寫 | Self-Built 後端 |

> ⚠️ `/open/proxy/` 需要 `X-API-Key`（非 Bearer），GET 請求會回 422。  
> ✅ `/ext/proxy/` 對 Custom App User Token 支援讀取和寫入，與 Open Proxy 同一引擎。

### Proxy 查詢格式

```typescript
// 簡單查詢
GET /ext/proxy/{table}?limit=50&offset=0

// 進階查詢（filter）
POST /ext/proxy/{table}/query
{
  "filters": [{ "column": "email", "op": "eq", "value": "..." }],
  "order_by": [{ "column": "created_at", "direction": "desc" }],
  "limit": 50,
  "offset": 0
}

// 新增
POST /ext/proxy/{table}
{ "customer_id": "...", "date_order": "..." }   // 平坦欄位，不包 data wrapper

// 更新
PATCH /ext/proxy/{table}/{row_id}
{ "data": { "state": "sale" } }   // ⚠️ 更新需要 data wrapper
```

> ⚠️ **已知問題**：SDK 內建 `db.update()` 缺少 `data` wrapper，需直接 fetch 並手動包裝。

### Filter 運算子

`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`, `is_null`, `is_not_null`

### Custom Table API（x_ 開頭表）

```
GET  /api/v1/data/objects/{uuid_or_slug}/records
POST /api/v1/data/objects/{uuid_or_slug}/records
PATCH /api/v1/data/records/{record_id}
DELETE /api/v1/data/records/{record_id}
```

認證：Admin Bearer token（Custom App User token 無法存取）。  
資料格式：`{ id, data: { field1, field2 }, created_at, updated_at }`

### Server-Side Actions（後端邏輯）

Action 是 Python 腳本，執行於 AI GO 沙盒，有完整 DB 寫入權限，**不需要 proxy 認證**。

```python
# actions/my_action.py
def execute(ctx):
    items = ctx.params.get("items", [])
    user = ctx.user                          # 登入用戶資訊
    secret = ctx.secrets.get("api_key")     # App secrets
    order = ctx.db.insert("sale_orders", { "customer_id": "..." })
    ctx.response.json({ "order_id": order["id"] })
```

| ctx 方法 | 說明 |
|---------|------|
| `ctx.params` | 前端傳入參數 |
| `ctx.user` | 當前登入用戶（email、display_name 等） |
| `ctx.db.query(table, limit=N)` | 查詢資料表 |
| `ctx.db.insert(table, data)` | 新增記錄 |
| `ctx.secrets.get(key)` | 取得 App Secret（由 `/api/v1/actions/apps/{app_id}/secrets` 管理） |
| `ctx.response.json(data)` | 回傳 JSON |
| `ctx.response.error(msg)` | 回傳錯誤 |

前端呼叫：

```typescript
import { runAction } from "../action";
const result = await runAction("my_action", { items: [...] });
```

Action 呼叫端點（Custom App User）：`POST /api/v1/ext/actions/{slug}/{action_name}`

**限制**：30 秒 timeout、256 MB 記憶體、白名單模組（json, math, re, datetime, httpx 等）

### VFS 標準結構

```
package.json
src/
  main.tsx            ← 必須，入口點
  App.tsx             ← 路由
  App.css             ← 全域樣式（需用 :host, :root 雙選擇器）
  action.ts           ← SDK（Immutable，runtime 注入，不放進 VFS）
  db.ts               ← SDK（可覆寫以自訂 proxy 路徑）
  api.ts              ← SDK（Custom Table CRUD）
  data.json           ← runtime 注入
  db.json             ← runtime 注入
  pages/
    _manifest.json
actions/
  manifest.json       ← Action 登錄表
  place_order.py      ← Server-Side Action
```

> ⚠️ `src/action.ts`、`src/api.ts`、`src/data.json`、`src/db.json` 標記為 Immutable SDK（runtime 提供），不應放進 VFS 覆寫。

### Shadow DOM 限制（必讀）

- CSS 變數需用 `:host, :root { --var: value; }` 雙選擇器
- `confirm()`、`alert()`、`prompt()` 在 Shadow DOM 無效，改用 React state
- 根元素需設 `height: 100vh; overflow-y: auto` 才能滾動

---

## 資料模型

### Odoo 系統表（透過 Proxy）

| 表名 | 主要欄位 | Ordering 權限 | Admin 權限 |
|------|---------|--------------|-----------|
| `product_templates` | id, name, default_code, categ_id, list_price, uom_id | read | read, update |
| `product_categories` | id, name, parent_id | read | — |
| `customers` | id, name, email, ref, customer_type | read, create | read, update |
| `sale_orders` | id, name, state, date_order, customer_id, note, amount_total | read, create | read, update |
| `sale_order_lines` | id, order_id, product_id, product_uom_qty, price_unit, name, delivery_date | read, create | read, update |
| `uom_uom` | id, name | read | — |
| `suppliers` | id, name, ref, ... | — | read, create, update |
| `purchase_orders` | id, name, state, supplier_id, ... | — | read, create, update |
| `purchase_order_lines` | id, order_id, product_id, ... | — | read, create, update |
| `stock_quants` | id, product_id, quantity, location_id | — | read, create, update |
| `hr_employees` | id, name, department_id | — | read |

**已知欄位限制**：
- `sale_orders.delivery_date` 欄位不存在（deploy 腳本已移除）
- `sale_orders.state` 由 Odoo 自動管理，不可直接寫入
- `customers.customer_type` NOT NULL，值為 `company` / `individual`
- Many2one 欄位可能回傳 `[id, name]` 或純 id，需防禦性解析

### Custom Table（x_ 前綴，tenant 層級共用）

| api_slug | UUID | 欄位 | 說明 |
|---------|------|------|------|
| `x_price_log` | `0838e79c-...` | product_id, price, effective_date | 每日售價，deploy 時靜態 embed |
| `x_holiday_settings` | `96d01299-...` | date, reason | 假日清單，deploy 時靜態 embed |
| `x_app_settings` | `fc8e665a-...` | key, value, updated_at | 應用設定 |

---

## Ordering App 功能說明

### 價格邏輯（重要）

Ordering App 顯示的價格為**參考價**，非最終計費價格：

| 欄位 | 來源 | 意義 |
|------|------|------|
| `price_data.json[product_id].price` | `x_price_log` 最新一筆 | **參考報價**，deploy 時 embed，顯示於商品卡片供客戶參考 |
| `price_data.json[product_id].effective_date` | `x_price_log.effective_date` | 該參考報價的日期（非配送日） |
| `sale_order_lines.price_unit` | 下單時從 price_data 帶入 | 記錄下單當下的參考價 |

**實際計費以配送日的市場實價為準**，由業主在配送後於 Admin 後台更新 `sale_order_lines.price_unit`。前端顯示的「參考 M/D」即為最近一次報價的日期，客戶需知悉最終金額以配送日實價為主。

### 靜態資料 Deploy-time Embed

為避免 Custom App User token 無法存取 `/data/` 端點，以下資料由 `deploy_ordering.py` 在部署時以 admin token 拉取，embed 為 VFS 靜態 JSON：

- `src/price_data.json`：`{product_id: {price, effective_date}}`，每商品取最新一筆（**僅供參考，非最終計費價**）
- `src/holiday_data.json`：`['YYYY-MM-DD', ...]`

### 下單流程

```
CartPage
  → runAction("place_order", { items, note, delivery_date })
  → POST /ext/actions/{slug}/place_order
  → place_order.py (ctx.db)
      → ctx.db.query("customers") 比對 email
      → ctx.db.insert("sale_orders", { customer_id, date_order, note })
      → ctx.db.insert("sale_order_lines", ...) × N
  → 回傳 { order_id, order_name }
```

配送日期存於 `sale_orders.note`（格式：`配送日期：YYYY-MM-DD\n備註...`）

---

## 錯誤碼速查

| HTTP | 意義 |
|------|------|
| 400 | 請求格式錯誤 / 欄位不在白名單 |
| 401 | Token 缺失或無效 |
| 403 | 無權限存取該表 |
| 404 | 路徑錯誤或資源不存在 |
| 409 | 版本衝突（VFS Optimistic Lock） |
| 422 | 請求驗證失敗（欄位格式或 header 缺失）|
| 429 | Rate limit |
