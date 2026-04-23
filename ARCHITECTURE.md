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
4. **保留的 custom table 必須在本文件明列理由**（目標：0 張；所有既有 x_* 皆有下架計畫，見 §1.2）。
5. **頁籤即 path**：tab 狀態由 URL path 驅動（`/admin/daily`、`/admin/settings`），子頁位於 tab path 底下（`/admin/settings/products`），可分享、可 bookmark、瀏覽器上下一頁可切換。
6. **出貨流程走 `stock_pickings`**：司機 = `stock_pickings.user_id`；不自建司機↔客戶對應表，以「客戶區域 tag + tag 的預設司機 (JSONB)」驅動 picking 自動帶司機。
7. **採購員歸屬走兩層 SSOT 鏈**：`品項.custom_data.default_supplier_id` → `supplier.custom_data.default_buyer_id`。分類 (`product_categories`) 不承載採購員資訊。
8. **兩 App refs 白名單完全獨立**：Ordering App 與 Admin App 各自維護自己的 `refs`（AI GO 是 app 層級權限），**不共用**。Ordering 只註冊客戶端需要的表（且多為 read），Admin 註冊業主端所有業務表（含 suppliers/purchase/stock）。想把 customers 給 Admin 寫，只影響 Admin refs；不會讓 Ordering 也能寫。
9. **所有涉及「特定當事人」的 CRUD（Ordering 與 Admin 兩端皆然）全部走 Action**：AI GO 的 refs 只有 table/column 級白名單，**沒有 row-level security**。Ordering 給 `sale_orders` read 權限，客戶 A 就能偷看 B 的訂單；Admin 給業務 A `customers` read，A 就能看業務 B 負責的客戶 / 採購員 B 負責的供應商 / 其他司機的出貨單。為此：
   - **寫入（create / update / delete）一律走 Server Action**，由 Action 驗證 `ctx.user` 的身分與授權範圍再下手
   - **讀取「依身分過濾」的資料**（我的訂單 / 我客戶的資料 / 我的出貨單）也走 Action
   - **純公開資料**（商品定義 / 分類 / 單位 / 區域 tag 定義 / 員工基本清單）才保留 refs read，避免每個 UI 動作都要 round-trip 到 Action
   - 跨當事人隔離規則見 §2.12（Ordering = 跨公司；Admin = 跨業務員 / 跨團隊 / 跨角色）

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
      │       custom_data.default_buyer_id ─▶ User（採購員 SSOT）
      └─ product_supplierinfo ─▶ ProductTemplate (多對多；備援/多供應商)

   ProductTemplate ── categ_id ─▶ ProductCategory (階層，parent_id 自引用；純分類)
          │
          └─ custom_data.default_supplier_id ─▶ Supplier（主供應商 SSOT）
             採購鏈：品項 → 主供應商 → 採購員

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

### 0.2 CustomerContact（客戶聯絡人 / 送貨地址）

- **性質**：隸屬於某個 Customer 的**聯絡人或送貨地址**（**不是分店** — 分店當獨立 Customer，見 §0.1）
- **關聯**：`customer_id → customers.id`
- **欄位語意**：

  | 欄位 | 用途 |
  |---|---|
  | `name` | 聯絡人姓名 |
  | `type` | **Odoo 地址類型**（`contact` / `delivery` / `invoice` / `other`）— 下單時決定帶哪個地址進 `sale_orders.customer_shipping_id` / `customer_invoice_id`，**絕對不可挪用為角色欄位** |
  | `contact_address`, `phone`, `email`, `line_id` | 通訊資料 |
  | `note` | 自由備註 |

- **`custom_data` 規格**（JSONB）：

  ```json
  {
    "role": "store_manager" | "buyer" | "accountant" | "boss" | "other",
    "role_label": "店長"   // 顯示用中文，允許自由填
  }
  ```

- **一個人同時是聯絡人又是送貨地址**（如店長本身就是送貨對接人）有兩種建法：
  - (A) 拆兩筆 — `type='contact'` 記店長身份；`type='delivery'` 另記送貨地址
  - (B) 合一筆 — `type='delivery'` 並填 `name` 與 `custom_data.role='store_manager'`

  (B) 省事且夠用，(A) 更符合 Odoo 設計哲學。本專案採 (B)。

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
- **`custom_data` 規格**（JSONB）：

  ```json
  {
    "default_buyer_id": "<user-uuid>"   // 此供應商的預設採購員
  }
  ```

