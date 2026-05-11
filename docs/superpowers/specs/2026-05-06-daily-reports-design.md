# 每日報表頁設計（採購單 / 點貨單 / CSV 匯出）

- 日期：2026-05-06
- 路徑：`/admin/daily/reports`
- 範圍：Admin App 新增一頁，提供當日工作單列印與對接系統 CSV 匯出
- 不在範圍：點貨單存檔（A 模式即時不存檔）；purchase_orders 表寫入（既有「確認訂單」流程已處理，本頁不重複）

---

## 1. 背景與目標

### 業務脈絡

業者本身不持有存貨，採用「代購」模式：客戶在 Ordering App 下單後，業者把當日所有 draft 訂單彙整，分別到各供應商集中採購，再分配給客戶。

訂單狀態流程（既有）：
- `draft` — 顧客下單後預設狀態
- `sale` — 業者按下「確認訂單」（同時自動寫入 `purchase_orders` 表）
- `done` — 司機按下「確認送達」

本頁服務的階段是 `draft → sale 之前`：採購人員需要一份按「供應商」彙整的工作單拿去取貨，點貨員需要按「客戶」拆分的工作單把貨分配回去，外部系統需要一份 CSV 匯入帳務。

### 三項輸出

1. **採購單**：按「供應商 → 品項 → 客戶」三層彙整，列印雙欄 A4，每供應商一張。給採購人員拿去廠商集中取貨，順帶看到要分配給哪些客戶各多少。
2. **點貨單**：按「客戶 → 品項」彙整，每客戶一張 A4。給點貨員把貨分配回各客戶用。支援單張預覽、勾選列印、全部列印。
3. **CSV 匯出**：把當日 `sale_order_lines` 攤平成「客戶 + 品項 + 數量 + 單位 + 備註」每行一筆，給外部對接系統（如 ERP / 會計）匯入。

---

## 2. 架構

### 路由與檔案配置

```
vfs/admin/src/
├── pages/admin/
│   └── ReportsPage.tsx              ← 新：tab 切換 + 共用篩選器
├── components/reports/              ← 新：列印版型
│   ├── PurchaseSheet.tsx            ← 採購單元件（雙欄 A4）
│   ├── PickingSheet.tsx             ← 點貨單元件（雙欄 A4）
│   ├── PickingList.tsx              ← 點貨單頁的客戶清單／勾選
│   └── ReportPrintStyles.css        ← @media print 規則
└── utils/
    ├── reportData.ts                ← 純函式：sale_order_lines → supplier/customer 結構
    └── csvExport.ts                 ← 純函式：產 UTF-8 BOM CSV + Blob 下載
```

`App.tsx` 新增 `/admin/daily/reports` route；`DashboardPage` 新增一張入口卡片。

### 為什麼這樣切

- `reportData.ts` 是純函式 → 可獨立 unit test，無需 mock React。
- 列印元件放 `components/reports/` → 它們是「被嵌入頁面的可印區塊」，不是 route。
- 三個 sheet 元件職責單一互不依賴 → 改採購單版型不會動到點貨單。
- 跟既有 `PurchaseListPage`（接單審查用）解耦 → 兩者用途不同，避免單一檔案過大。

---

## 3. 資料來源與彙整邏輯

### 輸入（從 `DataProvider` 拿）

| 資料 | 來源欄位 |
|---|---|
| 訂單 | `orders`（已篩 selectedDate 的 draft） |
| 訂單明細 | `orderLines`：`name` / `product_uom_qty` / `product_template_id` / `product_id` / `custom_data.note` |
| 客戶 | `customers`：`short_name` / `name` / `custom_data.region_tag_id` |
| 路線 | `customer_tags`：`name`（路線代號如 `F33`） |
| 商品 | `products`：`custom_data.default_supplier_id` / `uom_id` |
| 供應商 | `suppliers` |
| 單位 | `uomMap` |

### 訂單狀態

只取 `state IN ('draft', null)`（與既有 `PurchaseListPage` 一致）。`sale` / `done` / `cancel` 不算。理由：本頁服務 `draft → sale 之前`的工作流，已確認的訂單由其他頁面處理。

### 純函式 API

```ts
// utils/reportData.ts

interface PurchaseRow {
  customerCode: string;     // 路線代號 + 客戶簡稱，如 "F33炸料"
  qty: number;
  uom: string;
  note: string;
}

interface PurchaseProductBlock {
  productName: string;
  uom: string;              // 該品項主單位（同品項應一致；若不一致以第一筆為準）
  rows: PurchaseRow[];
}

interface PurchaseSheet {
  supplierId: string;       // 或 '__none__'
  supplierName: string;
  products: PurchaseProductBlock[];
}

interface PickingRow {
  productName: string;
  qty: number;
  uom: string;
  note: string;
}

interface PickingSheet {
  customerId: string;
  customerCode: string;     // 路線代號 + 客戶簡稱
  customerFullName: string;
  lines: PickingRow[];
}

buildPurchaseSheets(input): PurchaseSheet[]
buildPickingSheets(input): PickingSheet[]
```

### 共用 helper

