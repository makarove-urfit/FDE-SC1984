# ARCHITECTURE — 雄泉鮮食系統架構

> 這份文件是資料模型、API 介面、前端頁面三個層次的對應聖經。所有實作決策以此為準；實作偏離文件時應先更新文件再動手（遵守專案 `doc_before_impl` 規範）。
>
> **最高原則：盡可能走 AI GO / Odoo 原生表；擴充走 `custom_data` JSONB；若真需 custom table 則最小化並明列理由。**

---

## 總覽

雄泉鮮食是以 **AI GO Platform** 為基底的蔬果批發營運系統：

```
客戶端 (Ordering) ─ 下單 ─▶ sale_orders
                                │
            業主端 (Admin) ─ 確認 ─▶ 採購 ─▶ 出庫分配 ─▶ 出貨配送
                                │                           │
                                └─ 觸發 ─▶ stock_pickings (出貨單)
```

兩個 Custom App 共用同一個 tenant 的資料表：

| App | 對象 | Slug/URL |
|---|---|---|
| Ordering | 客戶 (C 端) | `ordering.apps.ai-go.app` |
| Admin | 業主／員工 (B 端) | `admin.apps.ai-go.app` |

兩 App 的前端程式碼透過 `scripts/deploy_*.py` 把 VFS 內容打包注入到 AI GO。`admin/src/` 是本機 Vite 開發預覽版本；**線上以 `scripts/pages.py` 注入的 VFS 為準**。

---

## 設計原則

1. **原生優先**：能用 Odoo/AI GO 既有表的欄位，絕不新建 custom table。
2. **擴充走 `custom_data` JSONB**：每個業務表都有 `custom_data` 欄位，用來放「1-1 延伸屬性」（如客戶的預設司機、tag 的負責人）。取代 `x_*_rel` 類型的 1-1 對應表。
3. **Audit 走原生 endpoint**：AI GO 內建 `audit_logs` + DB trigger，所有業務表的 INSERT/UPDATE/DELETE 自動記錄。前端透過 `GET /api/v1/audit` 查詢，不自建歷史表。
4. **保留的 custom table 必須在本文件明列理由**（目前僅 `x_holiday_settings` 尚未能完全下架，詳見 §0.11）。
5. **頁籤即 path**：tab 狀態由 URL path 驅動（`/admin/daily`、`/admin/settings`），子頁位於 tab path 底下（`/admin/settings/products`），可分享、可 bookmark、瀏覽器上下一頁可切換。
6. **出貨流程走 `stock_pickings`**：司機 = `stock_pickings.user_id`；不自建司機↔客戶對應表，以「客戶區域 tag + tag 的預設司機 (JSONB)」驅動 picking 自動帶司機。

---

## 0. 抽象實體與關聯

```
   Customer ──salesperson_id──▶ User ◀──user_id── Employee
      │                          ▲                   ├── department_id ─▶ Department (階層)
      ├─ contacts ─▶ CustomerContact                  ├── job_id ─▶ Job
      │                                               ├── category_ids ─▶ EmployeeCategory (多對多)
      └─ tag_rel ─▶ CustomerTag                       └── parent_id ─▶ (主管鏈)
                      │  custom_data.default_driver_id ─▶ User 的 UUID
                      │
                      └─ tag_prices ─▶ CustomerTagPrice ─▶ ProductProduct
                                         (某 tag 對某商品的專屬價；本專案暫不用)

   Supplier ─ supplier_contacts ─▶ SupplierContact
      │       custom_data.default_buyer_id ─▶ User 的 UUID
      └─ product_supplierinfo ─▶ ProductTemplate

   ProductTemplate ── categ_id ─▶ ProductCategory (階層，parent_id 自引用)
                                    custom_data.default_buyer_id ─▶ User 的 UUID

                            sale_id                    picking_id
   SaleOrder ─────────▶ StockPicking ◀─── StockMove ────────┐
      │ customer_id         │ customer_id                   │
      │ user_id (業務)       │ user_id (司機)                 │ sale_line_id
      ▼                     │ scheduled_date / date_done    ▼
   SaleOrderLine            │ batch_id                 (連回 SaleOrderLine)
      │ delivery_date       ▼
      ▼              StockPickingBatch (一車多單)
   ProductProduct

   AuditLog (對每張業務表自動記錄；走 /api/v1/audit)
   IrConfigParameter (系統 KV，如下單截止時間)
```

