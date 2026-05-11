// vfs/admin/src/components/reports/PurchaseSheetPaged.tsx
// 採購單列印佈局：JS 兩階段測量分頁。
// 業務規則：
//   - 一張 A4 = 一個廠商 = 一個單號（不跨廠商）
//   - 一張 A4 內部分左右兩欄擺更多品項
//   - 單一廠商超過一張 A4 時延伸到第二張、第三張，仍是同一廠商同一單號
// 演算法：
//   - 第一階段（measure）：用 Portal 把 supplier overhead（supplier-meta + supplier-header）、
//     table-header、每個攤平 row 渲染到隱形容器（width=A4 一欄寬），useEffect 量 offsetHeight
//   - 第二階段（packing）：對每個 sheet 獨立做兩欄裝箱
//       欄高度上限 = PAGE_CONTENT_PX - supplierOverhead - tableHeader（每張 A4 兩欄共享同一 supplier 區，
//       但每欄各自有 table-header）
//       row 級切點，.report-row 已有 break-inside: avoid
//   - 切換到下個廠商一定換新 A4
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PurchaseSheet as Sheet } from '../../utils/reportData';

interface CompanyInfo { name: string; phone: string; fax: string; }

interface Props {
  sheets: Sheet[];
  date: string;
  company: CompanyInfo | null;
}

interface FlatRow {
  sheetIdx: number;
  customerCode: string;
  productName: string;
  qty: number;
  uom: string;
  note: string;
}

interface PageContent {
  sheetIdx: number;
  left: number[];   // 指向 flatRows 的全域索引
  right: number[];
}

interface Measured {
  supOH: number[];   // 每個 sheet 的 supplier overhead px
  tblHdr: number;    // table-header px（單值，所有欄共用）
  rowH: number[];    // 每個 flatRow 的高度 px
}

// A4 297 - @page margin 上下 24 - body padding 上下 ~10 - page-header(公司名+border) ~9 ≈ 254；
// 取 240 給字型 metrics 偏差 / sub-pixel rounding 留 buffer，搭配 break-inside: avoid 確保不跨頁
const PAGE_CONTENT_MM = 240;
const MM_TO_PX = 96 / 25.4;
const PAGE_CONTENT_PX = PAGE_CONTENT_MM * MM_TO_PX;
// A4 210 - @page margin 左右 30 - body padding 左右 ~10 = 170；雙欄 + gap 8mm → 一欄 ≈ 81；取 80
const COLUMN_WIDTH_MM = 80;

// 模擬列印環境的 className-only CSS（注入 portal 內 <style>，不污染 main window）
const MEASURE_CSS = `
.supplier-meta { display: flex; justify-content: space-between; gap: 8pt; font-size: 10pt; padding-bottom: 2pt; }
.supplier-header { font-weight: bold; font-size: 11pt; padding: 0 0 4pt; border-bottom: 1pt solid #000; margin-bottom: 4pt; }
.supplier-header .meta { font-weight: normal; font-size: 9pt; }
.report-table-header { display: grid; grid-template-columns: 4em 1fr 4em 4em 1fr; gap: 4pt; padding: 3pt 0; margin-bottom: 4pt; border-bottom: 1pt solid #000; font-weight: bold; font-size: 10pt; }
.report-row { display: grid; grid-template-columns: 4em 1fr 4em 4em 1fr; gap: 4pt; padding: 1pt 0; }
.report-row .note { font-size: 9pt; }
`;

function flatten(sheets: Sheet[]): FlatRow[] {
  const out: FlatRow[] = [];
  sheets.forEach((s, sheetIdx) => {
    s.products.forEach(b => {
      b.rows.forEach(r => {
        out.push({
          sheetIdx,
          customerCode: r.customerCode,
          productName: b.productName,
          qty: r.qty,
          uom: r.uom || b.uom,
          note: r.note,
        });
      });
    });
  });
  return out;
}

function packSheetRows(globalIndices: number[], rowH: number[], colLimitPx: number, sheetIdx: number): PageContent[] {
  const pages: PageContent[] = [];
  let cur: PageContent = { sheetIdx, left: [], right: [] };
  let curCol: 'left' | 'right' = 'left';
  let used = 0;
  for (const gi of globalIndices) {
    const h = rowH[gi];
    const arr = curCol === 'left' ? cur.left : cur.right;
    if (used + h > colLimitPx && arr.length > 0) {
      if (curCol === 'left') {
        curCol = 'right';
      } else {
        pages.push(cur);
        cur = { sheetIdx, left: [], right: [] };
        curCol = 'left';
      }
      used = 0;
    }
    if (curCol === 'left') cur.left.push(gi);
    else cur.right.push(gi);
    used += h;
  }
  if (cur.left.length > 0 || cur.right.length > 0) pages.push(cur);
  return pages;
}

