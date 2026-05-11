# 每日報表頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Admin App 新增 `/admin/daily/reports` 頁面，提供當日採購單／點貨單列印與外部系統 CSV 匯出，覆蓋 spec `docs/superpowers/specs/2026-05-06-daily-reports-design.md`。

**Architecture:** 三個 tab 共用日期與供應商篩選器；資料層用兩個純函式（`reportData.ts`）把 `sale_order_lines` 重組成 supplier→product→customer 與 customer→product 兩種視角；列印走 `PrintProvider.triggerPrint()` 開新視窗載入 PRINT_CSS；CSV 前端 Blob 下載。

**Tech Stack:** React 18、react-router-dom v6、TypeScript、既有 `DataProvider` / `PrintProvider` / `DatePickerWithCounts`；無新增 npm 套件。

**Active code path:** 一律改 `vfs/admin/`（不要動根目錄 `admin/`）。

---

## File Structure

**新建檔案：**
- `vfs/admin/src/utils/reportData.ts` — 純函式：`buildPurchaseSheets` / `buildPickingSheets` / `customerCode` / `lineNote`
- `vfs/admin/src/utils/reportData.selftest.ts` — dev-only self-test 腳本，console.assert 驗證純函式
- `vfs/admin/src/utils/csvExport.ts` — 純函式：`buildCsv` / `downloadCsv`
- `vfs/admin/src/utils/csvExport.selftest.ts` — dev-only self-test 腳本
- `vfs/admin/src/components/reports/PurchaseSheet.tsx` — 採購單列印元件（一個 supplier 一個元件）
- `vfs/admin/src/components/reports/PickingSheet.tsx` — 點貨單列印元件（一個 customer 一個元件）
- `vfs/admin/src/components/reports/PickingList.tsx` — 點貨單頁的客戶清單與勾選 UI
- `vfs/admin/src/components/reports/reportPrintCss.ts` — `column-count: 2`、品項區段分隔線、雙欄間距（export 字串給 PrintProvider 注入 + ReportsPage `<style>` 標籤）
- `vfs/admin/src/pages/admin/ReportsPage.tsx` — 三 tab 主頁

**修改檔案：**
- `vfs/admin/src/App.tsx` — 加 `/admin/daily/reports` route
- `vfs/admin/src/pages/admin/DashboardPage.tsx` — 在 `steps` 陣列加一個「報表列印」入口卡
- `vfs/admin/src/components/PrintProvider.tsx` — `triggerPrint` 接受可選 `extraCss` 參數
- `vfs/admin/src/pages/admin/SettingsPage.tsx` — 新增「公司資訊」section（name / phone / fax）

---

## Task 1: PrintProvider 擴充支援 extraCss

**Files:**
- Modify: `vfs/admin/src/components/PrintProvider.tsx`

擴充 `triggerPrint` 與 `usePrint` 接受 `extraCss` 字串，讓報表頁可以注入雙欄樣式而不污染既有列印頁的 CSS。

- [ ] **Step 1: 修改 `triggerPrint` 簽名**

把 `triggerPrint(contentElement)` 改成 `triggerPrint(contentElement, extraCss?)`，把 `extraCss` 接在 `PRINT_CSS` 後面注入。

```tsx
// vfs/admin/src/components/PrintProvider.tsx
export function triggerPrint(contentElement: HTMLElement | null, extraCss = '') {
  if (!contentElement) return;
  const printWin = window.open('', '_blank', 'width=800,height=600');
  if (!printWin) { alert('請允許彈出視窗以使用列印功能'); return; }
  printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>列印</title><style>${PRINT_CSS}\n${extraCss}</style></head><body>${contentElement.innerHTML}</body></html>`);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => { printWin.print(); setTimeout(() => printWin.close(), 1000); }, 300);
}
```

- [ ] **Step 2: 修改 `usePrint` 接受 extraCss**

```tsx
export function usePrint(extraCss = '') {
  const contentRef = useRef<HTMLDivElement>(null);
  const print = useCallback(() => { triggerPrint(contentRef.current, extraCss); }, [extraCss]);
  return { contentRef, print };
}
```

- [ ] **Step 3: 確認既有呼叫端不受影響**

Run: `grep -rn "triggerPrint\|usePrint" vfs/admin/src/`
Expected: 既有呼叫沒傳 `extraCss`，因為 default `''`，行為不變。

- [ ] **Step 4: Commit**

```bash
git add vfs/admin/src/components/PrintProvider.tsx
git commit -m "refactor(print): triggerPrint 支援 extraCss 參數，給後續報表頁注入雙欄樣式"
```

---

## Task 2: 純函式 `reportData.ts` — 共用 helpers

**Files:**
- Create: `vfs/admin/src/utils/reportData.ts`

先建立檔案骨架與型別定義，後續 task 逐一補實作。

- [ ] **Step 1: 寫型別與骨架**

```ts
// vfs/admin/src/utils/reportData.ts

export interface PurchaseRow {
  customerCode: string;     // 路線代號 + 客戶簡稱，如 "F33炸料"
  qty: number;
  uom: string;
  note: string;
}

export interface PurchaseProductBlock {
  productName: string;
  uom: string;
  rows: PurchaseRow[];
}

export interface PurchaseSheet {
  supplierId: string;       // 或 '__none__'
  supplierName: string;
  products: PurchaseProductBlock[];
}

export interface PickingRow {
  productName: string;
  qty: number;
  uom: string;
  note: string;
}

export interface PickingSheet {
  customerId: string;
  customerCode: string;
  customerFullName: string;
  lines: PickingRow[];
}

export interface ReportInput {
  orders: any[];                              // 已篩 selectedDate 的訂單（所有 state，呼叫端先過濾 draft）
  orderLines: any[];                          // 全部 sale_order_lines（內部會用 delivery_date + order_id 對齊）
  customers: Record<string, any>;             // id → customer
  customerTags: any[];                        // customer_tags 陣列
  products: any[];                            // product_templates
  suppliers: Record<string, any>;             // id → supplier
  uomMap: Record<string, string>;             // uom_id → name
  selectedDate: string;                       // YYYY-MM-DD
}

const _id = (v: any): string => Array.isArray(v) ? String(v[0] || '') : String(v || '');

// ── helpers (exported for testability) ──

export function customerCode(cust: any | undefined, tagsById: Record<string, any>): string {
  if (!cust) return '';
  const tagId = _id(cust?.custom_data?.region_tag_id);
  const route = tagId ? String(tagsById[tagId]?.name || '') : '';
  const short = String(cust?.short_name || '').trim() || String(cust?.name || '').slice(0, 3);
  return `${route}${short}`;
}

export function lineNote(line: any): string {
  const cd = line?.custom_data;
  return (cd && typeof cd === 'object') ? String(cd.note || '') : '';
}

