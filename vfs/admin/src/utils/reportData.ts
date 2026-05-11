// vfs/admin/src/utils/reportData.ts

export interface PurchaseRow {
  customerCode: string;     // 路線代號 + 客戶簡稱，如 "F33炸料"
  qty: number;
  uom: string;
  note: string;
}

export interface PurchaseProductBlock {
  productName: string;
  uom: string;              // 該品項主單位（同品項應一致；若不一致以第一筆為準）
  rows: PurchaseRow[];
}

export interface PurchaseSheet {
  supplierId: string;       // 或 '__none__'
  supplierName: string;
  products: PurchaseProductBlock[];
}

export interface PickingRow {
  productName: string;
  qty: number;
  uom: string;
  note: string;
}

export interface PickingSheet {
  customerId: string;
  customerCode: string;     // 路線代號 + 客戶簡稱
  customerFullName: string;
  lines: PickingRow[];
}

export interface ReportInput {
  orders: any[];                              // 已篩 selectedDate 的訂單（所有 state，呼叫端先過濾 draft）
  orderLines: any[];                          // 全部 sale_order_lines（內部會用 delivery_date + order_id 對齊）
  customers: Record<string, any>;             // id → customer
  customerTags: any[];                        // customer_tags 陣列
  products: any[];                            // product_templates
  suppliers: Record<string, any>;             // id → supplier
  uomMap: Record<string, string>;             // uom_id → name
  selectedDate: string;                       // YYYY-MM-DD
}

const _id = (v: any): string => Array.isArray(v) ? String(v[0] || '') : String(v || '');

// ── helpers (exported for testability) ──

export function customerCode(cust: any | undefined, tagsById: Record<string, any>): string {
  if (!cust) return '';
  const tagId = _id(cust?.custom_data?.region_tag_id);
  const route = tagId ? String(tagsById[tagId]?.name || '') : '';
  const short = String(cust?.short_name || '').trim() || String(cust?.name || '').slice(0, 3);
  return `${route}${short}`;
}

export function lineNote(line: any): string {
  const cd = line?.custom_data;
  return (cd && typeof cd === 'object') ? String(cd.note || '') : '';
}

export function lineUom(
  line: any,
  productsById: Record<string, any>,
  uomMap: Record<string, string>,
): string {
  const pid = _id(line?.product_template_id || line?.product_id);
  const prod = productsById[pid];
  const uomId = _id(prod?.uom_id);
  return uomMap[uomId] || '';
}

export function buildPurchaseSheets(input: ReportInput): PurchaseSheet[] {
  const { orders, orderLines, customers, customerTags, products, suppliers, uomMap, selectedDate } = input;

  // index helpers
  const productsById: Record<string, any> = {};
  const productSupplier: Record<string, string> = {};   // tmplId → supplierId
  for (const p of products) {
    productsById[p.id] = p;
    const s = _id(p?.custom_data?.default_supplier_id);
    if (s) productSupplier[p.id] = s;
  }
  const tagsById: Record<string, any> = {};
  for (const t of customerTags) tagsById[t.id] = t;

  // 篩當日訂單 line（用 delivery_date + 屬於 orders 集合）
  const orderIds = new Set(orders.map(o => String(o.id)));
  const todaysLines = orderLines.filter(l =>
    orderIds.has(_id(l.order_id)) &&
    String(l.delivery_date || '').slice(0, 10) === selectedDate
  );

  // 分組 supplier → product → customer
  type Bucket = Map<string, { name: string; uom: string; rows: PurchaseRow[] }>;
  const grouped = new Map<string, Bucket>();   // supplierKey → product bucket

  for (const l of todaysLines) {
    const tmplId = _id(l.product_template_id || l.product_id);
    const supKey = productSupplier[tmplId] || '__none__';
    if (!grouped.has(supKey)) grouped.set(supKey, new Map());
    const bucket = grouped.get(supKey)!;
    const pname = String(l.name || '—');
    const productKey = `${tmplId}|${pname}`;       // 用 tmplId+name 當 key 避免同名不同品項合併
    if (!bucket.has(productKey)) {
      bucket.set(productKey, {
        name: pname,
        uom: lineUom(l, productsById, uomMap),
        rows: [],
      });
    }
    const block = bucket.get(productKey)!;
    const orderForLine = orders.find(o => String(o.id) === _id(l.order_id));
    const cust = orderForLine ? customers[_id(orderForLine.customer_id)] : undefined;
    block.rows.push({
      customerCode: customerCode(cust, tagsById),
      qty: Number(l.product_uom_qty || 0),
      uom: lineUom(l, productsById, uomMap),
      note: lineNote(l),
    });
  }

  // 排序：supplier 名稱（none 殿後）；品項中文；客戶代號
  const sheets: PurchaseSheet[] = Array.from(grouped.entries()).map(([supKey, bucket]) => {
    const products = Array.from(bucket.values())
      .map(b => ({
        productName: b.name,
        uom: b.uom,
        rows: [...b.rows].sort((a, b) => a.customerCode.localeCompare(b.customerCode, 'zh-Hant')),
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName, 'zh-Hant'));
    return {
      supplierId: supKey,
      supplierName: supKey === '__none__' ? '未設定供應商' : (suppliers[supKey]?.name || supKey),
      products,
    };
  });

  sheets.sort((a, b) => {
    if (a.supplierId === '__none__') return 1;
    if (b.supplierId === '__none__') return -1;
    return a.supplierName.localeCompare(b.supplierName, 'zh-Hant');
  });

  return sheets;
}

export function buildPickingSheets(input: ReportInput): PickingSheet[] {
  const { orders, orderLines, customers, customerTags, products, uomMap, selectedDate } = input;

  const productsById: Record<string, any> = {};
  for (const p of products) productsById[p.id] = p;
  const tagsById: Record<string, any> = {};
  for (const t of customerTags) tagsById[t.id] = t;

  const orderIdToCust: Record<string, string> = {};
  for (const o of orders) orderIdToCust[String(o.id)] = _id(o.customer_id);

  const todaysLines = orderLines.filter(l =>
    !!orderIdToCust[_id(l.order_id)] &&
    String(l.delivery_date || '').slice(0, 10) === selectedDate
  );

  // 分組 customer → rows
  const grouped = new Map<string, PickingRow[]>();
  for (const l of todaysLines) {
    const cid = orderIdToCust[_id(l.order_id)];
    if (!cid) continue;
    if (!grouped.has(cid)) grouped.set(cid, []);
    grouped.get(cid)!.push({
      productName: String(l.name || '—'),
      qty: Number(l.product_uom_qty || 0),
      uom: lineUom(l, productsById, uomMap),
      note: lineNote(l),
    });
  }

  const sheets: PickingSheet[] = Array.from(grouped.entries())
    .map(([cid, rows]) => {
      const cust = customers[cid];
      return {
        customerId: cid,
        customerCode: customerCode(cust, tagsById),
        customerFullName: String(cust?.name || cust?.short_name || ''),
        lines: rows.sort((a, b) => a.productName.localeCompare(b.productName, 'zh-Hant')),
      };
    })
    .filter(s => s.lines.length > 0)
    .sort((a, b) => a.customerCode.localeCompare(b.customerCode, 'zh-Hant'));

  return sheets;
}
