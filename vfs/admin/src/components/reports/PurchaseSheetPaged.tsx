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
import { REPORT_PRINT_CSS } from './reportPrintCss';
import { PAGE_CONTENT_PX, COLUMN_WIDTH_MM, packIntoPages, type PageContent as BasePageContent } from './reportPaging';

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

// 採購單一頁帶 sheetIdx（多供應商分頁時用來把 page 對應回 sheet）；BasePageContent 來自 reportPaging。
type PageContent = BasePageContent & { sheetIdx: number };

interface Measured {
  supOH: number[];   // 每個 sheet 的 supplier overhead px
  tblHdr: number;    // table-header px（單值，所有欄共用）
  rowH: number[];    // 每個 flatRow 的高度 px
}

// 頁面尺寸常數與 packing 演算法集中在 reportPaging.ts，採購單／點貨單共用。
// 測量階段共用 reportPrintCss（單一 source of truth），避免測量寬度跟實際渲染寬度不一致導致分頁誤差。

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
  return packIntoPages(rowH, colLimitPx, globalIndices).map(p => ({ ...p, sheetIdx }));
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
        <style>{REPORT_PRINT_CSS}</style>
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