### 0.1 Customer（客戶）

- **性質**：有地址、統編、通聯方式；是公司 (`is_company=true`) 或個人；可被打多個 tag 區分族群；有一個主業務員。**獨立下單單位一律是 Customer**（含分店）。
- **關聯**：
  - 一個 **業務員** `salesperson_id → users.id`（原生欄位）
  - **預設司機**：透過客戶掛的區域 tag 取得（見 §0.3）
  - **下屬聯絡人（純地址點）** `customer_contacts.customer_id`（一對多）— 只是送貨/聯絡地址，**不能獨立下單**
  - **客戶等級** `level_id → customer_levels.id`（一對一，可選）
  - **多個區域/分類 tag** via `customer_tag_rel`（多對多）
- **`custom_data` 規格**（JSONB，Odoo 原生擴充位）：

  ```json
  {
    "kind": "independent" | "headquarters" | "branch",
    "parent_customer_id": "<uuid>",   // 只有 kind='branch' 才填，指向母公司 Customer
    "default_driver_id": "<user-uuid>" // 選填；覆蓋區域 tag 帶的預設司機
  }
  ```

  **為什麼分店要當 Customer 而不是 customer_contact**：
  - 分店要能獨立下單、獨立收帳、獨立追蹤出貨 → 必須是 Customer
  - `customer_contacts` 在 Odoo 是「聯絡人/地址點」，沒有自己的訂單流程、帳務流程
  - `customers` 本身**沒有原生 `parent_id`**（AI GO 的 view 拿掉了），所以母公司-分店關係只能走 `custom_data.parent_customer_id`
  - 代價：沒有 DB 層 FK 保證，應用層要自己驗證 parent 存在且屬同 tenant

- **CustomersPage 顯示**：依 `kind` 分組，樹狀展開（總公司展開看分店）；分店下單時自動把「帳單地址」(`customer_invoice_id`) 設為母公司（若有指定）

### 0.2 CustomerContact（客戶子聯絡人 / 分店地址）

- **性質**：隸屬於某個 Customer，供分店、多送貨地址、多聯絡人使用
- **關聯**：`customer_id → customers.id`
- **欄位**：`name`, `type`, `contact_address`, `phone`, `email`, `line_id`, `note`

### 0.3 CustomerTag（客戶標籤，兼作「區域」）

- **性質**：客戶的多維度分類（區域、VIP、特殊屬性）。**本專案用 tag 表達「配送區域」、「等級」、「自由屬性」三類。**
- **關聯**：
  - 多對多掛 customer（`customer_tag_rel`）
  - 可為某 tag 下的特定商品設定**專屬定價** `customer_tag_prices`（原生功能，本專案暫不用）
- **`custom_data` 規格**（JSONB）：

  ```json
  {
    "category": "region" | "level" | "attribute",  // 必填；tag 分類
    "single_select": true,                           // 建議 region/level=true，attribute=false
    "default_driver_id": "<user-uuid>"              // 僅 category='region' 有意義
  }
  ```

  | `category` | 意義 | `single_select` | 其他欄位 |
  |---|---|---|---|
  | `region` | 配送區域（北區 / 南區） | true | `default_driver_id` |
  | `level` | 客戶等級（VIP / 金 / 銀） | true | — |
  | `attribute` | 自由屬性（易碎 / 下午送 / 不接六日） | false | — |

- **`customer_tags` 本身沒有 `parent_id` 或 `category` 欄位**，這份分類純靠 JSONB + 應用層驗證。
- **換司機**：只改 tag.custom_data 一次，該區全部客戶下次出貨都帶新司機。
- **CustomerTagsPage** 依 `category` 分成三個分頁區塊顯示；客戶編輯頁挑 tag 時，`region` 與 `level` 強制單選、`attribute` 多選。

### 0.4 Supplier（供應商）

- **性質**：與 customer 概念對稱（都是 Odoo `res.partner` 的子 view），有地址、統編、status、supplier_type
- **關聯**：
  - 下屬聯絡人 `supplier_contacts.supplier_id`
  - 供應的產品 `product_supplierinfo`（多對多）
  - **custom_data 存預設採購員**：`{"default_buyer_id": "<user-uuid>"}`（無原生欄位）

### 0.5 Employee（員工）

