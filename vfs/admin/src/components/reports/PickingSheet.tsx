// vfs/admin/src/components/reports/PickingSheet.tsx
// 點貨單列印佈局：JS 兩階段測量分頁。仿 PurchaseSheetPaged 的 packing 演算法。
// 業務規則：
//   - 一張 picking sheet = 一條路線（含路線下所有客戶的品項，攤平成 row）
//   - 列印時左右兩欄，左欄填滿才到右欄、右欄填滿才換新頁（避免左欄半滿就跳右欄）
//   - 同路線跨頁時每頁重複 sheet header + column header
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PickingSheet as Sheet, PickingRow } from '../../utils/reportData';
import { REPORT_PRINT_CSS } from './reportPrintCss';
import { PAGE_CONTENT_PX, COLUMN_WIDTH_MM, packIntoPages } from './reportPaging';

interface CompanyInfo { name: string; phone: string; fax: string; }

interface Props {
  sheet: Sheet;
  date: string;
  company: CompanyInfo | null;
}

interface FlatRow extends PickingRow { customerCode: string; }

interface Measured {
  headerH: number;
  tblHdrH: number;
  rowH: number[];
}

function flatten(sheet: Sheet): FlatRow[] {
  return sheet.customers.flatMap(c =>
    c.lines.map(l => ({ ...l, customerCode: c.customerCode }))
  );
}

function PickingHeader({ company, date, routeName }: { company: CompanyInfo | null; date: string; routeName: string }) {
  return (
    <div className="report-header report-header-picking">
      <div className="hdr-cell hdr-left hdr-row-1">連絡電話：{company?.phone || '—'}</div>
      <div className="hdr-cell hdr-center hdr-row-1 report-title">
        {company?.name || '— 請至設定頁填寫公司資訊'}
      </div>
      <div className="hdr-cell hdr-left hdr-row-2">傳真號碼：{company?.fax || '—'}</div>
      <div className="hdr-cell hdr-center hdr-row-2" />
      <div className="hdr-cell hdr-left hdr-row-3">訂購日期：{date}</div>
      <div className="hdr-cell hdr-center hdr-row-3 hdr-subtitle">點貨單 - {routeName}</div>
    </div>
  );
}

function PickingColumnHeader() {
  return (
    <div className="picking-table-header">
      <span>店家</span>
      <span>品名規格</span>
      <span className="num">數量</span>
      <span>單位</span>
    </div>
  );
}

function PickingRowComp({ row }: { row: FlatRow }) {
  return (
    <div className="picking-row">
      <span>{row.customerCode}</span>
      <span>{row.productName}</span>
      <span className="num">{row.qty.toFixed(2)}</span>
      <span>{row.uom}</span>
    </div>
  );
}

export default function PickingSheet({ sheet, date, company }: Props) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);

  const allRows = flatten(sheet);

  useEffect(() => {
    setMeasured(null);
  }, [sheet, date]);

  useEffect(() => {
    if (measured !== null) return;
    const ref = measureRef.current;
    if (!ref) return;
    const hdr = ref.querySelector<HTMLElement>('[data-measure="hdr"]');
    const tbl = ref.querySelector<HTMLElement>('[data-measure="tbl"]');
    const rows = ref.querySelectorAll<HTMLElement>('[data-measure="row"]');
    if (!hdr || !tbl) return;
    if (rows.length !== allRows.length) return;
    setMeasured({
      headerH: hdr.offsetHeight,
      tblHdrH: tbl.offsetHeight,
      rowH: Array.from(rows).map(r => r.offsetHeight),
    });
  }, [measured, allRows.length]);

  if (allRows.length === 0) return null;

  // 第一階段：portal 內隱形量測
  if (measured === null) {
    return createPortal(
      <div ref={measureRef}
        style={{
          position: 'fixed', left: '-9999px', top: '-9999px',
          width: `${COLUMN_WIDTH_MM}mm`,
          fontFamily: '"Noto Sans TC", "Microsoft JhengHei", sans-serif',
          fontSize: '10pt', lineHeight: 1.4, color: '#000',
          visibility: 'hidden', pointerEvents: 'none',
        }}>
        <style>{REPORT_PRINT_CSS}</style>
        <div data-measure="hdr">
          <PickingHeader company={company} date={date} routeName={sheet.routeName} />
        </div>
        <div data-measure="tbl">
          <PickingColumnHeader />
        </div>
        {allRows.map((r, i) => (
          <div key={i} data-measure="row">
            <PickingRowComp row={r} />
          </div>
        ))}
      </div>,
      document.body
    );
  }

  // 第二階段：packing — 左欄填滿才換右欄、右欄填滿才換頁（共用 reportPaging.packIntoPages）
  const colLimit = PAGE_CONTENT_PX - measured.headerH - measured.tblHdrH;
  const pages = packIntoPages(measured.rowH, colLimit);

  return (
    <>
      {pages.map((page, idx) => (
        <div key={idx} className="purchase-page">
          <PickingHeader company={company} date={date} routeName={sheet.routeName} />
          {!company && idx === 0 && (
            <div className="report-warning">
              公司資訊尚未設定，請至「設定 → 系統設定 → 公司資訊」填寫。
            </div>
          )}
          <div className="purchase-row">
            <div className="purchase-half">
              <PickingColumnHeader />
              {page.left.map(gi => <PickingRowComp key={gi} row={allRows[gi]} />)}
            </div>
            <div className="purchase-half">
              {page.right.length > 0 && <PickingColumnHeader />}
              {page.right.map(gi => <PickingRowComp key={gi} row={allRows[gi]} />)}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
