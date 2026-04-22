# AGENT_PLAN

## 待執行

- [ ] 2026-04-22 Admin VFS — 移植剩餘頁面至 scripts/pages.py：PricePage、OrderEditPage（admin/src 有，VFS 尚未）
- [x] 2026-04-22 Admin VFS — SettingsPage / SupplierMappingPage / DriverMappingPage 三頁移植完成；dashboard() 基礎設定 tab 補齊「關係對應 / 系統」兩組；db.ts query/queryFiltered 改為內建分頁避免 422 limit>500
      執行：scripts/pages.py 加 settings_page / supplier_mapping_page / driver_mapping_page 三個函式；deploy_admin.py App.tsx 加三個路由；get_db_ts() 改為分頁版
      驗證：python3 scripts/deploy_admin.py 編譯 200 / 發布 200
- [x] 2026-04-22 Admin VFS — Dashboard 切 tab、新增 Products/ProductCategories/CategoryBuyer 三頁
      執行：scripts/pages.py 加三個函式；dashboard() 重寫為 tab；deploy_admin.py 掛上新路由並加 product_categories reference（permissions: read/create/update/delete），product_templates 補 update 權限；db.ts 擴充 updateCustom / deleteCustom / deleteRow
      驗證：python3 scripts/deploy_admin.py 編譯 200 / 發布 200
- [x] 2026-04-22 Admin 首頁切 Tab（admin/src + VFS 兩端）— 每日流程 / 基礎設定
- [x] 2026-04-22 新增 ProductsPage（admin/src + VFS）— 列出 product_templates，可改 categ_id
- [x] 2026-04-22 新增 ProductCategoriesPage（admin/src + VFS）— product_categories CRUD
- [x] 2026-04-22 新增 CategoryBuyerPage（admin/src + VFS）— x_category_buyer 對應（已上線；table 使用者手動建好）
- [x] 2026-04-22 整修 DriverMappingPage（admin/src）— 以下拉選單取代 text input，按司機分組顯示客戶（VFS 版待後續移植）
- [ ] 2026-04-07 GitHub Secrets — 在 repo 設定 AIGO_EMAIL、AIGO_PASSWORD、ADMIN_APP_ID、ORDERING_APP_ID 四個 secrets（舊 VM/Docker secrets 可移除）

- [ ] 2026-04-02 需求 9：後台頁面設定司機與客戶的關聯（資料表 + API + UI）
- [ ] 2026-04-02 需求 8：發貨單（DeliveryPage + DeliverySlipPrint）顯示備註欄位
- [ ] 2026-04-02 需求 7：實價更新後同步所有客戶訂單價格，並記錄軌跡（需客製化 x_price_audit_log 資料表）
- [ ] 2026-04-02 需求 6：前台商品顯示「最近一次價格」（非實價），需決定價格來源欄位（見 ASK_HUMAN）
- [ ] 2026-04-16 Admin custom app 補上 order audit log：建 x_order_audit_log custom table、在確認/取消訂單動作中呼叫 writeOrderAuditLog()（admin/src/api/orderAuditLog.ts 已有實作，待接入 scripts/pages.py）
- [ ] 2026-04-02 需求 5：後台可編輯客戶訂單，需稽核軌跡（需客製化 x_order_audit_log 資料表）
- [ ] 2026-04-02 需求 4：客戶前台訂單可選日期（明天以後、30 日內、排除休假日）；需客製化 x_holiday_settings 資料表
- [ ] 2026-04-02 需求 3：後台設定截止時間，客戶端前後端雙驗證（需客製化 x_app_settings 資料表）
- [ ] 2026-04-02 需求 2：後台可管理商品↔供應商對應關係（product_supplierinfo CRUD UI）
- [ ] 2026-04-02 需求 1：移除出貨數量不可超過採購數量的驗證（AllocationPage）

---

## 實作設計

### 現況確認