- **性質**：公司內部人員（司機、業務、採購、行政等）
- **欄位重點**：`name`, `active`, `department_id`, `job_id`, `job_title`, `user_id` (對應到 users), `parent_id` (直屬主管), `category_ids` JSON (標籤陣列)
- **關聯**：
  - **對應 user** `user_id → users.id`（1-1，可空；不是所有員工都有系統帳號）
  - **部門** `department_id → hr_departments.id`（部門本身有 `parent_id` 巢狀）
  - **職位** `job_id → hr_jobs.id`
  - **多個 category**（多對多，透過 `category_ids` JSON 陣列）
  - **主管鏈** `parent_id` 自引用

### 0.6 EmployeeCategory（員工標籤）

- **性質**：多對多的員工屬性標籤（像司機、業務、採購），用於在 UI 上快速 filter 員工
- **欄位**：`name`, `color`（**扁平，無階層**；需要階層請用 department）
- **關聯**：透過 `hr_employees.category_ids` JSON 陣列

### 0.7 User（系統使用者）

- **性質**：AI GO 的系統登入帳號。**所有「誰做了某動作」都指向 User，不是 Employee。**
- **反向關聯**：
  - `hr_employees.user_id` → 對應員工資料（姓名、部門等顯示用）
  - `customers.salesperson_id` → 是哪些客戶的業務員
  - `sale_orders.user_id / maker_id / approver_id`
  - `stock_pickings.user_id` → 是哪些出貨單的操作員（= 司機）
  - `purchase_orders.user_id / maker_id / approver_id`
- **限制**：AI GO 沒暴露 `res_users` / `users` 表給 proxy，**前端只能透過 `hr_employees` 列出人員清單**，然後以 `hr_employees.user_id` 反查對應的 user UUID 來寫入上述欄位。

### 0.8 ProductTemplate / ProductProduct（產品）

- **ProductTemplate**：產品模板（品項定義）
  - 欄位：`name`, `default_code`, `sale_ok` (上架), `active` (啟用), `categ_id`, `list_price`, `standard_price`, `uom_id`
  - 關聯：`categ_id → product_categories.id`；供應商透過 `product_supplierinfo`
- **ProductProduct**：實際庫存單位（本專案暫時一對一對應 template）
  - 欄位：`id`, `product_tmpl_id`, `default_code`, `barcode`, `active`, `standard_price`, `lst_price`

### 0.9 ProductCategory（產品分類）

- **性質**：**有階層**（`parent_id` 自引用），每品項一個分類
- **本專案擴充**：`custom_data` 存**該分類的預設採購員**：`{"default_buyer_id": "<user-uuid>"}`
  - 下單 → 建立 purchase_orders 時依 line 的 product.categ_id 查此欄位帶入採購員

### 0.10 SaleOrder / SaleOrderLine（銷售訂單）

- **SaleOrder** 欄位重點：
  - `state`: draft / sent / sale / done / cancel
  - `date_order` **下單日**
  - `customer_id`, `customer_invoice_id`, `customer_shipping_id`
  - `user_id` **業務員**（下單時從 `customers.salesperson_id` 帶入）
  - `maker_id`, `approver_id`（製單、覆核）
  - `amount_untaxed`, `amount_tax`, `amount_total`
  - `note`, `client_order_ref`, `delivery_method`, `carrier_id`, `tracking_number`
- **SaleOrderLine** 欄位重點：
  - `product_id`, `product_template_id`, `product_uom_qty`, `price_unit`
  - **`delivery_date`** 預交貨日（**每 line 各自，支援同單分日出貨**）
  - `qty_delivered`（出貨量），`price_subtotal`, `sequence`

### 0.11 StockPicking / StockMove（出貨 / 移動）

- **StockPicking**（出貨單層級）
  - `picking_type_id → stock_picking_types`（code = `outgoing` 代表出貨，`incoming` 代表收貨）
  - `state`: draft / waiting / confirmed / assigned / done / cancel
  - **`scheduled_date`** 預排出貨日
  - **`date_done`** 實際完成日
  - `customer_id`, `supplier_id`
  - **`user_id`** = 司機（操作員）— **取代原設計的 `x_driver_customer`**
  - `sale_id → sale_orders.id`（反向回連訂單）
  - `batch_id → stock_picking_batches.id`（批次排車用）
- **StockMove**（出貨單裡的每個物件移動）
  - `picking_id → stock_pickings.id`
  - `product_id`, `product_uom_qty`, `quantity`
  - **`sale_line_id → sale_order_lines.id`**（回連訂單行，用來記「這個 line 的貨由這個 move 送」）