export default function PurchaseSheetPaged({ sheets, date, company }: Props) {
  const dateNum = date.replace(/-/g, '');
  const measureRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);

  const flatRows = flatten(sheets);
  const docNoFor = (i: number) => `${dateNum}${String(i + 1).padStart(3, '0')}`;

  useEffect(() => {
    setMeasured(null);
  }, [sheets, date]);

  useEffect(() => {
    if (measured !== null) return;
    const ref = measureRef.current;
    if (!ref) return;
    const sups = ref.querySelectorAll<HTMLElement>('[data-measure="sup"]');
    const tbl = ref.querySelector<HTMLElement>('[data-measure="tbl"]');
    const rows = ref.querySelectorAll<HTMLElement>('[data-measure="row"]');
    if (sups.length !== sheets.length) return;
    if (!tbl) return;
    if (rows.length !== flatRows.length) return;
    setMeasured({
      supOH: Array.from(sups).map(h => h.offsetHeight),
      tblHdr: tbl.offsetHeight,
      rowH: Array.from(rows).map(r => r.offsetHeight),
    });
  }, [measured, sheets.length, flatRows.length]);

  if (sheets.length === 0) return null;

  // 第一階段
  if (measured === null) {
    return createPortal(
      <div
        ref={measureRef}
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '-9999px',
          width: `${COLUMN_WIDTH_MM}mm`,
          fontFamily: '"Noto Sans TC", "Microsoft JhengHei", sans-serif',
          fontSize: '10pt',
          lineHeight: 1.4,
          color: '#000',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <style>{MEASURE_CSS}</style>
        {sheets.map((sheet, i) => (
          <div key={`s${i}`} data-measure="sup" data-sheet-idx={i}>
            <div className="supplier-meta">
              <span>出貨日期：{date}</span>
              <span>單號：{docNoFor(i)}</span>
            </div>
            <div className="supplier-header">
              廠商名稱：{sheet.supplierName} <span className="meta">（{sheet.products.length} 品項）</span>
            </div>
          </div>
        ))}
        <div data-measure="tbl">
          <div className="report-table-header">
            <span>客戶</span>
            <span>品名規格</span>
            <span className="num">數量</span>
            <span>單位</span>
            <span>備註</span>
          </div>
        </div>
        {flatRows.map((row, i) => (
          <div key={`r${i}`} data-measure="row" data-row-idx={i}>
            <div className="report-row">
              <span>{row.customerCode}</span>
              <span>{row.productName}</span>
              <span className="num">{row.qty.toFixed(2)}</span>
              <span>{row.uom}</span>
              <span className="note">{row.note}</span>
            </div>
          </div>
        ))}
      </div>,
      document.body
    );
  }

  // 第二階段：對每個 sheet 獨立 packing
  const indexBySheet: number[][] = sheets.map(() => []);
  flatRows.forEach((r, i) => indexBySheet[r.sheetIdx].push(i));

  const allPages: PageContent[] = [];
  for (let s = 0; s < sheets.length; s++) {
    const indices = indexBySheet[s];
    if (indices.length === 0) continue;
    const colLimit = PAGE_CONTENT_PX - measured.supOH[s] - measured.tblHdr;
    const pages = packSheetRows(indices, measured.rowH, colLimit, s);
    pages.forEach(p => allPages.push(p));
  }

  return (
    <>
      {allPages.map((page, idx) => {
        const sheet = sheets[page.sheetIdx];
        return (
          <div key={idx} className="purchase-page">
            {company?.name && (
              <div className="purchase-page-header">
                <div className="report-company">{company.name}</div>
              </div>
            )}
            <div className="supplier-meta">
              <span>出貨日期：{date}</span>
              <span>單號：{docNoFor(page.sheetIdx)}</span>
            </div>
            <div className="supplier-header">
              廠商名稱：{sheet.supplierName} <span className="meta">（{sheet.products.length} 品項）</span>
            </div>
            <div className="purchase-row">
              <div className="purchase-half">
                <div className="report-table-header">
                  <span>客戶</span>
                  <span>品名規格</span>
                  <span className="num">數量</span>
                  <span>單位</span>
                  <span>備註</span>
                </div>
                {page.left.map(gi => {
                  const r = flatRows[gi];
                  return (
                    <div key={gi} className="report-row">
                      <span>{r.customerCode}</span>
                      <span>{r.productName}</span>
                      <span className="num">{r.qty.toFixed(2)}</span>
                      <span>{r.uom}</span>
                      <span className="note">{r.note}</span>
                    </div>
                  );
                })}
              </div>
              <div className="purchase-half">
                <div className="report-table-header">
                  <span>客戶</span>
                  <span>品名規格</span>
                  <span className="num">數量</span>
                  <span>單位</span>
                  <span>備註</span>
                </div>
                {page.right.map(gi => {
                  const r = flatRows[gi];
                  return (
                    <div key={gi} className="report-row">
                      <span>{r.customerCode}</span>
                      <span>{r.productName}</span>
                      <span className="num">{r.qty.toFixed(2)}</span>
                      <span>{r.uom}</span>
                      <span className="note">{r.note}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
