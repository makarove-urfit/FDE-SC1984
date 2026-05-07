// vfs/admin/src/components/reports/PurchaseSheet.tsx
import type { PurchaseSheet as Sheet, PurchaseProductBlock } from '../../utils/reportData';

interface CompanyInfo { name: string; phone: string; fax: string; }

interface Props {
  sheet: Sheet;
  date: string;
  company: CompanyInfo | null;
}

function splitByRowCount(blocks: PurchaseProductBlock[]): [PurchaseProductBlock[], PurchaseProductBlock[]] {
  const totalRows = blocks.reduce((s, b) => s + b.rows.length, 0);
  const halfRows = totalRows / 2;
  const left: PurchaseProductBlock[] = [];
  const right: PurchaseProductBlock[] = [];
  let acc = 0;
  for (const b of blocks) {
    if (acc + b.rows.length / 2 <= halfRows) {
      left.push(b);
      acc += b.rows.length;
    } else {
      right.push(b);
    }
  }
  return [left, right];
}

function ProductBlocks({ blocks }: { blocks: PurchaseProductBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => (
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
    </>
  );
}

function ColumnHeader() {
  return (
    <div className="report-table-header">
      <span>客戶</span>
      <span>品名規格</span>
      <span className="num">數量</span>
      <span>單位</span>
      <span>備註</span>
    </div>
  );
}

export default function PurchaseSheet({ sheet, date, company }: Props) {
  const [leftBlocks, rightBlocks] = splitByRowCount(sheet.products);
  return (
    <div className="report-sheet">
      {company?.name && <div className="report-company">{company.name}</div>}
      <div className="report-header">
        <span>出貨日期：{date}</span>
        <span className="report-title">廠商名稱：{sheet.supplierName}</span>
        <span className="meta">{sheet.products.length} 品項</span>
      </div>
      <div className="report-grid">
        <div className="report-col">
          <ColumnHeader />
          <ProductBlocks blocks={leftBlocks} />
        </div>
        <div className="report-col">
          {rightBlocks.length > 0 && <ColumnHeader />}
          <ProductBlocks blocks={rightBlocks} />
        </div>
      </div>
    </div>
  );
}
