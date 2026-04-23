---
name: aigo-api-discrepancies
trigger: always_on
description: "AI GO 官方文件與實際 API 行為的差異紀錄，避免踩同樣的坑。"
---

# AI GO API 實際行為 vs 官方文件差異

> 驗證日期：2026-04-09  
> 驗證帳號：admin@sc1984.com（tenant: 764f9941-8426-43e9-8a4f-6462c787e8a4）

---

## 1. Custom Table API 端點前綴

| | 官方文件 | 實際 |
|---|---|---|
| 前綴 | `/api/v1/open/data/` | `/api/v1/data/` |
| 建立 Custom Object | 未記載（UI 操作）| `POST /api/v1/data/objects` |
| 列出 Custom Objects | `GET /api/v1/open/data/objects` | `GET /api/v1/data/objects?app_id={app_id}` |
| 列出記錄 | `GET /api/v1/open/data/objects/{obj_id}/records` | `GET /api/v1/data/objects/{obj_id}/records` |
| 新增記錄 | `POST /api/v1/open/data/objects/{obj_id}/records` | `POST /api/v1/data/objects/{obj_id}/records` |
| 新增欄位 | 未記載 | `POST /api/v1/data/objects/{obj_id}/fields` |
| 修改欄位 | 未記載 | `PATCH /api/v1/data/fields/{field_id}` |
| 刪除欄位 | 未記載 | `DELETE /api/v1/data/fields/{field_id}` → 204 |
| 刪除 Object | 未記載 | `DELETE /api/v1/data/objects/{obj_id}` → 204 |

**結論**：文件上的 `/open/data/` 應改為 `/data/`。Object 與欄位的 CRUD 都有對應 API，不一定需要 UI。

---

## 2. Custom Table API 認證方式

| | 官方文件 | 實際 |
|---|---|---|
| 認證方式 | `X-API-Key` header | `Authorization: Bearer {token}`（與一般 proxy 相同） |
| Token 來源 | 需另行建立 Integration + API Key | 直接用 `POST /auth/login` 取得的 access_token |

**結論**：`X-API-Key` 的流程雖然可以走通（成功建立 integration 與 key），但 `/data/` endpoint 用 Bearer token 即可，不需要 API Key。`/open/data/` 配合 X-API-Key 會回傳空陣列（不報錯，但沒資料）。

---

## 3. api_slug 是 tenant 層級，不是 app 層級

官方文件：Custom Table 屬於 App，以 app_id 隔離。  
實際：`api_slug` 的 unique constraint 是 `(tenant_id, api_slug)`，**跨 app 共用**。

- 在 ordering app 建立的 `x_price_log`，admin app 也能用相同 slug 存取同一份資料
- 不需要在多個 app 各建一份同名 object，建一份即可
- 列出時用 `?app_id=` 只是 UI 分類顯示，不影響資料隔離

---

## 4. field_key 一旦建立無法修改

`PATCH /data/fields/{field_id}` 可以改 `name`、`field_type`、`sequence`，但 **`field_key` 無法修改**（回 200 但不生效）。

要修正 field_key 必須：
1. `DELETE /data/fields/{field_id}` → 204
2. `POST /data/objects/{obj_id}/fields` 重新建立

---

## 5. Field Key 命名注意事項

UI 輸入欄位名稱時，底線會被自動去除：
- `product_id` → field_key 變成 `productid`
- `effective_date` → `effectivedate`

**建議**：用 API 建欄位（`POST /data/objects/{obj_id}/fields`），直接指定 `field_key`，確保底線正確。

---

## 6. Proxy 路徑與 Token 類型的對應關係（重要）

外部用戶（`auth_type: "custom_app_user"`, `scope: "app_runtime"` JWT）：

| 操作 | 正確路徑 | 說明 |
|------|---------|------|
| 讀取（GET / filtered POST /query） | `/api/v1/ext/proxy/{table}` | ✅ 確認有效 |
| 寫入（POST） | `/api/v1/ext/proxy/{table}` | ✅ 確認有效（扁平 payload，無 data 包裝） |
| 更新（PATCH） | `/api/v1/ext/proxy/{table}/{id}` | ✅ 確認有效（需 `{"data": {...}}` 包裝） |