- **「採購員」SSOT**：`suppliers.custom_data.default_buyer_id` 是**採購員歸屬的唯一來源**。建採購單時依 `purchase_orders.supplier_id` 反查本欄位帶入 `user_id`（見 §2.11 `create_purchase_order`）。

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
  - `sale_orders.maker_id / approver_id`（製單、覆核；**`user_id` 本專案不用，業績改走 customers.salesperson_id**，見 §0.10）
  - `stock_pickings.user_id` → 是哪些出貨單的操作員（= 司機）
  - `purchase_orders.user_id / maker_id / approver_id`
- **限制**：AI GO 沒暴露 `res_users` / `users` 表給 proxy，**前端只能透過 `hr_employees` 列出人員清單**，然後以 `hr_employees.user_id` 反查對應的 user UUID 來寫入上述欄位。

### 0.8 ProductTemplate / ProductProduct（產品）

- **ProductTemplate**：產品模板（品項定義）
  - 欄位：`name`, `default_code`, `sale_ok` (上架), `active` (啟用), `categ_id`, `list_price`, `standard_price`, `uom_id`
  - 關聯：`categ_id → product_categories.id`；供應商透過 `product_supplierinfo`（多對多，允許多個供應商）
  - **`custom_data` 規格**：

    ```json
    {
      "default_supplier_id": "<supplier-uuid>"   // 此品項的主要供應商
    }
    ```

  - **「主要供應商」SSOT**：`product_templates.custom_data.default_supplier_id` 是**品項 → 供應商**的唯一來源。UI 上 `product_supplierinfo` 可掛多個供應商（備援），但**預設走哪家由這個欄位決定**。
  - 採購鏈：`品項 → 主供應商（default_supplier_id）→ 採購員（supplier.custom_data.default_buyer_id）`
- **ProductProduct**：實際庫存單位（本專案暫時一對一對應 template）
  - 欄位：`id`, `product_tmpl_id`, `default_code`, `barcode`, `active`, `standard_price`, `lst_price`

### 0.9 ProductCategory（產品分類）

- **性質**：**有階層**（`parent_id` 自引用），每品項一個分類
- **用途**：純粹的貨品分類（葉菜類 / 根莖類 / 瓜果類），用於陳列、搜尋、報表
- **不存採購員資訊** — 採購員歸屬走 `品項 → 供應商 → 採購員` 鏈（§0.4 + §0.8），不用分類做為來源。

### 0.10 SaleOrder / SaleOrderLine（銷售訂單）

- **SaleOrder** 欄位重點：
  - `state`: draft / sent / sale / done / cancel
  - `date_order` **下單日**
  - `customer_id`, `customer_invoice_id`, `customer_shipping_id`
  - `maker_id`, `approver_id`（製單、覆核）
  - `amount_untaxed`, `amount_tax`, `amount_total`
  - `note`, `client_order_ref`, `delivery_method`, `carrier_id`, `tracking_number`
- **業績歸屬規則（重要）**：
  - 業績一律 **JOIN `customers.salesperson_id`** — 以**客戶的主業務員**結算
  - `sale_orders.user_id` **本專案不寫入、不用於業績**（Odoo 原生欄位仍存在，建單時留空）
  - **理由**：業務員跑客戶是長期關係；避免「B 幫 A 代接電話下單」變成 B 搶業績
  - `place_order` action 不寫 `user_id`；業績報表寫成 `SUM(sale_orders.amount_total) GROUP BY customers.salesperson_id`
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
- `user_id` **採購負責人**（建立時從 `suppliers.custom_data.default_buyer_id` 帶入 — 見 §2.11 `create_purchase_order`）
- `maker_id`, `approver_id`

### 0.13 AuditLog（稽核記錄）

- **AI GO 原生**。每張業務表（含 sale_orders、sale_order_lines、product_products 等）INSERT/UPDATE/DELETE 都由 DB trigger 自動寫入
- 欄位：`tenant_id`, `actor_id → users.id`, `table_name`, `operation`, `record_id`, `old_data` JSONB, `new_data` JSONB
- **查詢走 `GET /api/v1/audit`**，不走 `/proxy/`

