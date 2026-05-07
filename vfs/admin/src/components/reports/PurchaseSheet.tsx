// vfs/admin/src/components/reports/PurchaseSheet.tsx
// 一個廠商區段（可能是某廠商全部或續印的部分）。
// isContinuation=true 時 header 加「（續）」標示。
import type { PurchaseSheet as Sheet } from '../../utils/reportData';

interface Props {
  sheet: Sheet;
  isContinuation?: boolean;
}

export default function PurchaseSheet({ sheet, isContinuation = false }: Props) {
  return (
    <div className="supplier-section">
      <div className="supplier-header">
        廠商：{sheet.supplierName}{isContinuation && '（續）'} <span className="meta">（{sheet.products.length} 品項）</span>
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
