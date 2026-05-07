// vfs/admin/src/components/reports/PurchaseSheet.tsx
import type { PurchaseSheet as Sheet } from '../../utils/reportData';

interface CompanyInfo { name: string; phone: string; fax: string; }

interface Props {
  sheet: Sheet;
  date: string;
  company: CompanyInfo | null;
}

// 單一廠商採購單，佔半張 A4 寬度（左半或右半）；
// 兩兩配對由父層 SheetPair 控制。
export default function PurchaseSheet({ sheet, date, company }: Props) {
  return (
    <div className="purchase-half">
      {company?.name && <div className="report-company">{company.name}</div>}
      <div className="report-header">
        <span>出貨日期：{date}</span>
        <span className="report-title">廠商：{sheet.supplierName}</span>
        <span className="meta">{sheet.products.length} 品項</span>
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
