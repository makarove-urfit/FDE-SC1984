// vfs/admin/src/components/reports/PickingSheet.tsx
import type { PickingSheet as Sheet, PickingRow } from '../../utils/reportData';

interface CompanyInfo { name: string; phone: string; fax: string; }

interface Props {
  sheet: Sheet;
  date: string;
  company: CompanyInfo | null;
}

function splitRows(rows: PickingRow[]): [PickingRow[], PickingRow[]] {
  const half = Math.ceil(rows.length / 2);
  return [rows.slice(0, half), rows.slice(half)];
}

function PickingRows({ rows, customerCode }: { rows: PickingRow[]; customerCode: string }) {
  return (
    <>
      {rows.map((row, j) => (
        <div key={j} className="picking-row">
          <span>{customerCode}</span>
          <span>{row.productName}</span>
          <span className="num">{row.qty.toFixed(2)}</span>
          <span>{row.uom}</span>
        </div>
      ))}
    </>
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

export default function PickingSheet({ sheet, date, company }: Props) {
  const [leftRows, rightRows] = splitRows(sheet.lines);
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
      <div className="report-grid">
        <div className="report-col">
          <PickingColumnHeader />
          <PickingRows rows={leftRows} customerCode={sheet.customerCode} />
        </div>
        <div className="report-col">
          {rightRows.length > 0 && <PickingColumnHeader />}
          <PickingRows rows={rightRows} customerCode={sheet.customerCode} />
        </div>
      </div>
    </div>
  );
}
