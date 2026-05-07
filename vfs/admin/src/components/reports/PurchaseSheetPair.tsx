// vfs/admin/src/components/reports/PurchaseSheetPair.tsx
// 採購單列印容器：頁頂 page header（公司名 / 日期）跨整頁，
// 下方所有廠商 section 用 column-count 雙欄流式排版 — 同廠商太長
// 自動接續到右欄／下一頁，左欄有餘力就接下個廠商。
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
  return (
    <div className="purchase-flow">
      <div className="purchase-page-header">
        {company?.name && <div className="report-company">{company.name}</div>}
        <div className="purchase-page-meta">出貨日期：{date}</div>
      </div>
      <div className="purchase-columns">
        {sheets.map(s => <PurchaseSheet key={s.supplierId} sheet={s} />)}
      </div>
    </div>
  );
}
