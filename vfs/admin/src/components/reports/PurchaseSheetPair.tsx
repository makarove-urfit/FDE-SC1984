// vfs/admin/src/components/reports/PurchaseSheetPair.tsx
// 採購單列印佈局：手動切資料成「半張 A4」單位，每張 A4 含左右兩半。
//   - 同廠商左欄裝不下 → 右欄續印（header 加「（續）」）
//   - 左欄裝得完還有空 → 右欄接下個廠商
//   - 多張 A4 之間自動 page-break，每張紙頂端重複 page header
//
// 行高估算：A4 直印 ~277mm 扣 margin + page header，半欄約可容 35 行內容
// （含品項標題 + 客戶資料行）。經驗值，必要時調整 ROWS_PER_HALF。
import type { PurchaseSheet as Sheet, PurchaseProductBlock } from '../../utils/reportData';
import PurchaseSheet from './PurchaseSheet';

interface CompanyInfo { name: string; phone: string; fax: string; }

interface Props {
  sheets: Sheet[];
  date: string;
  company: CompanyInfo | null;
}

interface Section {
  sheet: Sheet;
  isContinuation: boolean;
}

// 視覺行 = 客戶 rows（每行已含品名，不再有獨立 product header 行）
function visualRows(block: PurchaseProductBlock): number {
  return block.rows.length;
}

// 內容夠多才切（小 supplier 維持單 section 不浪費紙）
const SPLIT_THRESHOLD = 12;

// 把每個 supplier 切成 1 或 2 個 Section：
//   - visual rows ≤ SPLIT_THRESHOLD → 單 section（左半放完）
//   - visual rows > SPLIT_THRESHOLD → 切兩等分（左半 + 右半「（續）」）
// 切點限制在 product block 邊界（不切在品項中間）。
function splitToSections(sheets: Sheet[]): Section[] {
  const out: Section[] = [];
  for (const sheet of sheets) {
    const total = sheet.products.reduce((s, p) => s + visualRows(p), 0);
    if (total <= SPLIT_THRESHOLD) {
      out.push({ sheet, isContinuation: false });
      continue;
    }
    const halfTarget = Math.ceil(total / 2);
    let buf: PurchaseProductBlock[] = [];
    let bufRows = 0;
    let pushed = false;
    for (const block of sheet.products) {
      if (!pushed && bufRows >= halfTarget && buf.length > 0) {
        out.push({ sheet: { ...sheet, products: buf }, isContinuation: false });
        buf = [];
        bufRows = 0;
        pushed = true;
      }
      buf.push(block);
      bufRows += visualRows(block);
    }
    if (buf.length > 0) {
      out.push({ sheet: { ...sheet, products: buf }, isContinuation: pushed });
    }
  }
  return out;
}

export default function PurchaseSheetPair({ sheets, date, company }: Props) {
  if (sheets.length === 0) return null;
  const sections = splitToSections(sheets);
  // 兩兩配對成頁
  const pages: { left: Section; right: Section | null }[] = [];
  for (let i = 0; i < sections.length; i += 2) {
    pages.push({ left: sections[i], right: sections[i + 1] || null });
  }
  return (
    <>
      {pages.map((page, idx) => (
        <div key={idx} className="purchase-page">
          {company?.name && (
            <div className="purchase-page-header">
              <div className="report-company">{company.name}</div>
            </div>
          )}
          <div className="purchase-row">
            <div className="purchase-half">
              <PurchaseSheet sheet={page.left.sheet} date={date} isContinuation={page.left.isContinuation} />
            </div>
            <div className="purchase-half">
              {page.right && <PurchaseSheet sheet={page.right.sheet} date={date} isContinuation={page.right.isContinuation} />}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