**不能用**：
- `/open/proxy/` GET → 422
- `/proxy/{app_id}/` 搭配 app_runtime token → 401（只有 admin token 有效）

**先前誤判**：`/ext/proxy/` POST 回傳 400「無有效欄位資料」，原因是 payload 包了 `{"data": {...}}` wrapper，不是路徑錯誤。正確格式是扁平欄位。

**結論（2026-04-10 實測確認）**：`/ext/proxy/` 同時支援讀取與寫入，**db.ts 可統一用同一個 base**：
```typescript
const proxyBase = API_BASE + '/ext/proxy/';
// GET → proxyBase + table
// POST → proxyBase + table（扁平 payload）
// PATCH → proxyBase + table + '/' + id（{data:{...}} 包裝）
```

---

## 7. Custom Table 與 Odoo Proxy 的差異（重要）

| | Odoo Proxy | Custom Table |
|---|---|---|
| 端點 | `/api/v1/proxy/{app_id}/{table}` 或 `/api/v1/ext/proxy/{table}` | `/api/v1/data/objects/{uuid}/records` |
| 資料存放 | Odoo PostgreSQL 實體表 | JSONB（`data` 欄位） |
| 回傳格式 | 扁平欄位 `{ id, col1, col2, ... }` | 包裝 `{ id, data: { field1, field2 }, created_at, updated_at }` |
| 引用白名單 | 需要 | 不需要 |
| 建表方式 | 需在 Odoo 後台建 model | `POST /api/v1/data/objects` |

**常見錯誤**：對 Custom Table 打 `/ext/proxy/` 或 `/proxy/` 會收到 `500 relation does not exist`。

### VFS Runtime 存取規則（必讀）

**Custom App User bearer（ordering runtime 用的 token）無法存取 `/data/objects/`。**
`db.queryCustom()` 雖然存在，但在 ordering runtime 使用時 API 回 401 → 函式靜默回傳 `[]` → 看起來正常實際上沒有資料。

**Custom Table 的唯一正確處理方式：在 deploy 時用 admin bearer 拉取，bake 進靜態 JSON。**

```python
# deploy_ordering.py：admin bearer 拉，傳入 build_vfs
holiday_dates = fetch_holiday_data(h)   # h = admin bearer
vfs = build_vfs(price_data, holiday_dates, app_settings)
```

```typescript
// ordering_vfs.py App.tsx：import 靜態 JSON，不做 runtime fetch
import HOLIDAY_DATA from "./holiday_data.json";
const HOLIDAY_SET = new Set<string>(HOLIDAY_DATA as string[]);
```

**pre-flight checklist（寫 ordering runtime 存取前先問）：**
1. 這個表是 Odoo 後台 model 嗎？→ 用 `db.query(tableName, ...)`，欄位是扁平格式，✅ runtime OK
2. 這個表是 Custom Table（在 AI GO Data Objects 建的）嗎？→ **不能在 runtime 存取**，deploy 時 bake 成靜態 JSON
3. `db.queryCustom()` 在 ordering runtime 無效（401 → []），**不要用**

本專案 Odoo 表（runtime OK）：`sale_orders`, `sale_order_lines`, `product_templates`, `product_categories`, `product_product`, `customers`, `uom_uom`
本專案 Custom Table（deploy-time bake only）：`x_price_log`, `x_app_settings`, `x_holiday_settings`（見 Section 8）

---

## 8. 本專案 Custom Table 清單

| api_slug | Object UUID | field_key 清單 |
|---|---|---|
| `x_price_log` | `0838e79c-52bb-4d2a-bac8-92eaef87f691` | `product_id`, `price`, `effective_date`, `created_at`, `note` |
| `x_app_settings` | `fc8e665a-9156-400d-8c6a-a9c2c6f4574e` | `key`, `value`, `updated_at` |
| `x_holiday_settings` | `96d01299-1d33-4ca7-b437-4bf5c78dfdcf` | `date`, `reason` |