### 0.14 IrConfigParameter（系統設定）

- Odoo 原生 key-value 表
- 用於存「下單截止時間」等全站設定，**取代自建 `x_app_settings`**

### 0.15 Holiday（假日 / 不配送日）

- **定案：使用 `hr_leave_mandatory_days`**（Odoo `hr.leave.mandatory.day` 原生「全公司強制休假」）
- **欄位**：
  - `name` VARCHAR — 名稱（「中秋連假」、「颱風天」、「週一公休」）
  - `start_date` DATE — 開始日
  - `end_date` DATE — 結束日（與 start 同天代表單日）
  - `color` INTEGER — 顯示色
  - `custom_data` JSONB
- **優於舊 `x_holiday_settings` 之處**：支援**日期區間**（連假一筆而非三筆）
- **副作用風險**：此表原設計用於 HR 請假模組，若未來啟用 hr_leaves 流程可能觸發員工強制請假記錄；**本專案不啟用 HR 模組，故無影響**（若後續規劃啟用，需重新評估）
- **Ordering 端用法**：`deploy_ordering.py` 拉 `hr_leave_mandatory_days`，展開 `[start_date..end_date]` 為日期陣列 embed 為 `holiday_data.json`；配送日期選擇器排除這些日期
- **Admin 端用法**：`SettingsPage` 以日期區間形式編輯（start/end picker），而非單日逐筆建立

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
| ProductTemplate | `product_templates` | `product_supplierinfo`（備援多供應商） | 全原生；default_supplier_id 存 custom_data |
| ProductProduct | `product_products` | — | 全原生 |
| ProductCategory | `product_categories` | — | 全原生（純分類，不存採購員） |
| SaleOrder | `sale_orders` | `sale_order_lines` | 全原生 |
| StockPicking | `stock_pickings` | `stock_moves`, `stock_picking_batches`, `stock_picking_types`, `delivery_carriers` | 全原生 |
| PurchaseOrder | `purchase_orders` | `purchase_order_lines` | 全原生 |
| AuditLog | `audit_logs`（專屬 API，不走 proxy） | — | 全原生 |
| 系統設定 | `ir_config_parameters` | — | 全原生 |
| 假日 | `hr_leave_mandatory_days` | — | 全原生（支援日期區間；本專案不啟用 HR 模組無副作用） |

### 1.1 refs 白名單（兩 app 各自獨立）

兩個 Custom App 各自在 deploy script 裡呼叫 `ensure_references` 維護自己的白名單。**refs 只給「純公開、不需身分過濾」的讀取**；所有寫入 + 需身分過濾的讀取一律走 Action（見 §2.11 + §2.12）。

#### 1.1.a Admin App (`deploy_admin.py`)

所有 Admin 業務表的寫入都走 Action。refs 只保留**通用讀取**以避免每個 UI 動作都 round-trip：

| 表 | permissions | 用途 |
|---|---|---|
| `product_templates` | read | 商品列表（若有 SKU-level 限制才改 action） |
| `product_products` | read | 商品 variants 顯示 |
| `product_categories` | read | 分類導航 |
| `uom_uom` | read | 單位 |
| `hr_departments` ★ | read | 部門清單（組織圖） |
| `hr_jobs` ★ | read | 職位清單 |
| `hr_employee_categories` ★ | read | 員工角色清單 |
| `customer_tags` ★ | read | 區域 / 等級 / 屬性 tag 定義 |
| `delivery_carriers` ★ | read | 承運商清單 |
| `stock_picking_types` ★ | read | 出貨類型 |
| `stock_locations` | read | 倉庫位置清單 |
| `crm_tags` | read | 商機標籤（保留） |

**以下全部改走 Action**（refs 不給寫權限、有身分過濾的讀取也不給）：