### 0.12 PurchaseOrder / PurchaseOrderLine（採購訂單）

- `supplier_id`, `state`, `date_order`, `amount_total`
- `user_id` **採購負責人**（建立時從 `suppliers.custom_data.default_buyer_id` 或 `product_categories.custom_data.default_buyer_id` 帶入）
- `maker_id`, `approver_id`

### 0.13 AuditLog（稽核記錄）

- **AI GO 原生**。每張業務表（含 sale_orders、sale_order_lines、product_products 等）INSERT/UPDATE/DELETE 都由 DB trigger 自動寫入
- 欄位：`tenant_id`, `actor_id → users.id`, `table_name`, `operation`, `record_id`, `old_data` JSONB, `new_data` JSONB
- **查詢走 `GET /api/v1/audit`**，不走 `/proxy/`

### 0.14 IrConfigParameter（系統設定）

- Odoo 原生 key-value 表
- 用於存「下單截止時間」等全站設定，**取代自建 `x_app_settings`**

### 0.15 Holiday（假日）

- **待定**。候選：
  - (A) `hr_leave_mandatory_days` — 原生「全公司強制休假」，語意最接近；需驗證副作用（會不會觸發 HR 請假流程）
  - (B) 保留 `x_holiday_settings` custom table（目前做法）
- 若 (A) 驗證後可用，則該 custom table 可下架。

---

## 1. 實體 ↔ 原生資料表對照

| 實體 | 主表 | 關聯表 | 狀態 |
|---|---|---|---|
| Customer | `customers` | `customer_contacts`, `customer_tag_rel`, `customer_levels` | 全原生 |
| CustomerTag（區域） | `customer_tags` | `customer_tag_rel`, `customer_tag_prices` | 全原生；default_driver_id 存 custom_data |
| Supplier | `suppliers` | `supplier_contacts`, `product_supplierinfo` | 全原生；default_buyer_id 存 custom_data |
| Employee | `hr_employees` | `hr_departments`, `hr_jobs`, `hr_employee_categories` | 全原生 |
| EmployeeCategory | `hr_employee_categories` | (透過 `hr_employees.category_ids` JSON) | 全原生 |
| User | `users` (**不暴露**) | 透過 `hr_employees.user_id` 反查 | 間接 |
| ProductTemplate | `product_templates` | `product_supplierinfo` | 全原生 |
| ProductProduct | `product_products` | — | 全原生 |
| ProductCategory | `product_categories` | — | 全原生；default_buyer_id 存 custom_data |
| SaleOrder | `sale_orders` | `sale_order_lines` | 全原生 |
| StockPicking | `stock_pickings` | `stock_moves`, `stock_picking_batches`, `stock_picking_types`, `delivery_carriers` | 全原生 |
| PurchaseOrder | `purchase_orders` | `purchase_order_lines` | 全原生 |
| AuditLog | `audit_logs`（專屬 API，不走 proxy） | — | 全原生 |
| 系統設定 | `ir_config_parameters` | — | 全原生 |
| 假日 | `hr_leave_mandatory_days` / `x_holiday_settings` | — | **待決定** |

### 1.1 `deploy_admin.py` `ensure_references` 需維護的表

目前已註冊：`sale_orders`, `sale_order_lines`, `customers`, `product_templates`, `suppliers`, `product_supplierinfo`, `purchase_orders`, `purchase_order_lines`, `stock_quants`, `product_products`, `hr_employees`, `stock_locations`, `uom_uom`, `product_categories`, `crm_tags`。

**需新增**：
- `customer_contacts`（客戶分店/子聯絡人）
- `customer_tags`, `customer_tag_rel`, `customer_tag_prices`（客戶標籤 / 區域）
- `customer_levels`（客戶等級）
- `hr_departments`, `hr_jobs`, `hr_employee_categories`（員工組織）
- `stock_pickings`, `stock_moves`, `stock_picking_types`, `stock_picking_batches`, `delivery_carriers`（出貨流程）
- `ir_config_parameters`（系統設定）
- （`hr_leave_mandatory_days` 若採方案 A 則加）

### 1.2 `product_templates` 權限應升級為

`["read", "create", "update"]`（目前只有 read+update，無法在 admin 新增商品）

### 1.3 Custom Table 清單