export function lineUom(
  line: any,
  productsById: Record<string, any>,
  uomMap: Record<string, string>,
): string {
  const pid = _id(line?.product_template_id || line?.product_id);
  const prod = productsById[pid];
  const uomId = _id(prod?.uom_id);
  return uomMap[uomId] || '';
}

// 後續 task 補：
export function buildPurchaseSheets(_input: ReportInput): PurchaseSheet[] { return []; }
export function buildPickingSheets(_input: ReportInput): PickingSheet[] { return []; }
```

- [ ] **Step 2: Commit**

```bash
git add vfs/admin/src/utils/reportData.ts
git commit -m "feat(reports): reportData.ts 加入型別與 helper 骨架"
```

---

## Task 3: `customerCode` / `lineNote` / `lineUom` self-test

**Files:**
- Create: `vfs/admin/src/utils/reportData.selftest.ts`

建立 self-test 入口檔，先驗證 helpers，後續 task 持續加 case。

- [ ] **Step 1: 建立 self-test 檔，驗證 helpers**

```ts
// vfs/admin/src/utils/reportData.selftest.ts
// 用法：在瀏覽器 devtools 執行 import('./utils/reportData.selftest')
//      或在實作期間 main.tsx 暫時 import 一次跑完看 console。

import { customerCode, lineNote, lineUom } from './reportData';

function assert(cond: any, msg: string) {
  if (!cond) { console.error('❌', msg); throw new Error(msg); }
  console.log('✅', msg);
}

export function runReportDataSelfTest() {
  // ── customerCode ──
  assert(customerCode({ short_name: '炸料', custom_data: { region_tag_id: 't1' } }, { t1: { name: 'F33' } }) === 'F33炸料', 'customerCode 路線+簡稱');
  assert(customerCode({ name: '梵某餐廳', custom_data: { region_tag_id: 't2' } }, { t2: { name: 'F60' } }) === 'F60梵某餐', 'customerCode 無 short_name 取 name 前 3 字');
  assert(customerCode({ short_name: '五股' }, {}) === '五股', 'customerCode 無 region_tag_id 只回簡稱');
  assert(customerCode({ short_name: '五股', custom_data: { region_tag_id: 'gone' } }, {}) === '五股', 'customerCode tag 已刪除 → fallback 到簡稱');
  assert(customerCode(undefined, {}) === '', 'customerCode undefined 客戶 → 空字串');

  // ── lineNote ──
  assert(lineNote({ custom_data: { note: '直徑3-4cm' } }) === '直徑3-4cm', 'lineNote 取 custom_data.note');
  assert(lineNote({ custom_data: null }) === '', 'lineNote null custom_data → 空字串');
  assert(lineNote({}) === '', 'lineNote 無 custom_data → 空字串');

  // ── lineUom ──
  const productsById = { p1: { id: 'p1', uom_id: 'u1' }, p2: { id: 'p2', uom_id: ['u2', '顆'] } };
  const uomMap = { u1: '台斤', u2: '顆' };
  assert(lineUom({ product_template_id: 'p1' }, productsById, uomMap) === '台斤', 'lineUom 純字串 uom_id');
  assert(lineUom({ product_template_id: ['p2'] }, productsById, uomMap) === '顆', 'lineUom array 形式 uom_id');
  assert(lineUom({ product_template_id: 'unknown' }, productsById, uomMap) === '', 'lineUom 找不到 product → 空字串');

  console.log('🎉 reportData helpers self-test passed');
}

if (typeof window !== 'undefined') {
  (window as any).__runReportDataSelfTest = runReportDataSelfTest;
}
```

- [ ] **Step 2: 開發機跑 self-test**

打開瀏覽器，部署 dev 版 admin，devtools console 跑：
```js
window.__runReportDataSelfTest()
```
Expected: 9 個 ✅，最後印出 `🎉 reportData helpers self-test passed`。

實作期間若不便部署，可改用最簡單的 ts node 跑：先確認 vfs/admin 沒有 tsx 環境，所以**首選用瀏覽器 devtools 驗**。

- [ ] **Step 3: Commit**

```bash
git add vfs/admin/src/utils/reportData.selftest.ts
git commit -m "test(reports): reportData helpers self-test（customerCode / lineNote / lineUom）"
```

---

## Task 4: `buildPurchaseSheets` 實作 + self-test

**Files:**
- Modify: `vfs/admin/src/utils/reportData.ts`
- Modify: `vfs/admin/src/utils/reportData.selftest.ts`

按 spec §3 規則：把 lines 整理成 `supplier → product → customer rows`，含排序與 `__none__` 分組。

- [ ] **Step 1: 在 selftest 加上失敗測試**

在 `reportData.selftest.ts` 的 `runReportDataSelfTest` 裡，helpers 區塊之後加：

```ts
import { buildPurchaseSheets } from './reportData';

// ── buildPurchaseSheets ──
const fixture = {
  orders: [
    { id: 'o1', customer_id: 'c1', state: 'draft' },
    { id: 'o2', customer_id: 'c2', state: 'draft' },
  ],
  orderLines: [
    { id: 'l1', order_id: 'o1', product_template_id: 'p1', name: '綠節瓜',  product_uom_qty: 1.0, custom_data: { note: '直徑3-4cm' } },
    { id: 'l2', order_id: 'o2', product_template_id: 'p1', name: '綠節瓜',  product_uom_qty: 2.5, custom_data: {} },
    { id: 'l3', order_id: 'o1', product_template_id: 'p2', name: '巴西里',  product_uom_qty: 0.5, custom_data: {} },
    { id: 'l4', order_id: 'o2', product_template_id: 'p3', name: '無供應商品', product_uom_qty: 1.0, custom_data: {} },
  ],
  customers: {
    c1: { id: 'c1', short_name: '炸料', custom_data: { region_tag_id: 't1' } },
    c2: { id: 'c2', short_name: '梵',   custom_data: { region_tag_id: 't2' } },
  },
  customerTags: [{ id: 't1', name: 'F33' }, { id: 't2', name: 'F60' }],
  products: [
    { id: 'p1', uom_id: 'u1', custom_data: { default_supplier_id: 's1' } },
    { id: 'p2', uom_id: 'u1', custom_data: { default_supplier_id: 's1' } },
    { id: 'p3', uom_id: 'u1', custom_data: {} },  // 無供應商
  ],
  suppliers: { s1: { id: 's1', name: 'C02 廣A中央' } },
  uomMap: { u1: '台斤' },
  selectedDate: '2026-04-29',
};

const sheets = buildPurchaseSheets(fixture);

assert(sheets.length === 2, 'buildPurchaseSheets 兩張單（s1 + __none__）');
assert(sheets[0].supplierId === 's1', '第一張為 s1（依名稱排序）');
assert(sheets[1].supplierId === '__none__', '__none__ 排最後');

