// vfs/admin/src/components/reports/reportPaging.ts
// 列印分頁共用工具：採購單／點貨單共用同一份頁面尺寸常數與 packing 演算法。
// 修改任一常數請以這份為單一來源（兩處測量值若漂移會導致分頁誤差）。

// A4 297mm - @page margin 上下 24 - body padding ~10 - page-header(公司名+border) ~9 ≈ 254；
// 取 240 給字型 metrics 偏差 / sub-pixel rounding 留 buffer。
export const PAGE_CONTENT_MM = 240;
export const MM_TO_PX = 96 / 25.4;
export const PAGE_CONTENT_PX = PAGE_CONTENT_MM * MM_TO_PX;
// A4 210mm - @page margin 左右 30 - body padding ~10 = 170；雙欄 + gap 8mm → 一欄 ≈ 81，取 80。
export const COLUMN_WIDTH_MM = 80;

export interface PageContent { left: number[]; right: number[]; }

/**
 * 把 row 索引依照高度與 column 上限 pack 成多頁雙欄結構。
 * 規則：左欄填到 colLimit 才換右欄、右欄填到 colLimit 才換新頁。
 *
 * @param rowH        每個 row 的量測高度（px）
 * @param colLimit    一欄可用高度（px）
 * @param indices     可選，指定要 pack 的 row 索引子集（給「每 sheet 獨立 packing」用）；
 *                    省略時對 rowH 全部 row 跑。
 * @returns 多頁，每頁含 left/right 兩個 row index 陣列
 */
export function packIntoPages(rowH: number[], colLimit: number, indices?: number[]): PageContent[] {
  const order = indices ?? rowH.map((_, i) => i);
  const pages: PageContent[] = [];
  let cur: PageContent = { left: [], right: [] };
  let curCol: 'left' | 'right' = 'left';
  let used = 0;
  for (const i of order) {
    const h = rowH[i];
    const arr = curCol === 'left' ? cur.left : cur.right;
    if (used + h > colLimit && arr.length > 0) {
      if (curCol === 'left') {
        curCol = 'right';
      } else {
        pages.push(cur);
        cur = { left: [], right: [] };
        curCol = 'left';
      }
      used = 0;
    }
    if (curCol === 'left') cur.left.push(i);
    else cur.right.push(i);
    used += h;
  }
  if (cur.left.length > 0 || cur.right.length > 0) pages.push(cur);
  return pages;
}