| Custom Table | 目前存在 | 保留理由 / 下架計畫 |
|---|---|---|
| `x_product_product_price_log` | ✅ | **下架**，改用 `/api/v1/audit?table_name=product_products` |
| `x_order_audit_log` | 📋 原規劃未實作 | **不需要**，改用 `/api/v1/audit?table_name=sale_orders` |
| `x_app_settings` | ✅ | **下架**，改用 `ir_config_parameters` |
| `x_holiday_settings` | ✅ | 暫保留；驗證 `hr_leave_mandatory_days` 能否取代 |
| `x_driver_customer` | ✅ | **下架**，改用 `customer_tags.custom_data.default_driver_id` + `stock_pickings.user_id` |
| `x_category_buyer` | ✅ | **下架**，改用 `product_categories.custom_data.default_buyer_id` |
| `x_supplier_buyer`（未建） | — | **不建**，改用 `suppliers.custom_data.default_buyer_id` |
| `x_employee_role`（未建） | — | **不建**，使用 `hr_employee_categories` + `category_ids` |

---

## 2. API 介面 與 操作資料表

本系統前端 API 分三層：

| 層 | 基底 | 認證 | 用途 |
|---|---|---|---|
| Proxy | `/api/v1/proxy/{app_id}/{table}` | Admin Bearer | Admin 頁面 CRUD 原生業務表 |
| Open Proxy | `/api/v1/open/proxy/{table}` | API Key | admin/src 本機開發預覽 |
| Ext Proxy | `/api/v1/ext/proxy/{table}` | Custom App User Bearer | Ordering 前端 |
| Custom Data | `/api/v1/data/objects/{uuid}/records` | Admin Bearer | Custom table (x_*)；**只接受 UUID，slug 會 500** |
| Audit | `/api/v1/audit` | Admin Bearer (`system.audit_log` 權限) | 稽核記錄查詢 |
| Server Action | `/api/v1/ext/actions/{slug}/{action}` | Custom App User Bearer | 後端 Python 動作 |

### 2.1 Customer

| 操作 | HTTP | 端點 | 資料表 |
|---|---|---|---|
| 列出客戶 | GET | `/proxy/{app}/customers` | `customers` |
| 建立客戶 | POST | `/proxy/{app}/customers` | `customers` |
| 更新客戶（含 salesperson_id、custom_data） | PATCH | `/proxy/{app}/customers/{id}` | `customers` |
| 列出某客戶的聯絡人 | POST | `/proxy/{app}/customer_contacts/query` filters: `customer_id eq X` | `customer_contacts` |
| 建立/更新/刪除聯絡人 | POST/PATCH/DELETE | `/proxy/{app}/customer_contacts[/id]` | `customer_contacts` |

### 2.2 CustomerTag（區域）

| 操作 | HTTP | 端點 | 資料表 |
|---|---|---|---|
| 列出 tag | GET | `/proxy/{app}/customer_tags` | `customer_tags` |
| 建立 tag | POST | `/proxy/{app}/customer_tags` | `customer_tags` |
| 指派 tag 的預設司機（寫 custom_data） | PATCH | `/proxy/{app}/customer_tags/{id}` body `{data: {custom_data: {default_driver_id: "..."}}}` | `customer_tags` |
| 客戶打 tag | POST | `/proxy/{app}/customer_tag_rel` body `{customer_id, tag_id}` | `customer_tag_rel` |
| 客戶拔 tag | DELETE | `/proxy/{app}/customer_tag_rel/{id}` | `customer_tag_rel` |

### 2.3 Supplier

| 操作 | HTTP | 端點 | 資料表 |
|---|---|---|---|
| 列出 / 建立 / 更新 | GET/POST/PATCH | `/proxy/{app}/suppliers[/id]` | `suppliers` |
| 指派預設採購員（custom_data） | PATCH | `/proxy/{app}/suppliers/{id}` | `suppliers` |
| 供應商的產品關聯 | POST/DELETE | `/proxy/{app}/product_supplierinfo[/id]` | `product_supplierinfo` |

### 2.4 Employee

| 操作 | HTTP | 端點 | 資料表 |
|---|---|---|---|
| 列出員工 | GET | `/proxy/{app}/hr_employees` | `hr_employees` |
| 更新員工（部門、職位、active、category_ids） | PATCH | `/proxy/{app}/hr_employees/{id}` | `hr_employees` |
| 列出員工標籤 | GET | `/proxy/{app}/hr_employee_categories` | `hr_employee_categories` |
| 部門樹 | GET | `/proxy/{app}/hr_departments` | `hr_departments` |
| 職位清單 | GET | `/proxy/{app}/hr_jobs` | `hr_jobs` |