- `customerCode(cust, tagsMap)` → `${routeCode}${shortName}`（路線代號從 `customer.custom_data.region_tag_id → customer_tags.name` 取，簡稱取 `cust.short_name || cust.name.slice(0, 3)`）。
- `lineNote(line)` → `line.custom_data?.note || ''`（與 `OrdersPage` 既有邏輯一致）。
- `lineUom(line, products, uomMap)` → 從 `product_template_id → product.uom_id → uomMap` 取。

### 排序規則

**採購單**：
1. 供應商：以 `supplier.name` 中文 locale 排序，`__none__`（未設定）排最後。
2. 同供應商內品項：以 `productName` 排序。
3. 同品項內客戶：以 `customerCode` 排序。

**點貨單**：
1. 客戶：以 `customerCode` 排序（路線代號優先）。
2. 客戶內品項：以 `productName` 排序。

### 篩選器

- **日期**：`DatePickerWithCounts`，跨三 tab 共用，預設 `selectedDate`（與 `DataProvider` 同步）。
- **供應商下拉**：只影響「採購單」與「CSV 匯出」；「點貨單」忽略此篩選（點貨員視角不需要篩供應商）。

---

## 4. 採購單列印版型

### 視覺結構（一個供應商一張 A4）

```
┌─────────────────────────────────────────────────────┐
│ 出貨日期: 2026/04/29     廠商名稱: C02 廣A中央        │  ← thead，跨頁重複
├──────────────────────┬──────────────────────────────┤
│客戶│品名│數量 單位│備註│ 客戶│品名│數量 單位│備註     │  ← 雙欄
├────┼────┼─────────┼───┼────┼────┼─────────┼─────────┤
│F33炸料│綠節瓜│1.00 台斤│直徑3-4cm│ ...               │
│F60梵  │綠節瓜│2.50 台斤│中等大小  │ ...               │
└──────────────────────┴──────────────────────────────┘
```

### 實作要點

- **雙欄**：CSS `column-count: 2` 把長表分成兩欄；同品項用淡色橫線分隔區段。
- **列印樣式**：透過 `PrintProvider.triggerPrint()` 開新視窗載入 `PRINT_CSS` 後列印（既有 CSS 已含 `@page A4 12mm`、表頭重複、表格邊框等）。本頁額外的 `column-count: 2`、品項區段分隔線、雙欄間距寫到 `ReportPrintStyles.css` 並注入新視窗。
- **表頭重複**：`<thead>` + `display: table-header-group`，跨頁時自動重複。
- **不顯示單號**：A 模式不存檔，假單號會誤導；只顯示「日期 + 廠商」。
- **每張一頁**：每個 `<PurchaseSheet>` 容器 `page-break-after: always`。
- **篩選行為**：選中某供應商 → 只渲染那張；不篩 → 當日全部供應商各一張，連印。

### 邊界

- 沒設定供應商的品項 → 歸到「未設定供應商」這張單，列在最後。
- 同供應商當日無明細 → 不渲染（避免空白單）。

---

## 5. 點貨單列印版型

### 視覺結構（一個客戶一張 A4）

```
┌─────────────────────────────────────────────────────────┐
│ 連絡電話: 0977-...   雄泉鮮食企業股份有限公司   點貨單     │  ← 公司 header
│ 傳真號碼: 02-...     訂購日期: 2026/04/30                │
├──────────────────────┬──────────────────────────────────┤
│店家   │品名  │數量 單位│ 店家    │品名     │數量 單位     │  ← 雙欄
├───────┼──────┼─────────┼─────────┼─────────┼─────────────┤
│G16五股│平地初秋B│30.00 台斤│ ...                          │
│G16五股│空心菜B  │10.00 台斤│ ...                          │
└──────────────────────┴──────────────────────────────────┘
```

### 頁面互動區（非列印）

```
[日期] 2026/04/30   [全部列印] [列印選取]
┌──────────────────────────────────────┐
│ ☐ G16 五股       18 品項   →預覽       │
│ ☐ G56 皇家       12 品項   →預覽       │
│ ☐ G13 瑪麗       20 品項   →預覽       │
└──────────────────────────────────────┘
```

點某客戶 → 右側預覽該張點貨單；按鈕單張列印。

### 實作要點

- **公司資訊**：從 `x_app_settings` 讀，key = `company_info`，值為 JSON：`{ name, phone, fax }`。若 key 不存在 → header 顯示「— 請至設定頁填寫公司資訊」並仍允許列印。`SettingsPage` 補一個欄位（屬於本次 scope）。
- **店家欄位**：`{routeCode}{shortName}` 格式（與採購單一致）。
- **雙欄**：CSS `column-count: 2`、`@page A4 12mm`。
- **每客戶一頁**：`<PickingSheet>` 容器 `page-break-after: always`。
- **三種列印模式**（皆透過既有 `PrintProvider.tsx` 的 `usePrint()` / `triggerPrint()`，會 `window.open()` 開新視窗載入 `PRINT_CSS` 後 `print()`）：
  - 「全部列印」 → `PrintArea` 內渲染當日所有 `PickingSheet`，呼叫 `print()`。
  - 「列印選取」 → 只渲染勾選的客戶。
  - 「單張預覽 + 列印」 → 點客戶顯示螢幕預覽（非 PrintArea），預覽區另一個 `print()` 入口只送單張。
