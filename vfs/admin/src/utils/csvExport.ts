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
