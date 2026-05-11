// vfs/admin/src/utils/reportData.selftest.ts
// 用法：在瀏覽器 devtools 執行 import('./utils/reportData.selftest')
//      或在實作期間 main.tsx 暫時 import 一次跑完看 console。

import { buildPurchaseSheets, buildPickingSheets, customerCode, lineNote, lineUom } from './reportData';

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

  // ── buildPurchaseSheets ──
  const fixture = {
    orders: [
      { id: 'o1', customer_id: 'c1', state: 'draft' },
      { id: 'o2', customer_id: 'c2', state: 'draft' },
    ],
    orderLines: [
      { id: 'l1', order_id: 'o1', product_template_id: 'p1', name: '綠節瓜',  product_uom_qty: 1.0, custom_data: { note: '直徑3-4cm' }, delivery_date: '2026-04-29' },
      { id: 'l2', order_id: 'o2', product_template_id: 'p1', name: '綠節瓜',  product_uom_qty: 2.5, custom_data: {}, delivery_date: '2026-04-29' },
      { id: 'l3', order_id: 'o1', product_template_id: 'p2', name: '巴西里',  product_uom_qty: 0.5, custom_data: {}, delivery_date: '2026-04-29' },
      { id: 'l4', order_id: 'o2', product_template_id: 'p3', name: '無供應商品', product_uom_qty: 1.0, custom_data: {}, delivery_date: '2026-04-29' },
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

  // ── buildPickingSheets ──
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

  console.log('🎉 reportData helpers self-test passed');
}

if (typeof window !== 'undefined') {
  (window as any).__runReportDataSelfTest = runReportDataSelfTest;
}
