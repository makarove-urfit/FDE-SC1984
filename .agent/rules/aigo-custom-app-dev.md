---
name: aigo-custom-app-dev
trigger: always_on
description: "AI GO Custom App 開發者指南：VFS 架構、程式碼注入 API、Shadow DOM CSS 規範、Server-Side Actions。移植或開發 AI GO 平台應用時必讀。"
---

# AI GO Custom App Developer Guide

> **Version**: 1.2 | **Last Updated**: 2026-04-05 | **API Version**: v1

---

## 1. 什麼是 Custom App

Custom App 是 AI GO 平台內可程式化的微型應用，使用 **React + TypeScript** 打造商業工具。

### 核心概念

- **VFS (Virtual File System)**：JSON 物件格式，儲存原始碼為 `{"file_path": "file_content"}`
- **esbuild Compiler**：將 React TSX 轉為瀏覽器可執行 JS bundle
- **Runtime Sandbox**：在隔離的 **Shadow DOM** 環境執行
- **Server-Side Actions**：Python 後端腳本，執行於安全沙盒中

### Internal vs External

| 功能 | Internal | External |
|------|----------|----------|
| 用途 | 組織內部管理工具 | 客戶/供應商應用 |
| 認證 | 主站帳號登入 | 獨立帳號系統 |
| API 操作 | 完全相同（Builder API） | 完全相同（Builder API） |

---

## 2. 認證與連線

### 取得 JWT Token

```http
POST https://ai-go.app/api/v1/auth/login
Content-Type: application/json

{ "email": "developer@example.com", "password": "your_password" }
```

回傳：`access_token`, `refresh_token`, `expires_in`, `token_type`

### 使用 JWT

```http
GET /api/v1/builder/apps/{slug}
Authorization: Bearer {access_token}
```

---

## 3. App 架構理解（修改前必讀）

> **關鍵**：修改前先讀取並理解現有 VFS 結構，避免架構不相容。

### 標準流程

```
1. GET /api/v1/builder/apps/{slug}
   → 取得 vfs_state, vfs_version, access_mode

2. 分析 VFS 結構：
   - src/App.tsx → 了解路由
   - src/routes.ts → 導覽設定
   - src/pages/_manifest.json → 頁面清單

3. 驗證 SDK：
   - src/api.ts → Custom Data CRUD
   - src/db.ts → DB Proxy
   - src/action.ts → Server-Side Action
```

### 核心規則

1. 使用 **React 18 + TypeScript + HashRouter**（單頁應用可不用 Router）
2. React、ReactDOM、lucide-react、react-router-dom 由 Runtime 提供，**不可自行安裝**
3. CSS 使用全域 `App.css`；**不支援 CSS Modules 和 Tailwind**
4. Entry point 必須是 `src/main.tsx`
5. Server-Side Actions 使用 Python，放在 `actions/` 目錄
6. ⚠️ **Runtime 執行在 Shadow DOM**—CSS 變數必須用 `:host, :root` 雙選擇器
7. ⚠️ **Shadow DOM 容器需要 `overflow-y: auto`**—避免長內容無法滾動

---

## 4. VFS 標準檔案結構

```
├── package.json                    # 依賴聲明
├── src/
│   ├── main.tsx                    # ★ 入口點（必須）
│   ├── App.tsx                     # 路由 + Layout
│   ├── App.css                     # 全域樣式
│   ├── routes.ts                   # 導覽設定
│   ├── api.ts                      # SDK: Custom Data CRUD（不可修改）
│   ├── db.ts                       # SDK: DB Proxy（不可修改）
│   ├── action.ts                   # SDK: Server-Side Action（不可修改）
│   ├── data.json                   # Custom Table 定義（Runtime 自動注入）
│   ├── db.json                     # Data Reference 定義（Runtime 自動注入）
│   ├── pages/
│   │   ├── _manifest.json          # 頁面清單
│   │   └── DashboardPage.tsx
│   └── components/
└── actions/
    ├── manifest.json               # Action 登錄
    └── example_action.py
```

---

## 5. 程式碼注入 API

| 操作 | HTTP 方法 | Endpoint |
|------|-----------|----------|
| 取得 App（含 VFS） | GET | `/api/v1/builder/apps/{slug}` |
| 全量覆寫 VFS | PUT | `/api/v1/builder/apps/{id}/source` |
| 局部更新檔案 | PATCH | `/api/v1/builder/apps/{id}/source/files` |
| 刪除檔案 | DELETE | `/api/v1/builder/apps/{id}/source/files` |

### 局部更新（推薦）

```http
PATCH /api/v1/builder/apps/{app_id}/source/files
Authorization: Bearer {JWT}
Content-Type: application/json

{
  "files": { "src/pages/NewPage.tsx": "...完整內容..." },
  "expected_version": 5
}
```

### 樂觀鎖（Optimistic Locking）

取得 App 時記錄 `vfs_version`，修改時帶入 `expected_version`。版本不符回傳 **409 Conflict**。

---

## 6. 編譯與偵錯

```http
POST /api/v1/compile/compile/{slug}?dev=true
Authorization: Bearer {JWT}
```

| 限制 | 值 |
|------|---|
| 最大檔案數 | 200 |
| 單檔大小 | 1 MB |
| 編譯逾時 | 30 秒 |

### Runtime 提供的外部模組（不需安裝）

