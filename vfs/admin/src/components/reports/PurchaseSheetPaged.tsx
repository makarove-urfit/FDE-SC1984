// vfs/admin/src/components/reports/PurchaseSheetPaged.tsx
// 採購單列印佈局：JS 兩階段測量分頁。
//   - 第一階段：用 Portal 把所有 supplier-section 渲染到隱形容器（width=A4 一欄寬），
//     useEffect 量每個 .supplier-section 的 offsetHeight
//   - 第二階段：用實測高度做 packing — 每張 .purchase-page 兩欄、欄高上限 = A4 一欄可用高
//     依序塞 sections 到「左欄」，超欄高度則跳「右欄」、再跳下一張 .purchase-page
//   - 切點限制在 supplier-section 邊界（整個 section 不切）；單一 section 高過一欄
//     會自然跨欄/頁，不額外加「（續）」標記
//   - 每張 .purchase-page 自帶 page-header（公司名）— 列印時每張紙頂端都有
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PurchaseSheet as Sheet } from '../../utils/reportData';
import PurchaseSheet from './PurchaseSheet';

interface CompanyInfo { name: string; phone: string; fax: string; }

interface Props {
  sheets: Sheet[];
  date: string;
  company: CompanyInfo | null;
}

interface PageLayout {
  left: number[];   // section indexes
  right: number[];
}

// 一欄可用高度（mm）：
//   A4 高 297 - @page margin 上下各 12 = 273
//   - body padding 上下各 ~5.3 (15pt) = 262
//   - page-header（公司名 14pt + padding/margin/border ≈ 26pt ≈ 9mm）= 253
// 取 250 留些緩衝
const COLUMN_HEIGHT_MM = 250;
const MM_TO_PX = 96 / 25.4;
const COLUMN_HEIGHT_PX = COLUMN_HEIGHT_MM * MM_TO_PX;

// A4 寬 210 - @page margin 左右各 15 - body padding 左右各 ~5.3 = 184mm
// 兩欄 + column-gap 8mm → 一欄寬 (184-8)/2 = 88mm
const COLUMN_WIDTH_MM = 88;

// 模擬列印環境的 className-only CSS（注入到 portal 內 <style>，不污染 main window 全域）
// font-family / font-size / line-height 用 inline style 套到 measure 容器 root
const MEASURE_CSS = `
.supplier-section { padding-bottom: 6pt; }
.supplier-meta { display: flex; justify-content: space-between; gap: 8pt; font-size: 10pt; padding-bottom: 2pt; }
.supplier-header { font-weight: bold; font-size: 11pt; padding: 0 0 4pt; border-bottom: 1pt solid #000; margin-bottom: 4pt; }
.supplier-header .meta { font-weight: normal; font-size: 9pt; }
.report-product-block { margin-bottom: 4pt; }
.report-product-block + .report-product-block { border-top: 0.5pt dashed #999; padding-top: 3pt; }
.report-table-header { display: grid; grid-template-columns: 4em 1fr 4em 4em 1fr; gap: 4pt; padding: 3pt 0; margin-bottom: 4pt; border-bottom: 1pt solid #000; font-weight: bold; font-size: 10pt; }
.report-row { display: grid; grid-template-columns: 4em 1fr 4em 4em 1fr; gap: 4pt; padding: 1pt 0; }
.report-row .note { font-size: 9pt; }
`;

export default function PurchaseSheetPaged({ sheets, date, company }: Props) {
  const dateNum = date.replace(/-/g, '');
  const measureRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<number[] | null>(null);

  // sheets/date 變動 → 重置 heights 觸發重新量
  useEffect(() => {
    setHeights(null);
  }, [sheets, date]);

  // 每次 render 後檢查：若處於量值階段且 portal DOM 已 mount，量並 setHeights
  useEffect(() => {
    if (heights !== null) return;
    const ref = measureRef.current;
    if (!ref) return;
    const sections = ref.querySelectorAll('.supplier-section');
    if (sections.length !== sheets.length) return;   // portal 尚未渲染完成
    const hs = Array.from(sections).map(s => (s as HTMLElement).offsetHeight);
    setHeights(hs);
  });

  if (sheets.length === 0) return null;

  const docNoFor = (i: number) => `${dateNum}${String(i + 1).padStart(3, '0')}`;

  // 第一階段：渲染隱形容器到 document.body 量高度
  if (heights === null) {
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
          <PurchaseSheet
            key={i}
            sheet={sheet}
            date={date}
            docNo={docNoFor(i)}
          />
        ))}
      </div>,
      document.body
    );
  }

  // 第二階段：用實測高度 packing
  const pages: PageLayout[] = [];
  let cur: PageLayout = { left: [], right: [] };
  let col: 'left' | 'right' = 'left';
  let used = 0;

  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    const colHasContent = (col === 'left' && cur.left.length > 0) || (col === 'right' && cur.right.length > 0);
    if (used + h > COLUMN_HEIGHT_PX && colHasContent) {
      // 當前欄裝不下且不是空的 → 換下一欄/頁
      if (col === 'left') {
        col = 'right';
        used = 0;
      } else {
        pages.push(cur);
        cur = { left: [], right: [] };
        col = 'left';
        used = 0;
      }
    }
    if (col === 'left') cur.left.push(i);
    else cur.right.push(i);
    used += h;
  }
  if (cur.left.length > 0 || cur.right.length > 0) pages.push(cur);

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
            <div className="purchase-half">
              {page.left.map(i => (
                <PurchaseSheet
                  key={i}
                  sheet={sheets[i]}
                  date={date}
                  docNo={docNoFor(i)}
                />
              ))}
            </div>
            <div className="purchase-half">
              {page.right.map(i => (
                <PurchaseSheet
                  key={i}
                  sheet={sheets[i]}
                  date={date}
                  docNo={docNoFor(i)}
                />
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