全部建在 ordering app 下（slug 為 tenant 層級，admin app 也能直接存取）。

---

## 11. External App 的 Server-Side Action 無法使用（2026-04-13）

**症狀**：POST `/ext/actions/run/{action_name}` 回傳 500：
```json
{"detail": "Action 執行失敗: 'NoneType' object has no attribute 'published_vfs'"}
```

**原因**：AI GO 平台 bug，External App（Custom App User 認證）的 action runtime 無法讀取 `published_vfs`，與 compile 是否帶 `?dev=true` 無關。

**結論**：External App 不可使用 Server-Side Actions。替代方案：直接從前端呼叫 `/ext/proxy/` 完成讀寫，line insert 失敗時用 PATCH 做 best-effort rollback。

---

## 10. Action 呼叫端點的正確 slug（2026-04-13）

Action 端點：`POST /api/v1/ext/actions/{slug}/{action_name}`

此處 `{slug}` 是 runtime 注入的 `__APP_SLUG__`（Custom App 的 auth slug），**不是** Builder API（`GET /builder/apps/{id}`）回傳的 `slug` 欄位（那是 compile 用的 builder slug，兩者不同）。

```typescript
const APP_SLUG = (window as any).__APP_SLUG__ || '';
const actionUrl = isExternal
  ? API_BASE + '/ext/actions/' + APP_SLUG + '/' + actionName
  : API_BASE + '/actions/run/' + appId + '/' + actionName;
```

錯誤路徑（會 404）：`/ext/actions/{builder_slug}/{action_name}`  
錯誤路徑（會 500）：`/ext/actions/run/{action_name}`（缺少 slug）

---

## 9. 已驗證可運作的下單模式（2026-04-10）

透過 `/ext/proxy/` + Custom App User Bearer，完整下單流程：

```typescript
// 1. 建立訂單（sale_orders）
const order = await db.insert("sale_orders", {
  customer_id: customerId,           // string UUID
  date_order: "2026-04-10",          // DATE 格式，不是 ISO datetime
  note: `配送日期：${selectedDate}\n${note}`,  // delivery_date 不在 sale_orders，存入 note
});
const orderId = order?.id;

// 2. 建立訂單明細（sale_order_lines）
await db.insert("sale_order_lines", {
  order_id: orderId,
  product_template_id: productId,    // 指向 product_templates.id（不是 product_products）
  name: productName,
  product_uom_qty: qty,
  price_unit: price,
  delivery_date: "2026-04-10",       // DATE 格式，此欄位在 sale_order_lines 有效
});
```

**關鍵限制**：
- `sale_orders.date_order` → `DATE` 型別，用 `new Date().toISOString().slice(0, 10)`
- `sale_orders.state` → 不可寫入（Odoo 自動管理）
- `sale_order_lines.product_id` → `product_products.id`（variant），通常不用
- `sale_order_lines.product_template_id` → `product_templates.id`（template），前端用這個

---

## 12. `/ext/proxy/` Filter 運算子白名單（踩過的坑）

`/ext/proxy/` 只接受以下運算子：
`eq` `ne` `gt` `gte` `lt` `lte` `like` `ilike` `in` `is_null` `is_not_null`

**`/open/proxy/`（admin 走的 API-key 路徑）接受短寫法 `ge`、`le`，但 `/ext/proxy/` 不接受。**

```typescript
// ✅ 正確
{ column: "date", op: "gte", value: today }

// ❌ 錯誤 → 400「不支援的運算子: ge」
{ column: "date", op: "ge", value: today }
```

**pre-flight**：從 admin 側（`/open/proxy/`）複製 filter 到 ordering runtime（`/ext/proxy/`）時，必須確認 op 是長寫法。`ge`→`gte`，`le`→`lte`。