| 表 | 改走 Action 原因 |
|---|---|
| `customers` | 業務 A 只能看自己的客戶；業務主管能看整組 |
| `customer_contacts` | 附屬於客戶，同上 |
| `customer_tag_rel` | 客戶打 tag 權限跟隨客戶 |
| `sale_orders` / `sale_order_lines` | 業務看自己客戶的單；採購看不到銷售單 |
| `suppliers` / `supplier_contacts` | 採購員只能看自己供應商 |
| `product_supplierinfo` | 附屬於供應商 |
| `purchase_orders` / `purchase_order_lines` | 採購員看自己、主管看全組 |
| `stock_pickings` / `stock_moves` / `stock_picking_batches` | 司機只能看自己被派的出貨單 |
| `stock_quants` | 倉管人員才能異動庫存 |
| `hr_employees` | 改員工資料限主管；員工基本清單（名字+部門）另走專用 `list_employees` action |
| `customer_levels` | 客戶等級可能影響定價，限管理階層 |
| `customer_tag_prices` | 分級定價限管理階層 |
| `hr_leave_mandatory_days` | 假日設定限管理階層 |
| `ir_config_parameters` | 系統設定限管理階層 |

★ = 尚未註冊，Phase 1 需補

#### 1.1.b Ordering App (`deploy_ordering.py`)

| 表 | permissions | 用途 |
|---|---|---|
| `product_templates` | read | 商品列表（公開） |
| `product_products` | read | 商品 variants（公開） |
| `product_categories` | read | 商品分類（公開） |
| `customer_tags` ★ | read | 區域 tag 定義（公開） |
| `uom_uom` | read | 單位 |
| `crm_tags` | read | 既有保留 |

**以下全部改走 Action**：`customers`, `customer_contacts`, `customer_tag_rel`, `customer_tag_prices`, `customer_levels`, `sale_orders`, `sale_order_lines` — 皆涉及「哪個客戶」的過濾。

**絕不應有** `suppliers`, `purchase_*`, `stock_*`, `hr_*`, `ir_config_parameters` — 客戶端完全不該碰這些。

**假日** 由 `deploy_ordering.py` 以 admin token 另從 `hr_leave_mandatory_days` 拉取，展開為 `holiday_data.json` 靜態 embed，**不暴露為 Ordering 查詢**（維持「客戶端只能間接取得非敏感資料」原則）。

### 1.2 Custom Table 清單

| Custom Table | 目前存在 | 保留理由 / 下架計畫 |
|---|---|---|
| `x_product_product_price_log` | ✅ | **下架**，改用 `/api/v1/audit?table_name=product_products` |
| `x_order_audit_log` | 📋 原規劃未實作 | **不需要**，改用 `/api/v1/audit?table_name=sale_orders` |
| `x_app_settings` | ✅ | **下架**，改用 `ir_config_parameters` |
| `x_holiday_settings` | ✅ | **下架**，改用 `hr_leave_mandatory_days`（原生支援日期區間；無副作用，因本專案不啟用 HR 請假流程） |
| `x_driver_customer` | ✅ | **下架**，改用 `customer_tags.custom_data.default_driver_id` + `stock_pickings.user_id` |
| `x_category_buyer` | ✅ | **下架**，採購員改走 `品項 → 主供應商 → supplier.custom_data.default_buyer_id` 鏈（§0.4 + §0.8），與分類脫鉤 |
| `x_supplier_buyer`（未建） | — | **不建**，改用 `suppliers.custom_data.default_buyer_id`（SSOT） |
| `x_employee_role`（未建） | — | **不建**，使用 `hr_employee_categories` + `category_ids` |

---

## 2. API 介面 與 操作資料表

本系統前端 API 分幾層。**每個 app 只能用到「自己 refs 白名單」內的表**（見 §1.1）：

| 層 | 基底 | 認證 | 誰會用 | refs 檢查 |
|---|---|---|---|---|
| Proxy | `/api/v1/proxy/{app_id}/{table}` | Admin Bearer | Admin 前端 CRUD | 受 `refs/apps/{app_id}` 白名單約束 |
| Open Proxy | `/api/v1/open/proxy/{table}` | API Key | admin/src 本機開發預覽 | 同上 |
| Ext Proxy | `/api/v1/ext/proxy/{table}` | Custom App User Bearer | **Ordering 前端** | 受 Ordering app 的 refs 白名單約束（因此 Ordering 絕看不到 suppliers/purchase/stock） |
| Custom Data | `/api/v1/data/objects/{uuid}/records` | Admin Bearer | Admin 前端（**只接受 UUID，slug 會 500**） | 由 `data/objects` 的 app_id 決定歸屬 |
| Audit | `/api/v1/audit` | Admin Bearer (`system.audit_log` 權限) | Admin 稽核頁面 | tenant 範圍；不跨 app |
| Server Action | `/api/v1/ext/actions/{slug}/{action}` | Custom App User Bearer | Ordering 或 Admin 對應 action | Action 內部用 `ctx.db`，**不受 refs 限制**（完整 DB 權限） |

