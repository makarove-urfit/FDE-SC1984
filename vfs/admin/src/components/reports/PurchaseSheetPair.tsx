// vfs/admin/src/components/reports/PurchaseSheetPair.tsx
// 一張 A4 紙裝兩間廠商（左半 + 右半），對齊紙本印刷格式。
import type { PurchaseSheet as Sheet } from '../../utils/reportData';
import PurchaseSheet from './PurchaseSheet';

interface CompanyInfo { name: string; phone: string; fax: string; }

interface Props {
  left: Sheet;
  right: Sheet | null;
  date: string;
  company: CompanyInfo | null;
}

export default function PurchaseSheetPair({ left, right, date, company }: Props) {
  return (
    <div className="sheet-pair">
      <PurchaseSheet sheet={left} date={date} company={company} />
      {right ? (
        <PurchaseSheet sheet={right} date={date} company={company} />
      ) : (
        <div className="purchase-half-empty" />
      )}
    </div>
  );
}
