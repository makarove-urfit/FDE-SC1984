// vfs/admin/src/components/reports/PurchaseSheetPair.tsx
// 採購單列印佈局：以「半張 A4」為容器做 bin-packing。
//   - 左半依序塞滿（含跨廠商堆疊）才溢出到右半
//   - 大廠商超過半頁容量會切到下一個半頁；同廠商不同段共用同一單號
//   - 半頁兩兩配對成 A4 page，page-break 自動分頁；每張 A4 頂端印公司名
//
// 容量估算（保守版，避免溢頁）：
//   A4 直印可用高度 ≈ 267mm ≈ 757pt（扣瀏覽器預設 margin 30mm）
//   扣 page-header（公司名 14pt + border + margin ≈ 30pt）與 .purchase-page padding-bottom 4mm（≈ 11pt）
//   半頁實際可用 ≈ 717pt
//   每個 supplier section overhead（supplier-meta 14pt + supplier-header 22pt + table-header 23pt
//     + section padding-bottom 6pt + 首個 product-block margin 4pt）≈ 69pt → 取 5 行（每行 14pt）
//   每 .report-row padding 2pt + 10pt 字 ≈ 14pt；但 product block 之間有 dashed border + padding-top
//     + margin-bottom 累積、字型渲染偏差、產品名稱換行等隱性開銷，需留 25-30% 緩衝
//   717pt / 14pt ≈ 51 行理論值，乘以安全係數 0.63 → 32 行
import type { PurchaseSheet as Sheet, PurchaseProductBlock } from '../../utils/reportData';
import PurchaseSheet from './PurchaseSheet';

interface CompanyInfo { name: string; phone: string; fax: string; }

interface Props {
  sheets: Sheet[];
  date: string;
  company: CompanyInfo | null;
}

interface SectionEntry {
  sheet: Sheet;            // 已切片過的廠商資料（products 可能是部分）
  supplierIndex: number;   // 原始廠商順序（用於單號）
  docNo: string;           // YYYYMMDD + 三位流水
}

interface HalfPage {
  sections: SectionEntry[];
}

const ROWS_PER_HALF = 32;
const OVERHEAD_PER_SECTION = 5;

function packIntoHalves(sheets: Sheet[], dateNum: string): HalfPage[] {
  const halves: HalfPage[] = [];
  let current: HalfPage = { sections: [] };
  let used = 0;

  const flush = () => {
    halves.push(current);
    current = { sections: [] };
    used = 0;
  };

  sheets.forEach((sheet, supplierIndex) => {
    const docNo = `${dateNum}${String(supplierIndex + 1).padStart(3, '0')}`;
    let pending: PurchaseProductBlock[] = [...sheet.products];

    while (pending.length > 0) {
      // 半頁裝不下一個新 section 的 overhead+1 行 → 換下一個半頁
      if (ROWS_PER_HALF - used < OVERHEAD_PER_SECTION + 1) {
        flush();
      }
      used += OVERHEAD_PER_SECTION;
      const remaining = ROWS_PER_HALF - used;

      const fitted: PurchaseProductBlock[] = [];
      const overflow: PurchaseProductBlock[] = [];
      let usedRows = 0;
      let i = 0;
      for (; i < pending.length; i++) {
        const block = pending[i];
        if (usedRows + block.rows.length <= remaining) {
          fitted.push(block);
          usedRows += block.rows.length;
        } else {
          const fits = remaining - usedRows;
          if (fits > 0) {
            fitted.push({ ...block, rows: block.rows.slice(0, fits) });
            overflow.push({ ...block, rows: block.rows.slice(fits) });
          } else {
            overflow.push(block);
          }
          break;
        }
      }
      for (let j = i + 1; j < pending.length; j++) overflow.push(pending[j]);

      if (fitted.length > 0) {
        current.sections.push({
          sheet: { ...sheet, products: fitted },
          supplierIndex,
          docNo,
        });
        used += usedRows;
      } else {
        // 連一行都塞不下：撤回 overhead 並換半頁，避免無限 loop
        used -= OVERHEAD_PER_SECTION;
        flush();
        continue;
      }

      pending = overflow;
      if (pending.length > 0) flush();
    }
  });

  if (current.sections.length > 0) halves.push(current);
  return halves;
}

export default function PurchaseSheetPair({ sheets, date, company }: Props) {
  if (sheets.length === 0) return null;
  const dateNum = date.replace(/-/g, '');
  const halves = packIntoHalves(sheets, dateNum);
  // 半頁兩兩配對成 A4 page
  const pages: { left: HalfPage; right: HalfPage | null }[] = [];
  for (let i = 0; i < halves.length; i += 2) {
    pages.push({ left: halves[i], right: halves[i + 1] || null });
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
              {page.left.sections.map((s, i) => (
                <PurchaseSheet key={i} sheet={s.sheet} date={date} docNo={s.docNo} />
              ))}
            </div>
            <div className="purchase-half">
              {page.right?.sections.map((s, i) => (
                <PurchaseSheet key={i} sheet={s.sheet} date={date} docNo={s.docNo} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