```
react, react-dom, lucide-react, react-router-dom, react-hot-toast
```

---

## 7. 內建 SDK

### Custom Data (`src/api.ts`)

```typescript
import { listRecords, submitRecord, updateRecord, deleteRecord } from "../api";
const records = await listRecords("my_table");
```

### DB Proxy (`src/db.ts`)

```typescript
import { query, queryAdvanced, insert, update, remove } from "../db";
const customers = await query("customers", { limit: 50 });
```

#### ⚠️ `db.update()` 已知問題

SDK 的 `update()` 未包裝 `{"data": {...}}`，會造成 400 錯誤。**必須改用直接 fetch**：

```typescript
// ✅ 正確：直接 fetch 並包裝 data
const apiBase = (window as any).__API_BASE__ || '/api/v1';
const appId = (window as any).__APP_ID__ || '';
const token = (window as any).__APP_TOKEN__ || '';
const resp = await fetch(`${apiBase}/proxy/${appId}/sale_orders/${orderId}`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  credentials: 'include',
  body: JSON.stringify({ data: { state: "sent" } }),
});
```

> **注意**：`db.insert()` 有類似問題，失敗時也要用相同包裝。

### Server Action (`src/action.ts`)

```typescript
import { runAction, downloadFile } from "../action";
const result = await runAction("my_action", { key: "value" });
```

---

## 8. Server-Side Actions

```python
def execute(ctx):
    data = ctx.params.get("key", "default")
    customers = ctx.db.query("customers", limit=10)
    ctx.response.json({"result": customers})
```

| ctx 方法 | 說明 |
|---------|------|
| `ctx.params` | 前端傳入參數 |
| `ctx.db.query(table)` | 查詢資料 |
| `ctx.db.insert(table, data)` | 新增記錄 |
| `ctx.http.call(service, endpoint)` | 呼叫外部 API |
| `ctx.secrets.get(key)` | 取得密鑰 |
| `ctx.response.json(data)` | JSON 回應 |

**安全限制**：僅允許白名單模組（json, math, re, datetime, httpx 等）；禁止 exec, eval, open；30 秒超時，256 MB 記憶體。

---

## 9. 驗證與發布

```http
POST /api/v1/builder/apps/{app_id}/publish
Authorization: Bearer {JWT}
Content-Type: application/json

{ "published_assets": {} }
```

**標準開發循環**：PATCH 修改 → POST 編譯（dev=true）→ 失敗則修改重複 → 成功預覽 → POST 發布

---

## 10. Shadow DOM CSS 強制規範

> **關鍵**：違反此規範會造成「本地正常，部署後樣式消失」。

### 必須使用 `:host, :root` 雙選擇器

```css
/* ✅ 正確 */
:host, :root {
  --primary: #2563eb;
}
html, :host {
  line-height: 1.5;
}

/* ❌ 錯誤：Shadow DOM 內 :root 失效 */
:root { --primary: #2563eb; }
html { line-height: 1.5; }
```

### 自查 Checklist

- [ ] 搜尋 `:root {`（無 `:host`）→ 改為 `:host, :root {`
- [ ] 搜尋 `html {`（無 `:host`）→ 改為 `html, :host {`
- [ ] Dark Mode `@media` 區塊使用 `:host, :root`

### JavaScript API 限制（Shadow DOM 內靜默失效）

| API | Shadow DOM 行為 | 替代方案 |
|-----|----------------|---------|
| `confirm()` | 靜默回傳 `false` | React `useState` 兩階段確認 |
| `alert()` | 不顯示 | `react-hot-toast` 或自訂 Toast |
| `prompt()` | 回傳 `null` | React 自訂 Input Modal |

### Container Scroll 限制

```tsx
// ✅ 正確：外層 Layout 必須設定 height + overflow
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100vh", overflowY: "auto" }}>
      {children}
    </div>
  );
}
// ❌ 錯誤：minHeight 不觸發 overflow
```

### 單頁應用路由

- 單頁應用不需要 React Router，直接渲染主元件
- 多頁面應用必須使用 **HashRouter**（不可用 BrowserRouter）

---

## 11. VFS 注入腳本開發規範

```python
# ✅ 正確：每個 VFS 檔案定義為完整 raw string，避免字串操作
files["src/pages/CartPage.tsx"] = r'''import React from "react";
export default function CartPage() {
  return <main><h1>Shopping Cart</h1></main>;
}
'''

# 注入後必須驗證編譯
result = r.json()
if not result.get("success"):
    print(f"❌ 編譯失敗：{result.get('error')}")
    sys.exit(1)
```

---

## 12. 常見問題

| 問題 | 解法 |
|------|------|
| 白畫面 | 確認 `src/main.tsx` 正確掛載 React |
| 路由無效 | 用 `HashRouter`，不用 `BrowserRouter` |
| 頁面無法滾動 | Shadow DOM 容器需 `height: 100vh; overflow-y: auto` |
| CSS 變數消失（部署後） | 用 `:host, :root` 取代只有 `:root` |
| `db.update()` 400 錯誤 | SDK `update()` 缺少 `{"data": {...}}` 包裝 |
| 409 Conflict | VFS 同時被修改，重新 GET 後再 PATCH |
| confirm() 永遠 false | Shadow DOM 內原生 confirm() 失效，改用 React state |