> ⚠️ **§2.1–§2.10 的 proxy 操作表格是「欄位層級參考」**。依原則 §9，**所有寫入 + 需身分過濾的讀取實際上都走 Action 包一層**（見 §2.11）。下列表格保留是為了讓 Action 實作者知道底層要動哪些欄位，不代表前端可以直接打 proxy。

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
| 指派主供應商（custom_data.default_supplier_id） | PATCH | `/proxy/{app}/product_templates/{id}` custom_data | `product_templates` |
| 分類 CRUD | GET/POST/PATCH/DELETE | `/proxy/{app}/product_categories[/id]` | `product_categories` |

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

### 2.11 後端邏輯落腳點

本專案的「後端邏輯」分兩個落腳點：

#### (A) AI GO Server Actions — 主要業務邏輯

Python 腳本，跑在 AI GO 平台沙盒。**不是我們自己架的 server**。限制：

- 30 秒 timeout、256 MB 記憶體
- 白名單模組：`json`, `math`, `re`, `datetime`, `httpx` 等
- 有完整 DB 寫入權限（`ctx.db`），**不受 refs 限制**
- 繼承 App User 認證（`ctx.user`）
- 呼叫端點：Ordering `POST /ext/actions/{slug}/{action}`；Admin 同理

所有業務流程 action 都落在這裡（下列）。

#### (B) `ordering/backend/server.js` — LINE Login OAuth Bridge

**唯一自己架的後端**，只處理 LINE Login 的 OAuth token exchange：

- 接前端傳來的 LINE `authorization code`
- 以 `LINE_CHANNEL_SECRET`（不能放前端！）向 LINE API 交換 `access_token + id_token`
- 驗證 id_token 後，用其資訊去 AI GO `custom-app-auth` 註冊/登入
- 回傳 AI GO 的 JWT 給前端

**為什麼不能走 Action**：OAuth redirect flow 需要**穩定的 HTTPS callback URL** 供 LINE 平台 redirect 回來、並持有 Channel Secret 做 server-to-server token exchange；AI GO Action 走 `/ext/actions/{slug}/{name}`，URL 不適合當 OAuth callback（而且需要 Custom App User Token 才能叫，但登入前還沒有 token）。這是 OAuth 第三方登入的結構性需求，幾乎不可避免要有個自家的薄 server。

**未來可能的搬遷**：若 AI GO 推出「公開 OAuth callback endpoint」或「pre-auth webhook」，這 447 行可以完全拿掉。目前保留。

#### Actions 清單（完整）

命名慣例：`{scope}_{verb}_{resource}`，scope 為 `my`（Ordering 客戶自身）/ `list`（Admin 依身分過濾清單）/ `update` / `create` / `delete`。

**Ordering 端 Actions**（endpoint: `/ext/actions/ordering/{name}`）

| Action | 讀寫 | 操作 |
|---|---|---|
| `my_profile_get` | R | 回傳 `ctx.user` 對應的 customer 資料（含分店結構） |
| `my_profile_update` | W | 更新 customer 可改欄位（phone / email / contact_address），禁改 salesperson_id / level_id / custom_data.kind |
| `my_contacts_list` | R | 回傳 `customer_contacts where customer_id in (自己 + 同集團分店)` |
| `my_contacts_crud` | W | 新增/改/刪自己的聯絡人 |
| `my_tags_list` | R | 自己掛的 tag |
| `my_orders_list` | R | 自己及同集團分店的 `sale_orders`（支援 state / date range filter） |
| `my_order_detail` | R | 單張訂單詳情（驗 customer 屬於同集團） |
| `place_order` | W | 建 `sale_orders`（**不寫 `user_id`**）+ `sale_order_lines`；後端二次驗證截止時間、商品 sale_ok、customer_id 屬於 ctx.user |
| `cancel_my_order` | W | 取消自己的 draft 訂單（已 confirm 者不可取消，提示聯絡業務） |