> **User 資訊**：AI GO 沒暴露 `users` 表。要顯示員工的 user 名稱 / 取得業務員清單，用 `hr_employees` 列出 `{id, name, user_id}`，寫回 `salesperson_id` / `stock_pickings.user_id` 時填 `hr_employees.user_id` 的值。

### 2.5 Product

| 操作 | HTTP | 端點 | 資料表 |
|---|---|---|---|
| 列出產品 | POST query | `/proxy/{app}/product_templates/query` | `product_templates` |
| 新增產品 | POST | `/proxy/{app}/product_templates` | `product_templates`（**權限需補 create**） |
| 更新產品（含 categ_id、sale_ok 上下架） | PATCH | `/proxy/{app}/product_templates/{id}` | `product_templates` |
| 分類 CRUD | GET/POST/PATCH/DELETE | `/proxy/{app}/product_categories[/id]` | `product_categories` |
| 指派分類的預設採購員 | PATCH | `/proxy/{app}/product_categories/{id}` custom_data | `product_categories` |

### 2.6 Sale Order

| 操作 | HTTP | 端點 | 資料表 |
|---|---|---|---|
| 列出訂單（按日期、狀態） | POST query | `/proxy/{app}/sale_orders/query` | `sale_orders` |
| 建立訂單（Ordering 前端走 action） | action | `POST /ext/actions/{slug}/place_order` | `sale_orders`, `sale_order_lines` |
| 確認訂單 | PATCH | `/proxy/{app}/sale_orders/{id}` `{state: 'sale'}` | `sale_orders` |
| 訂單明細查詢 | POST query | `/proxy/{app}/sale_order_lines/query` | `sale_order_lines` |
| 更新 line 數量 / 價格 | PATCH | `/proxy/{app}/sale_order_lines/{id}` | `sale_order_lines` |

### 2.7 Stock Picking（出貨）

| 操作 | HTTP | 端點 | 資料表 |
|---|---|---|---|
| 列出某日出貨單 | POST query | `/proxy/{app}/stock_pickings/query` filters: `scheduled_date`, `state` | `stock_pickings` |
| 建立出貨單（確認訂單時） | POST | `/proxy/{app}/stock_pickings` | `stock_pickings` + `stock_moves` |
| 指派 / 改派司機 | PATCH | `/proxy/{app}/stock_pickings/{id}` `{user_id}` | `stock_pickings` |
| 完成出貨 | PATCH | `/proxy/{app}/stock_pickings/{id}` `{state:'done', date_done}` | `stock_pickings` |
| 批次排車 | POST | `/proxy/{app}/stock_picking_batches` | `stock_picking_batches` |
| 指派 picking 到 batch | PATCH | `/proxy/{app}/stock_pickings/{id}` `{batch_id}` | `stock_pickings` |

### 2.8 Purchase

| 操作 | HTTP | 端點 | 資料表 |
|---|---|---|---|
| 列出 / 建立採購單 | GET/POST | `/proxy/{app}/purchase_orders` | `purchase_orders` |
| 採購到貨（觸發 incoming picking） | PATCH | `/proxy/{app}/purchase_orders/{id}` `{state}` | `purchase_orders` + `stock_pickings (incoming)` |

### 2.9 Audit

| 操作 | HTTP | 端點 | 資料表 |
|---|---|---|---|
| 查某表的變更歷史 | GET | `/audit?table_name=sale_orders&start_date=...&limit=50` | `audit_logs`（系統內） |
| 查某記錄的變更 | GET | `/audit?table_name=product_products&record_id=...` | `audit_logs` |
| 查某 user 的動作 | GET | `/audit?actor_id=...` | `audit_logs` |

### 2.10 系統設定

| 操作 | HTTP | 端點 | 資料表 |
|---|---|---|---|
| 讀取截止時間 | POST query | `/proxy/{app}/ir_config_parameters/query` filters: `key eq 'sale.order_cutoff_time'` | `ir_config_parameters` |
| 更新截止時間 | PATCH / POST | `/proxy/{app}/ir_config_parameters[/id]` | `ir_config_parameters` |

### 2.11 Server-Side Actions（後端邏輯）