const s1 = sheets[0];
assert(s1.products.length === 2, 's1 含兩個品項（綠節瓜、巴西里）');
assert(s1.products[0].productName === '巴西里', '品項中文排序：巴西里 < 綠節瓜');
assert(s1.products[1].productName === '綠節瓜', '品項排序');
assert(s1.products[1].rows.length === 2, '綠節瓜 2 個客戶');
assert(s1.products[1].rows[0].customerCode === 'F33炸料', '客戶代號排序：F33 < F60');
assert(s1.products[1].rows[0].qty === 1.0 && s1.products[1].rows[0].note === '直徑3-4cm', '備註正確');
assert(s1.products[1].uom === '台斤', '品項單位');

const none = sheets[1];
assert(none.supplierName === '未設定供應商', '__none__ 顯示名');
assert(none.products[0].rows[0].customerCode === 'F60梵', '__none__ 也用客戶代號');
```

- [ ] **Step 2: 跑 self-test 驗證 fail**

部署 dev / 在瀏覽器 console 跑 `window.__runReportDataSelfTest()`。
Expected: 因為 `buildPurchaseSheets` 還是回 `[]`，第一個 assert (`sheets.length === 2`) 會 fail。

- [ ] **Step 3: 實作 `buildPurchaseSheets`**

替換 `reportData.ts` 中的骨架實作：

```ts
export function buildPurchaseSheets(input: ReportInput): PurchaseSheet[] {
  const { orders, orderLines, customers, customerTags, products, suppliers, uomMap, selectedDate } = input;

  // index helpers
  const productsById: Record<string, any> = {};
  const productSupplier: Record<string, string> = {};   // tmplId → supplierId
  for (const p of products) {
    productsById[p.id] = p;
    const s = _id(p?.custom_data?.default_supplier_id);
    if (s) productSupplier[p.id] = s;
  }
  const tagsById: Record<string, any> = {};
  for (const t of customerTags) tagsById[t.id] = t;

  // 篩當日訂單 line（用 delivery_date + 屬於 orders 集合）
  const orderIds = new Set(orders.map(o => String(o.id)));
  const todaysLines = orderLines.filter(l =>
    orderIds.has(_id(l.order_id)) &&
    String(l.delivery_date || '').slice(0, 10) === selectedDate
  );

  // 分組 supplier → product → customer
  type Bucket = Map<string, { name: string; uom: string; rows: PurchaseRow[] }>;
  const grouped = new Map<string, Bucket>();   // supplierKey → product bucket

  for (const l of todaysLines) {
    const tmplId = _id(l.product_template_id || l.product_id);
    const supKey = productSupplier[tmplId] || '__none__';
    if (!grouped.has(supKey)) grouped.set(supKey, new Map());
    const bucket = grouped.get(supKey)!;
    const pname = String(l.name || '—');
    const productKey = `${tmplId}|${pname}`;       // 用 tmplId+name 當 key 避免同名不同品項合併
    if (!bucket.has(productKey)) {
      bucket.set(productKey, {
        name: pname,
        uom: lineUom(l, productsById, uomMap),
        rows: [],
      });
    }
    const block = bucket.get(productKey)!;
    const orderForLine = orders.find(o => String(o.id) === _id(l.order_id));
    const cust = orderForLine ? customers[_id(orderForLine.customer_id)] : undefined;
    block.rows.push({
      customerCode: customerCode(cust, tagsById),
      qty: Number(l.product_uom_qty || 0),
      uom: lineUom(l, productsById, uomMap),
      note: lineNote(l),
    });
  }

  // 排序：supplier 名稱（none 殿後）；品項中文；客戶代號
  const sheets: PurchaseSheet[] = Array.from(grouped.entries()).map(([supKey, bucket]) => {
    const products = Array.from(bucket.values())
      .map(b => ({
        productName: b.name,
        uom: b.uom,
        rows: [...b.rows].sort((a, b) => a.customerCode.localeCompare(b.customerCode, 'zh-Hant')),
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName, 'zh-Hant'));
    return {
      supplierId: supKey,
      supplierName: supKey === '__none__' ? '未設定供應商' : (suppliers[supKey]?.name || supKey),
      products,
    };
  });

  sheets.sort((a, b) => {
    if (a.supplierId === '__none__') return 1;
    if (b.supplierId === '__none__') return -1;
    return a.supplierName.localeCompare(b.supplierName, 'zh-Hant');
  });

  return sheets;
}
```

- [ ] **Step 4: 跑 self-test 驗證 pass**

瀏覽器 console 跑 `window.__runReportDataSelfTest()`。
Expected: 全部 ✅ 含 `buildPurchaseSheets` 的 9 個 assert。

- [ ] **Step 5: Commit**

```bash
git add vfs/admin/src/utils/reportData.ts vfs/admin/src/utils/reportData.selftest.ts
git commit -m "feat(reports): buildPurchaseSheets — supplier→product→customer 分組與排序"
```

---

## Task 5: `buildPickingSheets` 實作 + self-test

**Files:**
- Modify: `vfs/admin/src/utils/reportData.ts`
- Modify: `vfs/admin/src/utils/reportData.selftest.ts`

按 spec §3：customer → product。

- [ ] **Step 1: selftest 加 case**

在 `runReportDataSelfTest` 末尾、`console.log('🎉 ...')` 之前加：

```ts
import { buildPickingSheets } from './reportData';

const picks = buildPickingSheets(fixture);
assert(picks.length === 2, 'buildPickingSheets 兩個客戶');
assert(picks[0].customerCode === 'F33炸料', '客戶按代號排序');
assert(picks[1].customerCode === 'F60梵',   '第二個客戶');
assert(picks[0].lines.length === 2, '炸料兩個品項');
assert(picks[0].lines[0].productName === '巴西里', '客戶內品項中文排序');
assert(picks[0].lines[1].productName === '綠節瓜', '客戶內品項排序');
assert(picks[1].lines.length === 2, '梵兩個品項（綠節瓜+無供應商品）');
assert(picks[0].lines[1].qty === 1.0 && picks[0].lines[1].uom === '台斤', '炸料的綠節瓜數量+單位');
assert(picks[0].customerFullName === fixture.customers.c1.short_name || picks[0].customerFullName === '炸料', '存 customerFullName');
```

注意：`customerFullName` 取 `cust.name || cust.short_name`，下方實作會給。

- [ ] **Step 2: 跑 self-test 驗證 fail**

第一個 assert 會 fail（`picks.length === 0`）。

- [ ] **Step 3: 實作 `buildPickingSheets`**

替換 `reportData.ts` 中的 `buildPickingSheets`：

```ts
export function buildPickingSheets(input: ReportInput): PickingSheet[] {
  const { orders, orderLines, customers, customerTags, products, uomMap, selectedDate } = input;

  const productsById: Record<string, any> = {};
  for (const p of products) productsById[p.id] = p;
  const tagsById: Record<string, any> = {};
  for (const t of customerTags) tagsById[t.id] = t;

  const orderIdToCust: Record<string, string> = {};
  for (const o of orders) orderIdToCust[String(o.id)] = _id(o.customer_id);

  const todaysLines = orderLines.filter(l =>
    !!orderIdToCust[_id(l.order_id)] &&
    String(l.delivery_date || '').slice(0, 10) === selectedDate
  );

  // 分組 customer → rows
  const grouped = new Map<string, PickingRow[]>();
  for (const l of todaysLines) {
    const cid = orderIdToCust[_id(l.order_id)];
    if (!cid) continue;
    if (!grouped.has(cid)) grouped.set(cid, []);
    grouped.get(cid)!.push({
      productName: String(l.name || '—'),
      qty: Number(l.product_uom_qty || 0),
      uom: lineUom(l, productsById, uomMap),
      note: lineNote(l),
    });
  }

  const sheets: PickingSheet[] = Array.from(grouped.entries())
    .map(([cid, rows]) => {
      const cust = customers[cid];
      return {
        customerId: cid,
        customerCode: customerCode(cust, tagsById),
        customerFullName: String(cust?.name || cust?.short_name || ''),
        lines: rows.sort((a, b) => a.productName.localeCompare(b.productName, 'zh-Hant')),
      };
    })
    .filter(s => s.lines.length > 0)
    .sort((a, b) => a.customerCode.localeCompare(b.customerCode, 'zh-Hant'));

  return sheets;
}
```

- [ ] **Step 4: 跑 self-test 驗證 pass**

Expected: 全部 ✅ 含 picking 的 8 個 assert。

- [ ] **Step 5: Commit**

```bash
git add vfs/admin/src/utils/reportData.ts vfs/admin/src/utils/reportData.selftest.ts
git commit -m "feat(reports): buildPickingSheets — 按客戶分組點貨單視角"
```

---

## Task 6: `csvExport.ts` 實作 + self-test

**Files:**
- Create: `vfs/admin/src/utils/csvExport.ts`
- Create: `vfs/admin/src/utils/csvExport.selftest.ts`

按 spec §6：UTF-8 BOM、CRLF、雙引號跳脫；輸入是 `PurchaseSheet[]`，攤平成「客戶 / 品名 / 數量 / 單位 / 備註」5 欄。

- [ ] **Step 1: 建立 self-test，先寫 fail 測試**

```ts
// vfs/admin/src/utils/csvExport.selftest.ts
import { buildCsv } from './csvExport';
import type { PurchaseSheet } from './reportData';

function assert(cond: any, msg: string) {
  if (!cond) { console.error('❌', msg); throw new Error(msg); }
  console.log('✅', msg);
}

export function runCsvExportSelfTest() {
  const sheets: PurchaseSheet[] = [
    {
      supplierId: 's1',
      supplierName: 'C02 廣A中央',
      products: [
        {
          productName: '初秋高麗A*',
          uom: '台斤',
          rows: [
            { customerCode: 'G82', qty: 108, uom: '台斤', note: '//18*6' },
            { customerCode: 'C29', qty: 10,  uom: '台斤', note: '' },
            { customerCode: 'F75品串', qty: 1.99, uom: '千克', note: '長20cm,勿粗' },  // 含逗號
            { customerCode: 'X01', qty: 1, uom: '顆', note: '備註含"引號"與\n換行' },     // 跳脫
          ],
        },
      ],
    },
  ];

  const csv = buildCsv(sheets);

  assert(csv.startsWith('﻿'), 'CSV 以 UTF-8 BOM 起始');
  assert(csv.includes('細項描述,品名規格,交易數量,單位名稱,分錄備註\r\n'), 'CSV header 五欄逗號分隔，CRLF');
  assert(csv.includes('G82,初秋高麗A*,108.00,台斤,//18*6\r\n'), '基本列：路線代號 / 品名 / 數量兩位小數 / 單位 / 備註');
  assert(csv.includes('C29,初秋高麗A*,10.00,台斤,\r\n'), '空備註 → 欄位空字串');
  assert(csv.includes('"F75品串","初秋高麗A*","1.99","千克","長20cm,勿粗"\r\n')
      || csv.includes('F75品串,初秋高麗A*,1.99,千克,"長20cm,勿粗"\r\n'),
    '含逗號的欄位用引號包起來');
  assert(csv.includes('"備註含""引號""與\n換行"'), '雙引號跳脫成 ""，換行保留在引號內');

  console.log('🎉 csvExport self-test passed');
}

if (typeof window !== 'undefined') {
  (window as any).__runCsvExportSelfTest = runCsvExportSelfTest;
}
```

- [ ] **Step 2: 跑 fail 確認**

先建立 `csvExport.ts` 骨架以免編譯不過：

```ts
// vfs/admin/src/utils/csvExport.ts
import type { PurchaseSheet } from './reportData';

export function buildCsv(_sheets: PurchaseSheet[]): string { return ''; }

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

跑 `window.__runCsvExportSelfTest()`。
Expected: 第一個 assert（BOM）就 fail。

- [ ] **Step 3: 實作 `buildCsv`**

```ts
// vfs/admin/src/utils/csvExport.ts
import type { PurchaseSheet } from './reportData';

const HEADERS = ['細項描述', '品名規格', '交易數量', '單位名稱', '分錄備註'];

function escapeCell(value: string): string {
  // 含 ", , 或換行 → 用 " 包起來，內部 " → ""
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(sheets: PurchaseSheet[]): string {
  const lines: string[] = [HEADERS.join(',')];
  for (const sheet of sheets) {
    for (const block of sheet.products) {
      for (const row of block.rows) {
        lines.push([
          escapeCell(row.customerCode),
          escapeCell(block.productName),
          row.qty.toFixed(2),
          escapeCell(row.uom || block.uom || ''),
          escapeCell(row.note || ''),
        ].join(','));
      }
    }
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: 跑 self-test pass**

Expected: 6 個 ✅ + `🎉 csvExport self-test passed`。

- [ ] **Step 5: Commit**

```bash
git add vfs/admin/src/utils/csvExport.ts vfs/admin/src/utils/csvExport.selftest.ts
git commit -m "feat(reports): csvExport — UTF-8 BOM CSV 含跳脫與兩位小數"
```

---

## Task 7: `reportPrintCss.ts` — 列印與螢幕共用樣式字串

**Files:**
- Create: `vfs/admin/src/components/reports/reportPrintCss.ts`

CSS 用 ts 字串型式 export（而非 .css 檔），原因：`PrintProvider.triggerPrint` 是 `window.open()` 開新視窗注入字串到 `<style>`，而 Vite 的 `import './x.css'` 只會把樣式 inject 到當前頁的 `<head>`，新視窗拿不到。同一份字串也供螢幕預覽用 `<style>{REPORT_PRINT_CSS}</style>` 注入。

- [ ] **Step 1: 寫 CSS 字串**

```ts
// vfs/admin/src/components/reports/reportPrintCss.ts
export const REPORT_PRINT_CSS = `
.report-sheet { page-break-after: always; }
.report-sheet:last-child { page-break-after: auto; }
.report-header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5pt solid #000; padding-bottom: 6pt; margin-bottom: 8pt; font-size: 12pt; font-weight: bold; }
.report-header .meta { font-size: 10pt; font-weight: normal; }
.report-title { font-size: 14pt; }
.report-columns { column-count: 2; column-gap: 8mm; column-rule: 0.5pt solid #ccc; font-size: 10pt; }
.report-product-block { break-inside: avoid; margin-bottom: 4pt; }
.report-product-block + .report-product-block { border-top: 0.5pt dashed #999; padding-top: 3pt; }
.report-product-name { font-weight: bold; font-size: 10pt; margin-bottom: 2pt; }
.report-row { display: grid; grid-template-columns: 4em 1fr 4em 4em 1fr; gap: 4pt; padding: 1pt 0; break-inside: avoid; }
.report-row .num { text-align: right; font-variant-numeric: tabular-nums; }
.report-row .note { color: #444; font-size: 9pt; }
.picking-row { display: grid; grid-template-columns: 5em 1fr 4em 4em; gap: 4pt; padding: 1pt 0; break-inside: avoid; }
.picking-row .num { text-align: right; font-variant-numeric: tabular-nums; }
.report-warning { font-size: 9pt; color: #b45309; background: #fef3c7; padding: 2pt 4pt; border-radius: 2pt; display: inline-block; }
`;
```

- [ ] **Step 2: Commit**

```bash
git add vfs/admin/src/components/reports/reportPrintCss.ts
git commit -m "feat(reports): reportPrintCss — 雙欄列印與螢幕預覽共用樣式字串"
```

---

## Task 8: `PurchaseSheet.tsx` 元件

**Files:**
- Create: `vfs/admin/src/components/reports/PurchaseSheet.tsx`

純 presentational：吃一個 `PurchaseSheet` 物件渲染雙欄表格。

- [ ] **Step 1: 寫元件**

```tsx
// vfs/admin/src/components/reports/PurchaseSheet.tsx
import type { PurchaseSheet as Sheet } from '../../utils/reportData';

interface Props {
  sheet: Sheet;
  date: string;
}

export default function PurchaseSheet({ sheet, date }: Props) {
  return (
    <div className="report-sheet">
      <div className="report-header">
        <span>出貨日期：{date}</span>
        <span className="report-title">廠商名稱：{sheet.supplierName}</span>
        <span className="meta">{sheet.products.length} 品項</span>
      </div>
      <div className="report-columns">
        {sheet.products.map((block, i) => (
          <div key={i} className="report-product-block">
            <div className="report-product-name">{block.productName}</div>
            {block.rows.map((row, j) => (
              <div key={j} className="report-row">
                <span>{row.customerCode}</span>
                <span>{block.productName}</span>
                <span className="num">{row.qty.toFixed(2)}</span>
                <span>{row.uom || block.uom}</span>
                <span className="note">{row.note}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add vfs/admin/src/components/reports/PurchaseSheet.tsx
git commit -m "feat(reports): PurchaseSheet 元件 — 雙欄採購單渲染"
```

---

## Task 9: `PickingSheet.tsx` 元件

**Files:**
- Create: `vfs/admin/src/components/reports/PickingSheet.tsx`

- [ ] **Step 1: 寫元件**

```tsx
// vfs/admin/src/components/reports/PickingSheet.tsx
import type { PickingSheet as Sheet } from '../../utils/reportData';

interface CompanyInfo { name: string; phone: string; fax: string; }

interface Props {
  sheet: Sheet;
  date: string;
  company: CompanyInfo | null;
}

export default function PickingSheet({ sheet, date, company }: Props) {
  return (
    <div className="report-sheet">
      <div className="report-header">
        <div>
          <div>連絡電話：{company?.phone || '—'}</div>
          <div>傳真號碼：{company?.fax || '—'}</div>
        </div>
        <div className="report-title">{company?.name || '— 請至設定頁填寫公司資訊'}</div>
        <div>
          <div>訂購日期：{date}</div>
          <div className="meta">點貨單</div>
        </div>
      </div>
      {!company && (
        <div className="report-warning">
          公司資訊尚未設定，請至「設定 → 系統設定 → 公司資訊」填寫。
        </div>
      )}
      <div className="report-columns">
        {sheet.lines.map((row, j) => (
          <div key={j} className="picking-row">
            <span>{sheet.customerCode}</span>
            <span>{row.productName}</span>
            <span className="num">{row.qty.toFixed(2)}</span>
            <span>{row.uom}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add vfs/admin/src/components/reports/PickingSheet.tsx
git commit -m "feat(reports): PickingSheet 元件 — 雙欄點貨單渲染與公司資訊 header"
```

---

## Task 10: `PickingList.tsx` — 客戶清單與勾選

**Files:**
- Create: `vfs/admin/src/components/reports/PickingList.tsx`

點貨單頁的左側清單：列出客戶、勾選框、預覽按鈕。

- [ ] **Step 1: 寫元件**

```tsx
// vfs/admin/src/components/reports/PickingList.tsx
import type { PickingSheet } from '../../utils/reportData';

interface Props {
  sheets: PickingSheet[];
  selectedIds: Set<string>;
  onToggle: (customerId: string) => void;
  onPreview: (customerId: string) => void;
  previewingId: string | null;
}

export default function PickingList({ sheets, selectedIds, onToggle, onPreview, previewingId }: Props) {
  if (sheets.length === 0) {
    return <p className="text-sm text-gray-400 px-4 py-8 text-center">當日無點貨資料</p>;
  }
  return (
    <ul className="divide-y divide-gray-100">
      {sheets.map(s => (
        <li key={s.customerId}
            className={`flex items-center gap-3 px-4 py-2 hover:bg-gray-50 ${previewingId === s.customerId ? 'bg-blue-50' : ''}`}>
          <input
            type="checkbox"
            checked={selectedIds.has(s.customerId)}
            onChange={() => onToggle(s.customerId)}
            className="w-4 h-4"
          />
          <div className="flex-1">
            <div className="font-medium text-gray-900 text-sm">{s.customerCode}</div>
            <div className="text-xs text-gray-400">{s.lines.length} 品項</div>
          </div>
          <button
            onClick={() => onPreview(s.customerId)}
            className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">
            預覽
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add vfs/admin/src/components/reports/PickingList.tsx
git commit -m "feat(reports): PickingList — 點貨單客戶清單與勾選元件"
```

---

## Task 11: `ReportsPage.tsx` 主頁整合

**Files:**
- Create: `vfs/admin/src/pages/admin/ReportsPage.tsx`

三 tab、共用篩選器（日期、供應商）、點貨單頁勾選邏輯、CSV 下載、列印觸發。

- [ ] **Step 1: 寫主頁**

```tsx
// vfs/admin/src/pages/admin/ReportsPage.tsx
import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '../../data/DataProvider';
import * as db from '../../db';
import DatePickerWithCounts from '../../components/DatePickerWithCounts';
import { PrintArea, usePrint } from '../../components/PrintProvider';
import { buildPurchaseSheets, buildPickingSheets } from '../../utils/reportData';
import { buildCsv, downloadCsv } from '../../utils/csvExport';
import { REPORT_PRINT_CSS } from '../../components/reports/reportPrintCss';
import PurchaseSheet from '../../components/reports/PurchaseSheet';
import PickingSheet from '../../components/reports/PickingSheet';
import PickingList from '../../components/reports/PickingList';

const Arrow = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>;

type Tab = 'purchase' | 'picking' | 'csv';
type CompanyInfo = { name: string; phone: string; fax: string };

const KEY_COMPANY = 'company_info';

export default function ReportsPage() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { orders, orderLines, customers, products, suppliers, uomMap, loading, selectedDate, setSelectedDate } = useData();

  const [tab, setTabState] = useState<Tab>(() => (searchParams.get('tab') as Tab) || 'purchase');
  const setTab = (t: Tab) => {
    setTabState(t);
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('tab', t); return p; }, { replace: true });
  };

  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [customerTags, setCustomerTags] = useState<any[]>([]);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [selectedPicks, setSelectedPicks] = useState<Set<string>>(new Set());
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  // 載入 customer_tags
  useEffect(() => {
    db.query('customer_tags').then(rows => setCustomerTags(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, []);

  // 載入公司資訊（x_app_settings.company_info）
  useEffect(() => {
    db.queryCustom('x_app_settings').then(rows => {
      const rec = (rows || []).find((r: any) => (r.data?.key || r.key) === KEY_COMPANY);
      if (!rec) { setCompany(null); return; }
      const raw = (rec.data?.value || rec.value || '').toString();
      try {
        const parsed = JSON.parse(raw);
        setCompany({ name: parsed.name || '', phone: parsed.phone || '', fax: parsed.fax || '' });
      } catch { setCompany(null); }
    }).catch(() => {});
  }, []);

  // 過濾 draft 訂單（與 PurchaseListPage 一致）
  const draftOrders = useMemo(
    () => orders.filter((o: any) => !o.state || o.state === 'draft'),
    [orders]
  );

  // 共用 input
  const reportInput = useMemo(() => ({
    orders: draftOrders,
    orderLines,
    customers,
    customerTags,
    products,
    suppliers,
    uomMap,
    selectedDate,
  }), [draftOrders, orderLines, customers, customerTags, products, suppliers, uomMap, selectedDate]);

  const purchaseSheets = useMemo(() => buildPurchaseSheets(reportInput), [reportInput]);
  const pickingSheets = useMemo(() => buildPickingSheets(reportInput), [reportInput]);

  // 套供應商篩選到 purchase + csv
  const filteredPurchaseSheets = useMemo(() => {
    if (supplierFilter === 'all') return purchaseSheets;
    return purchaseSheets.filter(s => s.supplierId === supplierFilter);
  }, [purchaseSheets, supplierFilter]);

  // 列印 hook
  const purchasePrint = usePrint(REPORT_PRINT_CSS);
  const pickingAllPrint = usePrint(REPORT_PRINT_CSS);
  const pickingSinglePrint = usePrint(REPORT_PRINT_CSS);

  // 勾選 helpers
  const toggleSelect = (cid: string) => {
    setSelectedPicks(prev => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid); else next.add(cid);
      return next;
    });
  };
  const previewingSheet = previewingId ? pickingSheets.find(s => s.customerId === previewingId) : null;

  // 哪些 PickingSheet 進 PrintArea：依「全部/選取/單張」三種模式
  const [printMode, setPrintMode] = useState<'all' | 'selected' | 'single'>('all');
  const sheetsToPrint = useMemo(() => {
    if (printMode === 'single' && previewingId) return pickingSheets.filter(s => s.customerId === previewingId);
    if (printMode === 'selected') return pickingSheets.filter(s => selectedPicks.has(s.customerId));
    return pickingSheets;
  }, [printMode, previewingId, selectedPicks, pickingSheets]);

  // CSV 下載
  const downloadCurrentCsv = () => {
    const csv = buildCsv(filteredPurchaseSheets);
    const supName = supplierFilter === 'all' ? '全部'
      : (suppliers[supplierFilter]?.name || supplierFilter).replace(/[\\/:*?"<>|]/g, '_');
    const dateStr = selectedDate.replace(/-/g, '');
    downloadCsv(`報表_${dateStr}_${supName}.csv`, csv);
  };

  if (loading) return <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'#f9fafb'}}><p className="text-gray-400">載入中...</p></div>;

  // 供應商選項：用當日 purchaseSheets 出現過的（含 __none__）
  const supplierOptions = purchaseSheets.map(s => ({ id: s.supplierId, name: s.supplierName }));

  return (
    <div style={{height:'100%',display:'flex',flexDirection:'column',background:'#f9fafb'}}>
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={()=>nav('/admin/daily')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg bg-transparent hover:bg-gray-100 transition-colors border-none"><Arrow/></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">報表列印</h1>
            <p className="text-sm text-gray-400">採購單／點貨單／CSV 匯出</p>
          </div>
        </div>
        <DatePickerWithCounts value={selectedDate} onChange={setSelectedDate} />
      </header>

      <div className="px-6 pt-4 flex gap-2">
        {([['purchase', '採購單'], ['picking', '點貨單'], ['csv', 'CSV 匯出']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors ${tab === k ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
            {lbl}
          </button>
        ))}
      </div>

      <style>{REPORT_PRINT_CSS}</style>

      <div style={{flex:1,overflowY:'auto'}}>
        <div className="p-6 max-w-5xl mx-auto">
          {/* ── 採購單 tab ── */}
          {tab === 'purchase' && (
            <>
              <div className="mb-4 flex items-center gap-3 flex-wrap">
                <label className="text-sm text-gray-600">供應商篩選：</label>
                <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
                  <option value="all">全部</option>
                  {supplierOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button onClick={purchasePrint.print}
                  disabled={filteredPurchaseSheets.length === 0}
                  className="px-4 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50">
                  列印
                </button>
              </div>
              {filteredPurchaseSheets.length === 0 && (
                <p className="text-center text-gray-400 py-12">{supplierFilter === 'all' ? '當日無待處理訂單' : '此供應商當日無訂單'}</p>
              )}
              {/* 螢幕預覽 */}
              {filteredPurchaseSheets.map(s => <PurchaseSheet key={s.supplierId} sheet={s} date={selectedDate} />)}
              {/* 列印區（隱藏） */}
              <PrintArea printRef={purchasePrint.contentRef}>
                {filteredPurchaseSheets.map(s => <PurchaseSheet key={s.supplierId} sheet={s} date={selectedDate} />)}
              </PrintArea>
            </>
          )}

          {/* ── 點貨單 tab ── */}
          {tab === 'picking' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-100">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="font-bold text-gray-800 text-sm">當日客戶（{pickingSheets.length}）</span>
                </div>
                <PickingList
                  sheets={pickingSheets}
                  selectedIds={selectedPicks}
                  onToggle={toggleSelect}
                  onPreview={setPreviewingId}
                  previewingId={previewingId}
                />
                <div className="px-4 py-3 border-t border-gray-100 flex flex-col gap-2">
                  <button
                    disabled={pickingSheets.length === 0}
                    onClick={() => { setPrintMode('all'); setTimeout(pickingAllPrint.print, 0); }}
                    className="px-3 py-1.5 bg-primary text-white text-sm rounded-lg disabled:opacity-50">
                    全部列印（{pickingSheets.length}）
                  </button>
                  <button
                    disabled={selectedPicks.size === 0}
                    onClick={() => { setPrintMode('selected'); setTimeout(pickingAllPrint.print, 0); }}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50">
                    列印選取（{selectedPicks.size}）
                  </button>
                </div>
              </div>
              <div className="md:col-span-2">
                {previewingSheet ? (
                  <div>
                    <div className="mb-2 flex justify-end">
                      <button
                        onClick={() => { setPrintMode('single'); setTimeout(pickingSinglePrint.print, 0); }}
                        className="px-3 py-1.5 bg-primary text-white text-sm rounded-lg">
                        列印此張
                      </button>
                    </div>
                    <PickingSheet sheet={previewingSheet} date={selectedDate} company={company} />
                    <PrintArea printRef={pickingSinglePrint.contentRef}>
                      <PickingSheet sheet={previewingSheet} date={selectedDate} company={company} />
                    </PrintArea>
                  </div>
                ) : (
                  <p className="text-center text-gray-400 py-12">點左側「預覽」查看單張點貨單</p>
                )}
              </div>
              {/* 全部 / 選取列印區（依 printMode 決定渲染哪些 sheet） */}
              <PrintArea printRef={pickingAllPrint.contentRef}>
                {sheetsToPrint.map(s => <PickingSheet key={s.customerId} sheet={s} date={selectedDate} company={company} />)}
              </PrintArea>
            </div>
          )}

          {/* ── CSV tab ── */}
          {tab === 'csv' && (
            <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-bold text-gray-900">CSV 匯出</h2>
              <p className="text-sm text-gray-500">將當日訂單明細匯出為對接系統用 CSV（UTF-8 with BOM、CRLF）。</p>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm text-gray-600">供應商篩選：</label>
                <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
                  <option value="all">全部</option>
                  {supplierOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button
                  disabled={filteredPurchaseSheets.length === 0}
                  onClick={downloadCurrentCsv}
                  className="px-4 py-1.5 bg-primary text-white text-sm rounded-lg disabled:opacity-50">
                  下載 CSV
                </button>
              </div>
              <div className="text-xs text-gray-400">
                預估列數：{filteredPurchaseSheets.reduce((s, sh) => s + sh.products.reduce((p, b) => p + b.rows.length, 0), 0)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add vfs/admin/src/pages/admin/ReportsPage.tsx
git commit -m "feat(reports): ReportsPage — 三 tab 整合採購單、點貨單、CSV 匯出"
```

---

## Task 12: 新增 route 與 Dashboard 入口卡

**Files:**
- Modify: `vfs/admin/src/App.tsx`
- Modify: `vfs/admin/src/pages/admin/DashboardPage.tsx`

- [ ] **Step 1: App.tsx 加 route**

在 `App.tsx` import 區塊加：
```tsx
import ReportsPage from "./pages/admin/ReportsPage";
```
在 routes 區塊（`/admin/daily/delivery` 之後、`/admin/settings` 之前）加：
```tsx
<Route path="/admin/daily/reports" element={<ReportsPage />} />
```

- [ ] **Step 2: DashboardPage 加入口**

在 `DashboardPage.tsx` 的 `steps` 陣列尾端追加：
```tsx
{step:'6',label:'報表列印',desc:'採購單／點貨單／CSV',href:'/admin/daily/reports',count:0},
```
然後 grid `grid-cols-2 md:grid-cols-5` 改為 `md:grid-cols-6`（讓 6 張卡並排）。

- [ ] **Step 3: Commit**

```bash
git add vfs/admin/src/App.tsx vfs/admin/src/pages/admin/DashboardPage.tsx
git commit -m "feat(reports): 新增 /admin/daily/reports route 與 dashboard 入口卡"
```

---

## Task 13: SettingsPage 公司資訊欄位

**Files:**
- Modify: `vfs/admin/src/pages/admin/SettingsPage.tsx`

新增「公司資訊」section，存到 `x_app_settings` 的 `company_info` key（value 為 JSON 字串）。

- [ ] **Step 1: 加 state 與載入**

在 `SettingsPage.tsx` 既有 state 區塊加：
```tsx
type CompanyInfoSetting = { id: string; value: string } | null;
const KEY_COMPANY = 'company_info';

const [company, setCompany] = useState<CompanyInfoSetting>(null);
const [companyName, setCompanyName] = useState('');
const [companyPhone, setCompanyPhone] = useState('');
const [companyFax, setCompanyFax] = useState('');
const [companyBusy, setCompanyBusy] = useState(false);
```

修改 `load` 函式，在解析 `rawSettings` 時加：
```tsx
const co = (rawSettings || []).find((r: any) => (r.data?.key || r.key) === KEY_COMPANY);
if (co) {
  const d = co.data || co;
  setCompany({ id: String(co.id || d.id), value: String(d.value || '') });
  try {
    const parsed = JSON.parse(d.value || '{}');
    setCompanyName(parsed.name || '');
    setCompanyPhone(parsed.phone || '');
    setCompanyFax(parsed.fax || '');
  } catch { /* ignore */ }
}
```

- [ ] **Step 2: 加儲存函式**

```tsx
const saveCompany = async () => {
  setCompanyBusy(true);
  try {
    const payload = JSON.stringify({ name: companyName.trim(), phone: companyPhone.trim(), fax: companyFax.trim() });
    const now = new Date().toISOString();
    if (company) {
      await db.updateCustom(company.id, { key: KEY_COMPANY, value: payload, updated_at: now });
    } else {
      const created = await db.insertCustom('x_app_settings', { key: KEY_COMPANY, value: payload, updated_at: now });
      setCompany({ id: String(created?.id || ''), value: payload });
    }
    alert('已儲存公司資訊');
  } catch (e: any) { alert(e?.message || '儲存失敗'); }
  finally { setCompanyBusy(false); }
};
```

- [ ] **Step 3: 在 JSX 加 section**

在 `<section>` 截止時間之後、假日管理之前插入：
```tsx
<section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
  <h2 className="text-lg font-bold text-gray-900">公司資訊</h2>
  <p className="text-sm text-gray-500">將顯示在點貨單抬頭。</p>
  {loading ? <p className="text-sm text-gray-400">載入中...</p> : (
    <div className="space-y-2">
      <input type="text" placeholder="公司名稱（如：雄泉鮮食企業股份有限公司）" value={companyName}
        onChange={e => setCompanyName(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700" />
      <input type="text" placeholder="連絡電話" value={companyPhone}
        onChange={e => setCompanyPhone(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700" />
      <input type="text" placeholder="傳真號碼" value={companyFax}
        onChange={e => setCompanyFax(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700" />
      <button onClick={saveCompany} disabled={companyBusy}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
        {companyBusy ? '儲存中...' : '儲存'}
      </button>
    </div>
  )}
</section>
```

- [ ] **Step 4: Commit**

```bash
git add vfs/admin/src/pages/admin/SettingsPage.tsx
git commit -m "feat(settings): 公司資訊欄位（給點貨單抬頭使用）"
```

---

## Task 14: 部署 dev 並跑 self-test

**Files:** N/A（驗證 task）

- [ ] **Step 1: 部署 VFS（不發布）**

```bash
cd /home/username/桌面/fde-sc1984
set -a && source .env && set +a
python3 vfs/scripts/deploy_admin.py --no-publish
```

`--no-publish` 已是 `deploy_admin.py` 內建 flag，會跑「登入 → 設定 refs → 上傳 VFS → 編譯驗證」四步，跳過 publish。

Expected: `編譯驗證: 200 success=True`，無 TS 錯誤。

- [ ] **Step 2: 在瀏覽器跑 self-test**

打開 admin 頁面，devtools console：
```js
window.__runReportDataSelfTest()
window.__runCsvExportSelfTest()
```
Expected: 兩個都印 🎉。

注意：`reportData.selftest.ts` / `csvExport.selftest.ts` 預設不會被任何元件 import，需要在 `main.tsx` 暫時加 `import './utils/reportData.selftest'; import './utils/csvExport.selftest';` 一次驗證後移除。

→ **加更明確的開法**：把這兩 import 寫進 plan，跑完 self-test 後刪除：

```tsx
// vfs/admin/src/main.tsx — 暫時加
import './utils/reportData.selftest';
import './utils/csvExport.selftest';
```

驗證完後刪除這兩行，commit：
```bash
git add vfs/admin/src/main.tsx
git commit -m "chore(reports): 移除 dev self-test import"
```

---

## Task 15: Playwright E2E 驗證

**Files:** N/A（手動驗證）

依 `superpowers:browser-testing` skill 操作；以下是必驗收項。

- [ ] **Step 1: 確認入口**

打開 `/admin/daily`，看到第 6 張卡「報表列印」。點進去，URL 變 `/admin/daily/reports?tab=purchase`。

- [ ] **Step 2: 採購單 tab**

- 看到當日訂單依供應商分組顯示，每張一個 supplier header（含「未設定供應商」殿後）。
- 切換供應商下拉 → 只剩選中那張（或顯示「此供應商當日無訂單」）。
- 按「列印」→ 開新視窗，雙欄列印預覽，每張一頁。

- [ ] **Step 3: 點貨單 tab**

- 左側看到當日客戶清單（路線代號排序）。
- 點某客戶「預覽」→ 右側顯示該張點貨單。
- 公司資訊未設定 → 預覽出現「公司資訊尚未設定」警示。去設定頁填寫後 reload，警示消失，header 顯示公司名/電話/傳真。
- 「全部列印」→ 開新視窗印當日所有點貨單。
- 勾選 2 個客戶 → 「列印選取」→ 只印這 2 張。
- 預覽中按「列印此張」→ 只印當前那一張。

- [ ] **Step 4: CSV tab**

- 點「下載 CSV」→ 下載 `報表_20260429_全部.csv`。
- 用 Excel 開啟：中文不亂碼、5 欄、行數 = 預估列數。
- 篩特定供應商 → 下載檔名是 `報表_20260429_C02 廣A中央.csv`（檔名違法字元被換 `_`）。
- 用文字編輯器確認：第一個 byte 是 BOM（`EF BB BF`），行尾 CRLF。

- [ ] **Step 5: 邊界**

- 換到沒任何 draft 訂單的日期 → 三 tab 都顯示「當日無待處理訂單」，列印／下載 disabled。
- 切換日期 → 篩選器與資料同步更新。

驗證全通過後：

```bash
git status   # 確認沒有殘留 self-test import
```

---

## Task 16: 發布到 production

**Files:** N/A

驗證一切無誤後再發布。

- [ ] **Step 1: 完整 deploy**

```bash
cd /home/username/桌面/fde-sc1984
set -a && source .env && set +a
python3 vfs/scripts/deploy_admin.py
```

Expected: 編譯驗證、發布兩步皆 200。

- [ ] **Step 2: production smoke test**

回 admin 後台（已 publish 版），重複 Task 15 的關鍵步驟：採購單列印、點貨單預覽、CSV 下載各一次。

- [ ] **Step 3: 推送 branch 並發 PR（如需）**

```bash
git push -u origin feat/daily-reports
gh pr create --title "feat(reports): 每日報表頁（採購單／點貨單／CSV）" --body "$(cat <<'EOF'
## Summary
- 新增 /admin/daily/reports 頁，三 tab：採購單／點貨單／CSV 匯出
- 採購單按供應商分組、雙欄列印；CSV 為 UTF-8 BOM 給外部系統匯入
- 點貨單支援單張預覽、勾選列印、全部列印
- SettingsPage 補公司資訊欄位（點貨單抬頭用）

## Test plan
- [x] 採購單依供應商分組與排序正確
- [x] 點貨單三種列印模式（全部 / 選取 / 單張）
- [x] CSV BOM、CRLF、跳脫、檔名與供應商篩選
- [x] 邊界：當日 0 筆訂單、未指定供應商歸 __none__、公司資訊未設定

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---
