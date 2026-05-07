// vfs/admin/src/components/reports/PurchaseSheet.tsx
// 一個廠商區段，內含廠商抬頭 + 欄位 header + 品項 list。
// 不負責 page-break；由父元件用 column-count 流式排版自動分欄分頁。
import type { PurchaseSheet as Sheet } from '../../utils/reportData';

interface Props {
  sheet: Sheet;
}

export default function PurchaseSheet({ sheet }: Props) {
  return (
    <div className="supplier-section">
      <div className="supplier-header">廠商：{sheet.supplierName} <span className="meta">（{sheet.products.length} 品項）</span></div>
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
            <div className="report-product-name">{block.productName}</div>
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