| Action | 觸發時機 | 操作 |
|---|---|---|
| `place_order` | Ordering 前端下單 | 建 `sale_orders` + `sale_order_lines`，寫 `user_id` (= 客戶的 salesperson_id) |
| `confirm_order` | Admin 確認訂單 | PATCH `sale_orders.state='sale'`；**自動建 stock_pickings**（outgoing 類型）；讀客戶區域 tag 的 custom_data 帶入 `user_id` (司機) |
| `complete_delivery` | 司機回報送達 | PATCH `stock_pickings.state='done'`, `date_done=now`；更新 `stock_moves.quantity` |
| `recalc_order_total` | 訂單行異動後 | 重算 `sale_orders.amount_total` |

---

## 3. 前端頁面 / 元件映射

目前有兩套前端：**`admin/src/`**（Vite 本機開發）與 **VFS**（`scripts/pages.py` 注入線上）。**新實作優先放 VFS**（那是實際上線版本），必要時再同步到 `admin/src`。

Admin 首頁路由架構：

```
/admin/daily                         每日流程（4 步驟 + 訂購清單 + 品項價格）
  /admin/daily/orders                  確認訂單（OrdersPage）
  /admin/daily/purchase                採購管理（PurchasePage）
  /admin/daily/allocation              出庫分配（AllocationPage）
  /admin/daily/delivery                出貨配送（DeliveryPage）★ 改為查 stock_pickings
  /admin/daily/purchase-list           訂購清單（PurchaseListPage）
  /admin/daily/price                   品項價格（PricePage）

/admin/settings                      基礎設定
  /admin/settings/customers            ★ 新增：客戶管理
  /admin/settings/customer-tags        ★ 新增：客戶標籤/區域管理（含預設司機）
  /admin/settings/products             產品管理（ProductsPage）
  /admin/settings/product-categories   產品分類管理（ProductCategoriesPage）
  /admin/settings/suppliers            ★ 新增：供應商管理（含預設採購員）
  /admin/settings/employees            ★ 新增：員工管理
  /admin/settings/system               系統設定（SettingsPage，假日 + 截止時間）

  /admin/settings/category-buyer       （下架：改到 ProductCategories 的編輯對話框）
  /admin/settings/driver-mapping       （下架：改到 CustomerTags 的編輯對話框）
  /admin/settings/supplier-mapping     （下架：併入供應商管理或產品管理的對話框）
```

### 3.1 實體 ↔ 頁面/元件 對應表

| 實體 | 頁面 | 狀態 | 主要操作 |
|---|---|---|---|
| **Customer** | `CustomersPage` (新) | ★ 待做 | 樹狀列表（按 `custom_data.kind` 把 branch 掛在 headquarters 下）、建立、編輯（含 salesperson_id、tag、parent_customer_id）、聯絡人子表 |
| **CustomerContact** | inline 在 `CustomersPage` 的客戶詳情 | ★ 待做 | 純聯絡人/送貨地址 CRUD（不含獨立下單流程） |
| **CustomerTag** | `CustomerTagsPage` (新) | ★ 待做 | 按 `custom_data.category` 分 region/level/attribute 三區顯示；region 類可設 `default_driver_id`；查看該 tag 的客戶清單 |
| **CustomerTagRel** | 併入 `CustomersPage` 編輯 | ★ 待做 | 打/拔 tag（region/level 強制單選、attribute 多選） |
| **Supplier** | `SuppliersPage` (新) | ★ 待做 | 列表、建立、編輯（含 default_buyer_id）；取代 `SupplierMappingPage` |
| **Employee** | `EmployeesPage` (新) | ★ 待做 | 列表、編輯 active/department/job/category_ids |
| **EmployeeCategory** | inline 在 `EmployeesPage` | ★ 待做 | 標籤指派 |
| **ProductTemplate** | `ProductsPage` | ✅ 已做 | 列表、上下架、改分類；**補：新增產品** |
| **ProductCategory** | `ProductCategoriesPage` | ✅ 已做 | CRUD；**補：編輯對話框寫 default_buyer_id（custom_data）** |
| **SaleOrder** | `OrdersPage` / `SalesOrdersPage` (VFS) | ✅ 已做 | 確認、編輯；**補：確認時自動建 stock_pickings** |
| **SaleOrderLine** | inline 在 `OrderEditPage` | ✅ 已做 | 數量、價格、delivery_date |
| **StockPicking** | `DeliveryPage` | 🔄 **需重構**：從查 sale_orders 改為查 stock_pickings | 列表某日出貨單、指派司機、標記完成 |
| **StockPickingBatch** | inline 在 `DeliveryPage`（「排車」按鈕） | ★ 待做 | 建 batch、指派 pickings |
| **PurchaseOrder** | `PurchasePage` / `ProcurementPage` (VFS) | ✅ 已做 | 採購管理；**補：建立時自動帶 default_buyer** |
| **AuditLog** | inline drawer 於任一頁（點「歷史」按鈕） | ★ 待做 | 呼叫 `/api/v1/audit` 顯示某記錄或某表的變更 |
| **IrConfigParameter** | `SettingsPage`（截止時間） | 🔄 改資料源從 `x_app_settings` → `ir_config_parameters` | 讀/寫截止時間 |
| **Holiday** | `SettingsPage`（假日管理） | 🔄 驗證後可能改資料源 | 假日列表、新增、刪除 |

