// vfs/admin/src/components/reports/PurchaseSheet.tsx
import type { PurchaseSheet as Sheet } from '../../utils/reportData';

interface CompanyInfo { name: string; phone: string; fax: string; }

interface Props {
  sheet: Sheet;
  date: string;
  company: CompanyInfo | null;
}

export default function PurchaseSheet({ sheet, date, company }: Props) {
  return (
    <div className="report-sheet">
      {company?.name && <div className="report-company">{company.name}</div>}
      <div className="report-header">
        <span>出貨日期：{date}</span>
        <span className="report-title">廠商名稱：{sheet.supplierName}</span>
        <span className="meta">{sheet.products.length} 品項</span>
      </div>
      <div className="report-table-header">
        <span>客戶</span>
        <span>品名規格</span>
        <span className="num">數量</span>
        <span>單位</span>
        <span>備註</span>
      </div>
      <div className="report-columns">
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