| # | 需求 | 現況 |
|---|------|------|
| 1 | 出貨量可超採購量 | ✗ AllocationPage 行 85-99 有驗證，超量禁用按鈕 |
| 2 | 供應商↔品項後台可管理 | ✗ product_supplierinfo 只有讀取，無 CRUD UI |
| 3 | 截止時間設定 | ✗ 完全未實作 |
| 4 | 前台訂單選日期 | ✗ 無日期選擇，也無假日設定 |
| 5 | 後台編輯客戶訂單 + 稽核軌跡 | ✗ 無編輯功能，無稽核 |
| 6 | 前台顯示最近一次價格 | ✗ 完全沒顯示價格（Product 物件無 price 欄位） |
| 7 | 實價更新同步訂單 + 軌跡 | ✗ 未實作 |
| 8 | 發貨單顯示備註 | ✗ DeliveryPage + DeliverySlipPrint 備註欄空白 |
| 9 | 後台設定司機↔客戶關聯 | ✗ 現行無管理 UI，關聯邏輯散落在 refCache |

---

### 需要新開的客製化資料表

| 資料表 | 用途 | 主要欄位 |
|--------|------|---------|
| `x_app_settings` | 系統全域設定（截止時間等） | `key`, `value`, `updated_by`, `updated_at` |
| `x_holiday_settings` | 休假日設定（排除可選日期） | `date`, `label`, `created_by`, `created_at` |
| `x_order_audit_log` | 訂單編輯稽核軌跡 | `order_id`, `field`, `old_value`, `new_value`, `changed_by`, `changed_at`, `note` |
| `x_price_audit_log` | 實價更新軌跡 | `product_tmpl_id`, `old_price`, `new_price`, `updated_by`, `updated_at`, `batch_id` |
| `x_driver_customer` | 司機↔客戶固定關聯 | `driver_id`, `customer_id`, `created_by`, `created_at` |

> `product_supplierinfo` 是 Odoo 標準表，**已存在**，只需補 CRUD API 與 UI。
> `changed_by` / `updated_by` / `created_by` 現在存 user name string，預留為 user_id 待權限系統就緒後替換。

---

### 各需求 API 設計

#### 需求 1 — 移除出貨驗證
- 無需新 API
- 修改：`admin/src/pages/AllocationPage.tsx` 行 85-99，移除 `checkAllocationValid()` 限制

---

#### 需求 2 — 供應商↔品項管理

操作 Odoo 標準表 `product_supplierinfo`：

| 操作 | 方法 | 端點 | 參數 |
|------|------|------|------|
| 列出所有對應 | POST | `/proxy/product_supplierinfo/query` | `select_columns: ['id', 'product_tmpl_id', 'supplier_id']` |
| 新增對應 | POST | `/proxy/product_supplierinfo` | `{ product_tmpl_id, supplier_id }` |
| 刪除對應 | DELETE | `/proxy/product_supplierinfo/{id}` | — |

新增後台頁面：`admin/src/pages/SupplierMappingPage.tsx`
新增路由：`/supplier-mapping`

---

#### 需求 3 — 截止時間設定

操作客製化表 `x_app_settings`：

| 操作 | 方法 | 端點 | 參數 |
|------|------|------|------|
| 讀取截止時間 | POST | `/proxy/x_app_settings/query` | `filters: [{ column: 'key', op: 'eq', value: 'order_cutoff_time' }]` |
| 更新截止時間 | PATCH | `/proxy/x_app_settings/{id}` | `{ value: '22:00', updated_by, updated_at }` |

驗證層：
- **前端**：`ordering/src/pages/CartPage.tsx` 提交前比對目前時間與 cutoff
- **後端**：`ordering/backend/server.js` 建立訂單前再查一次 x_app_settings 驗證

新增後台設定入口：`admin/src/pages/SettingsPage.tsx`（或併入 DashboardPage）

---

#### 需求 4 — 前台日期選擇 + 休假日

操作客製化表 `x_holiday_settings`：

| 操作 | 方法 | 端點 | 參數 |
|------|------|------|------|
| 讀取未來假日 | POST | `/proxy/x_holiday_settings/query` | `filters: [{ column: 'date', op: 'ge', value: today }], limit: 60` |
| 新增假日 | POST | `/proxy/x_holiday_settings` | `{ date, label, created_by }` |
| 刪除假日 | DELETE | `/proxy/x_holiday_settings/{id}` | — |
| 批次匯入週一 | — | 前端 loop | UI 提供「匯入本月所有週一」按鈕，前端 loop 逐一 POST |

前台日期選擇規則（`ordering/src/pages/CartPage.tsx`）：
- 可選範圍：明天以後、30 日內
- 過濾掉 x_holiday_settings 中的日期
- sale_order_lines 的 `delivery_date` 欄位寫入所選日期