**Admin 端 Actions**（endpoint: `/ext/actions/admin/{name}`）

| Action | 讀寫 | 操作 |
|---|---|---|
| `list_customers_for_me` | R | 業務看自己 salesperson；主管看整團；管理階層看全部 |
| `customer_crud` | W | 建/改/刪 customer + custom_data（kind / parent_customer_id / default_driver_id） |
| `customer_contacts_crud` | W | 聯絡人 CRUD |
| `customer_tags_crud` | W | 區域/等級/屬性 tag CRUD（含 default_driver_id） |
| `customer_tag_rel_crud` | W | 客戶打/拔 tag |
| `list_suppliers_for_me` | R | 採購員看自己負責供應商；管理階層看全部 |
| `supplier_crud` | W | 供應商 CRUD + default_buyer_id |
| `supplier_contacts_crud` | W | |
| `product_supplierinfo_crud` | W | 商品↔供應商備援多供應商 |
| `product_crud` | W | 商品 CRUD + custom_data.default_supplier_id + 上下架 |
| `product_category_crud` | W | 分類 CRUD |
| `list_employees` | R | 列員工清單（基本欄位：name / department / category），全員可用；改員工走下面 |
| `employee_crud` | W | 管理階層改員工（active / department / job / category_ids） |
| `list_orders_for_me` | R | 業務看負責客戶的訂單；主管看整團 |
| `confirm_order` | W | PATCH `sale_orders.state='sale'`；**自動建 stock_pickings**（outgoing）；讀客戶區域 tag custom_data 帶入司機 |
| `cancel_order` | W | 取消訂單（後端記 audit） |
| `update_order_line` | W | 改訂單明細數量/價格（業務限自己客戶，主管全部） |
| `recalc_order_total` | W | 重算 `sale_orders.amount_total`（訂單行異動後內部呼叫） |
| `list_pickings_for_me` | R | 司機看自己派送；排車員看全部；業務看自己客戶的 |
| `assign_picking_driver` | W | 排車員改派司機 |
| `create_picking_batch` | W | 建排車批次並 assign 多 picking |
| `complete_delivery` | W | PATCH `stock_pickings.state='done'`, `date_done=now`；更新 `stock_moves.quantity`（司機限自己的 picking） |
| `list_purchase_orders_for_me` | R | 採購員看自己供應商的採購單 |
| `create_purchase_order` | W | 依 line.product → template.default_supplier 分組建 PO；`user_id = supplier.default_buyer_id` |
| `update_purchase_received` | W | 採購到貨，觸發 incoming picking 並寫 stock_quants |
| `system_config_get` / `system_config_set` | RW | `ir_config_parameters` 讀寫（限管理階層） |
| `holiday_crud` | W | `hr_leave_mandatory_days` CRUD（限管理階層） |

**自家後端（非 Action）**：

| 名稱 | 落腳點 | 用途 |
|---|---|---|
| `line_login_bridge` | `ordering/backend/server.js` | LINE OAuth code → AI GO JWT（見 §2.11 (B)） |

---

### 2.12 跨當事人資料隔離規則

**每個 Action 必須在下手前呼叫 `assert_can_access(ctx, target)` helper**。helper 內做以下判斷：

#### Ordering 端（客戶對客戶）

- **自己**：`ctx.user` 對應的 customer（由 `custom_app_users → customer_custom_app_user_rel → customers` 找到）
- **同集團**：兩個 customer 的「集團頂點」相同才可互看
  - 集團頂點 = `customer.custom_data.parent_customer_id` 若存在，否則 = `customer.id` 自己
  - 白話：`kind=branch` 的分店看得到同 `parent_customer_id` 的其他分店與總公司；`kind=independent` 只看自己
- **拒絕**：其他所有情況

```python
def customer_group_head(customer):
    return customer.custom_data.get('parent_customer_id') or customer.id

def can_see_customer(viewer, target):
    return customer_group_head(viewer) == customer_group_head(target)
```

#### Admin 端（員工對資料）