### 3.2 元件重用 / 新增

**既有可重用**：
- `PageHeader`, `BackButton`（已依路徑決定返回 tab）
- `ConfirmDialog`, `SearchInput`, `Pagination`
- `LoadingCover`, `ToastContainer`
- `PrintProvider`（發貨單列印）

**需新增**：
- `UserPicker`（下拉選業務員/司機/採購員 — 列 `hr_employees` 並映射到 `user_id`）
- `TagSelector`（選 `customer_tags`，支援單選「區域類」+ 多選「屬性類」）
- `AuditTrailDrawer`（側邊欄顯示某記錄的 audit 歷史）
- `CustomDataEditor`（通用 JSONB 編輯，用於 customer/supplier/tag/category 的 custom_data）

### 3.3 被下架的頁面

| 下架頁面 | 原因 | 替代 |
|---|---|---|
| `CategoryBuyerPage` | 改用 `product_categories.custom_data.default_buyer_id` | 併入 `ProductCategoriesPage` 編輯對話框 |
| `DriverMappingPage` | 改用 `customer_tags.custom_data.default_driver_id` | 併入 `CustomerTagsPage` 編輯對話框 |
| `SupplierMappingPage` | 改用 `product_supplierinfo` 一對多 UI（商品配多供應商） | 併入 `ProductsPage` 編輯對話框或 `SuppliersPage` 的「供應產品」區塊 |

---

## 4. 遷移計畫（大框架）

本節記錄下架 custom table 的順序與注意事項，細節執行時另開 AGENT_PLAN 條目。

### Phase 1 — 基礎建設
1. `deploy_admin.py`：`ensure_references` 補上 customer_contacts、customer_tags、customer_tag_rel、hr_departments、hr_jobs、hr_employee_categories、stock_pickings、stock_moves、ir_config_parameters 等表；`product_templates` permission 加 `create`
2. 部署驗證新表可讀寫
3. `custom_data` 欄位（各業務表已內建）寫入/讀取走 `db.update(table, id, {custom_data: {...}})`

### Phase 2 — 基礎設定頁面
1. `CustomersPage` / `CustomerTagsPage`
2. `EmployeesPage`（含 category 指派）
3. `SuppliersPage`
4. 以新頁面取代 `CategoryBuyerPage` / `DriverMappingPage` / `SupplierMappingPage`（保留路由重導，避免舊 bookmark 404）

### Phase 3 — 訂單/出貨流程升級
1. `confirm_order` action：建立 stock_pickings，從 customer 區域 tag 帶 default_driver
2. `DeliveryPage` 改查 stock_pickings
3. 驗證 audit_logs 取代 `x_order_audit_log`、`x_product_product_price_log`

### Phase 4 — 系統設定遷移
1. `SettingsPage` 截止時間改用 `ir_config_parameters`；舊 `x_app_settings` 資料搬遷
2. 驗證 `hr_leave_mandatory_days` 是否可取代 `x_holiday_settings`（評估副作用）
3. 資料驗證通過後，AI GO 後台刪除不再使用的 custom table

---

## 5. 對應到既有 README 的差異

本文件為正式架構定義；`README.md` 保留部署指南與快速上手。兩者矛盾時以本文件為準。

主要差異：
- **x_ custom table 的設計方向**：本文件明列下架路徑，`README.md` 原文應在 Phase 4 完成後同步更新
- **DeliveryPage 資料源**：原為 sale_orders；目標為 stock_pickings
- **驅動司機來源**：原為 `x_driver_customer`；目標為 `customer_tags.custom_data.default_driver_id`