---

#### 需求 5 — 後台編輯訂單 + 稽核

操作 Odoo 標準表 + 客製化表 `x_order_audit_log`：

| 操作 | 方法 | 端點 | 參數 |
|------|------|------|------|
| 更新訂單明細數量 | PATCH | `/proxy/sale_order_lines/{id}` | `{ product_uom_qty }` |
| 寫入稽核紀錄 | POST | `/proxy/x_order_audit_log` | `{ order_id, field, old_value, new_value, changed_by, changed_at, note }` |
| 查詢稽核紀錄 | POST | `/proxy/x_order_audit_log/query` | `filters: [{ column: 'order_id', op: 'eq', value: id }]` |

修改：`admin/src/pages/OrdersPage.tsx` 加入行內編輯 + 稽核紀錄展開

---

#### 需求 6 + 7 — 價格顯示與實價更新

**需求 6**（待確認價格來源，見 ASK_HUMAN）：
- 暫定從 `product_templates.list_price` 取最新定價
- 修改：`ordering/src/api/client.ts` 的 `fetchProductTemplates()` 加入 `list_price` 欄位
- 修改：`ordering/src/pages/OrderPage.tsx` 商品卡片顯示價格

**需求 7**（待確認觸發入口，見 ASK_HUMAN）：

| 操作 | 方法 | 端點 | 參數 |
|------|------|------|------|
| 更新商品實價 | PATCH | `/proxy/product_templates/{id}` | `{ list_price: actualPrice }` |
| 批次同步訂單價格 | PATCH | `/proxy/sale_order_lines/{id}` | `{ price_unit: actualPrice }` （逐一） |
| 寫入價格稽核 | POST | `/proxy/x_price_audit_log` | `{ product_tmpl_id, old_price, new_price, updated_by, updated_at, batch_id }` |
| 查詢價格稽核 | POST | `/proxy/x_price_audit_log/query` | `filters: [{ column: 'product_tmpl_id', op: 'eq', value: id }]` |

`batch_id` 用時間戳產生，方便一次更新多品項時追蹤同一批次。

---

#### 需求 8 — 發貨單顯示備註

- 無需新 API，`sale_orders.note` 已有備註（JSON 格式，`text` 欄位）
- 修改：`admin/src/pages/DeliveryPage.tsx` 展開明細時顯示 `parseNote(order.note).text`
- 修改：`admin/src/templates/DeliverySlipPrint.tsx` 補上備註欄位內容

---

#### 需求 9 — 司機↔客戶關聯管理

操作客製化表 `x_driver_customer`：

| 操作 | 方法 | 端點 | 參數 |
|------|------|------|------|
| 列出所有關聯 | POST | `/proxy/x_driver_customer/query` | `select_columns: ['id', 'driver_id', 'customer_id']` |
| 新增關聯 | POST | `/proxy/x_driver_customer` | `{ driver_id, customer_id, created_by }` |
| 刪除關聯 | DELETE | `/proxy/x_driver_customer/{id}` | — |

新增後台頁面：`admin/src/pages/DriverMappingPage.tsx`
新增路由：`/driver-mapping`

---

### 函式清單

#### `admin/src/api/appSettings.ts`

| 函式 | 說明 |
|------|------|
| `getCutoffTime()` | 從 `x_app_settings` 撈 key=`order_cutoff_time`，回傳 `{ id, value }` 或 null |
| `updateCutoffTime(id, time, updatedBy)` | PATCH `x_app_settings/{id}`，寫入新時間與操作人 |

#### `admin/src/api/holidaySettings.ts`

| 函式 | 說明 |
|------|------|
| `getUpcomingHolidays(fromDate)` | 撈 `x_holiday_settings` 中 date >= fromDate 的假日，回傳 `Holiday[]` |
| `addHoliday(date, label, createdBy)` | 新增單筆假日 |
| `deleteHoliday(id)` | 刪除單筆假日 |
| `importMondaysOfMonth(year, month, createdBy)` | 計算該月所有週一，逐一呼叫 `addHoliday` |

#### `admin/src/api/supplierMapping.ts`