授權依**員工 role（透過 `hr_employees.category_ids` 掛 `hr_employee_categories`）**：

| role | 可看範圍 |
|---|---|
| `salesperson` | 自己（customers.salesperson_id = ctx.user.id） + 主管同團下屬 |
| `sales_manager` | 整個業務團隊（透過 `crm_teams` / `crm_team_members` 或 hr_departments parent） |
| `buyer` | 自己負責的 supplier（supplier.custom_data.default_buyer_id = ctx.user.id） |
| `driver` | 自己派送的 stock_pickings（user_id = ctx.user.id） |
| `picker` / `warehouse` | 所有 stock_pickings 未指派司機者 + 自己派送中 |
| `admin` | 全部 |

**角色對應表存在哪**：此對照表寫在 Action 程式碼（`actions/_permissions.py`）中維護，不建 DB 表 — 因為 role 名稱與對應範圍是程式邏輯不是業務資料。

**「主管同團下屬」的解析**：優先 `crm_teams` + `crm_team_members`（若有建）；fallback 到 `hr_departments.parent_id` 樹狀向下。

#### 未授權時行為

- Action 直接回 `ctx.response.error("無權限存取此資料", status=403)`
- 不可揭露資料存在性（即不可區分「不存在」與「存在但沒權限」）
- 所有 403 被 `audit_logs.action='unauthorized_attempt'` 記錄（已由 AI GO trigger 自動處理 INSERT；Action 層需額外寫失敗記錄）

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
| **ProductTemplate** | `ProductsPage` | ✅ 已做 | 列表、上下架、改分類；**補：新增產品、設主供應商 `default_supplier_id`（custom_data）** |
| **ProductCategory** | `ProductCategoriesPage` | ✅ 已做 | CRUD（純分類，不碰採購員） |
| **SaleOrder** | `OrdersPage` / `SalesOrdersPage` (VFS) | ✅ 已做 | 確認、編輯；**補：確認時自動建 stock_pickings** |
| **SaleOrderLine** | inline 在 `OrderEditPage` | ✅ 已做 | 數量、價格、delivery_date |
| **StockPicking** | `DeliveryPage` | 🔄 **需重構**：從查 sale_orders 改為查 stock_pickings | 列表某日出貨單、指派司機、標記完成 |
| **StockPickingBatch** | inline 在 `DeliveryPage`（「排車」按鈕） | ★ 待做 | 建 batch、指派 pickings |
| **PurchaseOrder** | `PurchasePage` / `ProcurementPage` (VFS) | ✅ 已做 | 採購管理；**補：建立時自動帶 default_buyer** |
| **AuditLog** | inline drawer 於任一頁（點「歷史」按鈕） | ★ 待做 | 呼叫 `/api/v1/audit` 顯示某記錄或某表的變更 |
| **IrConfigParameter** | `SettingsPage`（截止時間） | 🔄 改資料源從 `x_app_settings` → `ir_config_parameters` | 讀/寫截止時間 |
| **Holiday** | `SettingsPage`（假日管理） | 🔄 改資料源從 `x_holiday_settings` → `hr_leave_mandatory_days` | 以日期區間（start/end）編輯；列表、新增、刪除 |

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
| `CategoryBuyerPage` | 採購員歸屬改走 `品項 → 主供應商 → supplier.custom_data.default_buyer_id`（與分類脫鉤） | 在 `ProductsPage` 設主供應商、`SuppliersPage` 設預設採購員 |
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
2. 資料搬遷：舊 `x_holiday_settings` 的單日記錄轉為 `hr_leave_mandatory_days`（start=end=原 date），reason→name
3. 資料驗證通過後，AI GO 後台刪除不再使用的 custom table

---

## 5. 對應到既有 README 的差異

本文件為正式架構定義；`README.md` 保留部署指南與快速上手。兩者矛盾時以本文件為準。

主要差異：
- **x_ custom table 的設計方向**：本文件明列下架路徑，`README.md` 原文應在 Phase 4 完成後同步更新
- **DeliveryPage 資料源**：原為 sale_orders；目標為 stock_pickings
- **驅動司機來源**：原為 `x_driver_customer`；目標為 `customer_tags.custom_data.default_driver_id`
