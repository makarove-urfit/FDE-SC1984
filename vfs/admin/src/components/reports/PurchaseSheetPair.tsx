// vfs/admin/src/components/reports/PurchaseSheetPair.tsx
// 採購單列印佈局：用 HTML table + CSS column-count 自動分頁。
//   - thead 包公司名 page-header；CSS Paged Media 規範下，瀏覽器列印時 thead
//     會在每張紙頂端自動重複（display: table-header-group）
//   - tbody 內 .purchase-flow 用 column-count: 2 自動分兩欄；瀏覽器引擎自己量
//     高度、自己決定切點，不需要估算行高
//   - .supplier-section / .report-product-block 加 break-inside: avoid 防止
//     被切在不對的地方
//   - 單號依廠商順序編（supplierIndex+1），按廠商在 sheets 陣列中的位置
import type { PurchaseSheet as Sheet } from '../../utils/reportData';
import PurchaseSheet from './PurchaseSheet';

interface CompanyInfo { name: string; phone: string; fax: string; }

interface Props {
  sheets: Sheet[];
  date: string;
  company: CompanyInfo | null;
}

export default function PurchaseSheetPair({ sheets, date, company }: Props) {
  if (sheets.length === 0) return null;
  const dateNum = date.replace(/-/g, '');
  return (
    <table className="purchase-print-table">
      {company?.name && (
        <thead>
          <tr><td>
            <div className="purchase-page-header">
              <div className="report-company">{company.name}</div>
            </div>
          </td></tr>
        </thead>
      )}
      <tbody>
        <tr><td>
          <div className="purchase-flow">
            {sheets.map((sheet, i) => (
              <PurchaseSheet
                key={i}
                sheet={sheet}
                date={date}
                docNo={`${dateNum}${String(i + 1).padStart(3, '0')}`}
              />
            ))}
          </div>
        </td></tr>
      </tbody>
    </table>
  );
}