- **CSS 整合**：既有 `PRINT_CSS` 已含 `@page A4 12mm`、`thead { display: table-header-group }`、表格邊框等。本頁額外的 `column-count: 2` 與品項區段分隔線寫進 `ReportPrintStyles.css`，並 inline 注入到 PrintProvider 的 `printWin.document` 中（簡單作法：在 `triggerPrint` 之外另寫一個帶 extraCSS 的版本，或直接擴充 PrintProvider 接受 extraCSS 參數）。

### 邊界

- 客戶當日 0 品項 → 不渲染。
- 「列印選取」一個都沒勾 → 按鈕 disabled。
- 公司資訊未設定 → 顯示警示但不擋列印。

---

## 6. CSV 匯出規格

### 欄位（依使用者範例）

| 欄位名 | 來源 | 範例 |
|---|---|---|
| 細項描述 | `${routeCode}`（**只放路線代號，不含客戶簡稱** — 對齊使用者範例「G82」） | `G82` |
| 品名規格 | `sale_order_line.name` | `初秋高麗A*` |
| 交易數量 | `product_uom_qty`，固定兩位小數 | `108.00` |
| 單位名稱 | `uomMap[product.uom_id]` | `台斤` |
| 分錄備註 | `custom_data.note \|\| ''` | `//18*6` |

注意：「細項描述」只放路線代號（如 `G82`），不含客戶簡稱 — 對齊使用者提供的範例。

### 檔案規格

- **編碼**：UTF-8 with BOM（`﻿` 開頭，Excel 與多數對接系統相容）。
- **換行**：`\r\n`。
- **分隔**：逗號 `,`；含逗號／引號／換行的欄位用雙引號包起來，內部 `"` 轉 `""`。
- **檔名**：`報表_{YYYYMMDD}_{供應商名|全部}.csv`。

### 範圍邏輯

- 跟採購單頁面共用供應商篩選；不篩 = 當日全部供應商。
- 訂單 state 過濾與採購單一致（`draft`）。
- 排序：先供應商、再品項、再客戶代號（與採購單視覺一致便於對照）。

### 程式落點

```ts
// utils/csvExport.ts
buildCsv(sheets: PurchaseSheet[]): string  // 純函式，可單元測試
downloadCsv(filename: string, csv: string): void  // Blob + a.click()
```

---

## 7. 錯誤處理與邊界

| 情境 | 處理 |
|---|---|
| `loading=true` | 顯示「載入中...」，三個 tab 都不渲染內容 |
| 當日 0 筆 draft | 三 tab 顯示空狀態「當日無待處理訂單」，列印／下載按鈕 disabled |
| 選了某供應商但當日該供應商無明細 | 採購單 tab 顯示「此供應商當日無訂單」 |
| CSV Blob 下載失敗 | `console.error` + 顯示錯誤訊息 |
| 公司資訊未設定 | 點貨單 header 顯示警示文字並指向 `SettingsPage`，但不擋列印 |
| 品項無對應 `product` 紀錄 | 單位欄位顯示空字串，不擋整體渲染 |
| 客戶無 `region_tag_id` 或 tag 已刪除 | `customerCode` 取 `shortName` only，不擋整體渲染 |

---

## 8. 測試重點（給 plan 階段參考）

### 純函式單元測試

- `reportData.buildPurchaseSheets`：給定 fixture lines/customers/suppliers，驗證 supplier→product→customer 結構與排序；驗證未指定供應商歸到 `__none__` 並排最後。
- `reportData.buildPickingSheets`：驗證客戶分組、客戶內品項排序、空品項客戶被略過。
- `csvExport.buildCsv`：驗證 BOM、CRLF、逗號／引號跳脫、空備註處理、UTF-8 中文不亂碼。
- `customerCode` helper：路線缺失、tag 刪除、short_name 缺失等邊界。

### 元件測試

- `PurchaseSheet` snapshot：雙欄結構、品項區段分隔、page-break。
- `PickingSheet` snapshot：公司 header、雙欄、page-break。
- `PickingList`：勾選狀態、列印選取按鈕 disabled 邏輯。

### E2E（Playwright）

- 進入 `/admin/daily/reports` → 切換 tab → 列印預覽 → 下載 CSV → 開檔比對欄位值與行數。
- 篩選供應商 → 採購單與 CSV 範圍變動正確；點貨單不受影響。

---

## 9. 不在本次範圍

- 點貨單存檔／單號管理（A 模式即時不存檔）。
- `purchase_orders` 表寫入（既有「確認訂單」流程已處理）。
- 多訂單狀態切換（本次只處理 draft；如需擴及 sale/done 之後另案）。
- PDF 後端產生（用瀏覽器 print 即可）。
- 列印偏好設定（如紙張尺寸切換、單欄/雙欄切換 — 預設 A4 雙欄）。
