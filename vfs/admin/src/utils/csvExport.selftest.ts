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
  assert(csv.includes('F75品串,初秋高麗A*,1.99,千克,"長20cm,勿粗"\r\n'),
    '含逗號的欄位用引號包起來');
  assert(csv.includes('"備註含""引號""與\n換行"'), '雙引號跳脫成 ""，換行保留在引號內');

  console.log('🎉 csvExport self-test passed');
}

if (typeof window !== 'undefined') {
  (window as any).__runCsvExportSelfTest = runCsvExportSelfTest;
}
