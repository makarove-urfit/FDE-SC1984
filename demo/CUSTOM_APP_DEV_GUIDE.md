---
source: https://www.ai-go.app/docs/custom-app-dev
fetched: 2026-04-23
---

# AI GO Custom App Development Guide

> **唯一參考標準。** 此文件 + `demo/` 資料夾是本專案所有實作的依據。
> 不得依賴 `scripts/` 資料夾的舊程式碼；只參考其業務邏輯流程。

---

## 架構總覽

React + TypeScript，VFS 部署，Shadow DOM 沙盒執行。

## 資料存取 SDK

### `src/db.ts` — Proxy SDK（系統表）

```typescript
import { query, queryAdvanced, insert, update, remove } from "../db";

// 簡易查詢（GET）
const customers = await query("customers", { limit: 50 });

// 進階查詢（POST /query）
const result = await queryAdvanced("customers", {
  filters: [{ column: "status", op: "eq", value: "active" }],
  order_by: [{ column: "name", direction: "asc" }],
});

// 新增（body: { data: {...} }）
await insert("customers", { name: "新客戶" });

// 更新（PUT, body: { data: {...} }）
await update("sale_orders", orderId, { state: "sent" });
```

Filter operators: `eq` `ne` `gt` `gte` `lt` `lte` `like` `ilike` `in` `is_null` `is_not_null`

**已知限制（實測）：**
- `product_product` 的 Boolean filter（`value: true/false`）→ 500，需在 Python action 側過濾
- `x_` 前綴 Odoo 自訂模型透過 `/ext/proxy/` 可能 500，改用 server-side action

### `src/api.ts` — AI-Go JSONB 自訂表

```typescript
import { listRecords, submitRecord, updateRecord, deleteRecord } from "../api";

const records = await listRecords("my_table");
await submitRecord("my_table", { name: "新記錄" });
await updateRecord("my_table", recordId, { name: "更新" });
await deleteRecord("my_table", recordId);
```

---

## Server-Side Actions

**位置：** `actions/` 目錄 + `manifest.json`

### Python 格式

```python
def execute(ctx):
    data = ctx.params.get("key", "default")
    rows = ctx.db.query("customers", limit=10)
    ctx.response.json({"result": rows})
```

**ctx 方法：**
- `ctx.params` — 前端傳入參數
- `ctx.db.query(table, limit=N)` — 查詢（支援 x_ 表）
- `ctx.db.insert(table, data)` — 新增
- `ctx.response.json(data)` — JSON 回應

**限制：** 30 秒 timeout，256 MB 記憶體

### `src/action.ts` — Action SDK（前端呼叫）

```typescript
import { runAction, downloadFile } from "../action";

const { data, file } = await runAction("my_action", { key: "value" });
if (file) downloadFile(file);
```

**Action URL（重要！）：**

| App 類型 | URL 格式 |
|----------|---------|
| 外部 Custom App | `/api/v1/ext/actions/run/{action_name}` |
| 內部 App | `/api/v1/actions/run/{app_id}/{action_name}` |

> **注意：** 外部 app 使用 `__IS_EXTERNAL__` 判斷，URL 用 `/ext/actions/run/{name}`，
> **不是** `/ext/actions/{APP_SLUG}/{name}`（後者返回 404）。

---

## Shadow DOM 規則

```css
/* ✅ 必須雙 selector */
:host, :root {
  --primary: #2563eb;
}
/* ❌ 只用 :root 會失效 */
```

- ❌ `confirm()` `alert()` `prompt()` — 改用 React state
- ✅ `localStorage` `fetch` `window.location.reload()` — 正常使用

---

## VFS 部署

```
PUT /api/v1/builder/apps/{id}/source
{ "vfs_state": { "src/App.tsx": "..." } }
```

```
POST /api/v1/compile/compile/{slug}
POST /api/v1/builder/apps/{app_id}/publish
{ "published_assets": {} }
```

---

## 限制清單

| 項目 | 限制 |
|------|------|
| 每 App 最大檔案數 | 200 |
| 單檔大小 | 1 MB |
| 編譯 timeout | 30 秒 |
| Action timeout | 30 秒 |
| Action 記憶體 | 256 MB |
