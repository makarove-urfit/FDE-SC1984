// vfs/admin/src/components/reports/PurchaseSheetPaged.tsx
// 採購單列印佈局：JS 兩階段測量 + row 級分頁。
//   - 第一階段（measure）：用 Portal 把每個 sheet 的 header overhead（meta + supplier-header
//     + table-header）和每個攤平 row 渲染到隱形容器（width=A4 一欄寬），useEffect 量 offsetHeight
//   - 第二階段（packing）：以 row 為 atomic 單位裝箱
//       同 sheet 連續 row 不重複扣 overhead；換欄/頁、或切到下個 sheet 時重印 supplier
//       header + table-header（新欄/頁第一個 segment 一定要重印）
//   - 切點限制在 row 邊界（.report-row 已有 break-inside: avoid）；單一 row 高過一欄
//     才會自然跨頁，正常資料不會發生
//   - 接續欄不加「(續)」字樣，照印原 supplier-header
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

interface Segment {
  sheetIdx: number;
  rowIndices: number[];   // 指向 flatRows 的索引
}

interface PageLayout {
  left: Segment[];
  right: Segment[];
}

// 一欄可用高度（mm）：A4 297 - @page 上下 margin 24 - body padding 上下 ~10 - page-header ~9 ≈ 254；取 250 留緩衝
const COLUMN_HEIGHT_MM = 250;
const MM_TO_PX = 96 / 25.4;
const COLUMN_HEIGHT_PX = COLUMN_HEIGHT_MM * MM_TO_PX;
// 一欄寬：A4 210 - @page 左右 margin 30 - body padding 左右 ~10 = 170；雙欄 + gap 8 → 一欄 ≈ 81；保守 88 略寬一點
const COLUMN_WIDTH_MM = 88;

// 模擬列印環境的 className-only CSS（注入 portal 內 <style>，不污染 main window）
const MEASURE_CSS = `
.supplier-meta { display: flex; justify-content: space-between; gap: 8pt; font-size: 10pt; padding-bottom: 2pt; }
.supplier-header { font-weight: bold; font-size: 11pt; padding: 0 0 4pt; border-bottom: 1pt solid #000; margin-bottom: 4pt; }
.supplier-header .meta { font-weight: normal; font-size: 9pt; }
.report-table-header { display: grid; grid-template-columns: 4em 1fr 4em 4em 1fr; gap: 4pt; padding: 3pt 0; margin-bottom: 4pt; border-bottom: 1pt solid #000; font-weight: bold; font-size: 10pt; }
.report-row { display: grid; grid-template-columns: 4em 1fr 4em 4em 1fr; gap: 4pt; padding: 1pt 0; }
.report-row .note { font-size: 9pt; }
.measure-overhead { padding-bottom: 0; }
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

export default function PurchaseSheetPaged({ sheets, date, company }: Props) {
  const dateNum = date.replace(/-/g, '');
  const measureRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{ overhead: number[]; rowH: number[] } | null>(null);

  const flatRows = flatten(sheets);
  const docNoFor = (i: number) => `${dateNum}${String(i + 1).padStart(3, '0')}`;

  // sheets/date 變動 → 重置觸發重量
  useEffect(() => {
    setMeasured(null);
  }, [sheets, date]);

  // 每次 render 後檢查：portal DOM mount 完整就量
  useEffect(() => {
    if (measured !== null) return;
    const ref = measureRef.current;
    if (!ref) return;
    const headers = ref.querySelectorAll<HTMLElement>('[data-measure="header"]');
    const rows = ref.querySelectorAll<HTMLElement>('[data-measure="row"]');
    if (headers.length !== sheets.length) return;
    if (rows.length !== flatRows.length) return;
    const overhead = Array.from(headers).map(h => h.offsetHeight);
    const rowH = Array.from(rows).map(r => r.offsetHeight);
    setMeasured({ overhead, rowH });
  });

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
          <div key={`h${i}`} data-measure="header" data-sheet-idx={i} className="measure-overhead">
            <div className="supplier-meta">
              <span>出貨日期：{date}</span>
              <span>單號：{docNoFor(i)}</span>
            </div>
            <div className="supplier-header">
              廠商名稱：{sheet.supplierName} <span className="meta">（{sheet.products.length} 品項）</span>
            </div>
            <div className="report-table-header">
              <span>客戶</span>
              <span>品名規格</span>
              <span className="num">數量</span>
              <span>單位</span>
              <span>備註</span>
            </div>
          </div>
        ))}
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

  // 第二階段：packing
  const { overhead, rowH } = measured;
  const pages: PageLayout[] = [];
  let curPage: PageLayout = { left: [], right: [] };
  let curCol: 'left' | 'right' = 'left';
  let used = 0;
  let curSegment: Segment | null = null;

  const colSegs = () => (curCol === 'left' ? curPage.left : curPage.right);

  for (let i = 0; i < flatRows.length; i++) {
    const row = flatRows[i];
    const sheetIdx = row.sheetIdx;
    const sameSheet = curSegment !== null && curSegment.sheetIdx === sheetIdx;
    const cost = (sameSheet ? 0 : overhead[sheetIdx]) + rowH[i];
    const colHasContent = colSegs().length > 0;

    if (used + cost > COLUMN_HEIGHT_PX && colHasContent) {
      if (curCol === 'left') {
        curCol = 'right';
      } else {
        pages.push(curPage);
        curPage = { left: [], right: [] };
        curCol = 'left';
      }
      used = 0;
      curSegment = null;
    }

    const needHeader = curSegment === null || curSegment.sheetIdx !== sheetIdx;
    if (needHeader) {
      const seg: Segment = { sheetIdx, rowIndices: [i] };
      colSegs().push(seg);
      curSegment = seg;
      used += overhead[sheetIdx] + rowH[i];
    } else {
      curSegment!.rowIndices.push(i);
      used += rowH[i];
    }
  }
  if (curPage.left.length > 0 || curPage.right.length > 0) pages.push(curPage);

  const renderColumn = (segs: Segment[]) => (
    <div className="purchase-half">
      {segs.map((seg, idx) => {
        const sheet = sheets[seg.sheetIdx];
        return (
          <div key={idx} className="supplier-section">
            <div className="supplier-meta">
              <span>出貨日期：{date}</span>
              <span>單號：{docNoFor(seg.sheetIdx)}</span>
            </div>
            <div className="supplier-header">
              廠商名稱：{sheet.supplierName} <span className="meta">（{sheet.products.length} 品項）</span>
            </div>
            <div className="report-table-header">
              <span>客戶</span>
              <span>品名規格</span>
              <span className="num">數量</span>
              <span>單位</span>
              <span>備註</span>
            </div>
            <div>
              {seg.rowIndices.map(ri => {
                const r = flatRows[ri];
                return (
                  <div key={ri} className="report-row">
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
        );
      })}
    </div>
  );

  return (
    <>
      {pages.map((page, idx) => (
        <div key={idx} className="purchase-page">
          {company?.name && (
            <div className="purchase-page-header">
              <div className="report-company">{company.name}</div>
            </div>
          )}
          <div className="purchase-row">
            {renderColumn(page.left)}
            {renderColumn(page.right)}
          </div>
        </div>
      ))}
    </>
  );
}
