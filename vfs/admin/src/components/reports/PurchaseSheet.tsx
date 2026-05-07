// vfs/admin/src/components/reports/PurchaseSheet.tsx
// 一個廠商區段（可能是某廠商全部或續印的部分）。
// header 固定顯示「出貨日期 + 單號」兩個 meta（左右半邊都印）。
// 單號以廠商為單位，同廠商被切成多段時共用同一單號。
import type { PurchaseSheet as Sheet } from '../../utils/reportData';

interface Props {
  sheet: Sheet;
  date: string;
  docNo: string;
}

export default function PurchaseSheet({ sheet, date, docNo }: Props) {
  return (
    <div className="supplier-section">
      <div className="supplier-meta">
        <span>出貨日期：{date}</span>
        <span>單號：{docNo}</span>
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
        {sheet.products.map((block, i) => (
          <div key={i} className="report-product-block">
            {block.rows.map((row, j) => (
              <div key={j} className="report-row">
                <span>{row.customerCode}</span>
                <span>{block.productName}</span>
                <span className="num">{row.qty.toFixed(2)}</span>
                <span>{row.uom || block.uom}</span>
                <span className="note">{row.note}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