| 函式 | 說明 |
|------|------|
| `listSupplierMappings()` | 撈 `product_supplierinfo`，回傳含 id 的完整清單 `{ id, productTemplateId, supplierId }[]` |
| `addSupplierMapping(productTmplId, supplierId)` | POST 新增一筆對應 |
| `deleteSupplierMapping(id)` | DELETE 刪除一筆對應 |

#### `admin/src/api/orderAuditLog.ts`

| 函式 | 說明 |
|------|------|
| `writeOrderAuditLog(entry)` | POST 一筆稽核紀錄至 `x_order_audit_log` |
| `getOrderAuditLog(orderId)` | 查詢指定 orderId 的稽核紀錄，依 changed_at 降冪排列 |
| `updateOrderLineWithAudit(lineId, orderId, oldQty, newQty, changedBy)` | PATCH 訂單明細數量，並寫入稽核紀錄（兩步包成一個函式） |

#### `admin/src/api/priceAuditLog.ts`

| 函式 | 說明 |
|------|------|
| `updateProductPrice(productTmplId, newPrice, updatedBy)` | PATCH `product_templates/{id}` 寫入 list_price |
| `syncOrderLinePrices(productTmplId, newPrice, updatedBy)` | 查出所有含此品項的 sale_order_lines，逐一 PATCH price_unit，回傳 `{ updated, batchId }` |
| `writePriceAuditLog(entry)` | POST 一筆價格稽核紀錄至 `x_price_audit_log` |
| `getPriceAuditLog(productTmplId)` | 查詢指定品項的價格異動歷史 |

#### `admin/src/api/driverCustomer.ts`

| 函式 | 說明 |
|------|------|
| `getDriverCustomerMappings()` | 撈 `x_driver_customer` 全部關聯，回傳 `DriverCustomerMapping[]` |
| `addDriverCustomerMapping(driverId, customerId, createdBy)` | 新增一筆司機↔客戶關聯 |
| `deleteDriverCustomerMapping(id)` | 刪除一筆關聯 |
| `getCustomersByDriver(driverId, mappings)` | **純函式**：從 mappings 陣列過濾出指定司機的所有客戶 ID |

#### `admin/src/utils/orderValidation.ts`

| 函式 | 說明 |
|------|------|
| `isBeforeCutoff(cutoffTime, now?)` | **純函式**：比較目前時間是否在截止時間之前。`cutoffTime` 格式 `"HH:mm"`，`now` 預設 `new Date()` |

#### `admin/src/utils/dateSelection.ts`

| 函式 | 說明 |
|------|------|
| `getAvailableOrderDates(today, holidays)` | **純函式**：回傳從明天起 30 日內、排除 holidays 的可選日期陣列（`YYYY-MM-DD[]`） |
| `getMondaysOfMonth(year, month)` | **純函式**：回傳該月所有週一的日期陣列，供批次匯入假日使用 |

#### 修改既有檔案

| 檔案 | 修改內容 |
|------|---------|
| `admin/src/pages/AllocationPage.tsx` 行 85-99 | 移除 `checkAllocationValid()` 超量限制（需求 1） |
| `admin/src/pages/DeliveryPage.tsx` 明細展開區 | 顯示 `parseNote(order.note).text`（需求 8） |
| `admin/src/templates/DeliverySlipPrint.tsx` 備註欄 | 填入備註內容（需求 8） |

---

### 執行順序

| 優先 | 需求 | 理由 |
|------|------|------|
| 1 | 需求 1 | 最簡單，改一行前端邏輯 |
| 2 | 需求 8 | 純前端，改兩個元件 |
| 3 | 需求 9 | 需建表 + 新頁面，但邏輯獨立 |
| 4 | 需求 2 | 需補 CRUD UI，邏輯獨立 |
| 5 | 需求 3 | 需建表 + 前後端雙驗證 |
| 6 | 需求 4 | 需建表 + 前台日期元件（相依需求 3 的設定頁面） |
| 7 | 需求 6 | 待確認價格來源後再做 |
| 8 | 需求 5 | 需建表 + 編輯 UI |
| 9 | 需求 7 | 相依需求 6，最後處理 |

---

## 已完成

- [x] 2026-04-02 全面擴充 README，涵蓋系統架構、業務流程、頁面功能、API 與資料模型
      執行：重寫 README.md（63 行 → 291 行）
      驗證：git commit 2501140
