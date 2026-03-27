import { db } from './client';

export interface PurchaseOrder {
  id: string;
  erp_id: string;
  supplier_id: string;
  date: string;
  status: string;
  total_amount: number;
  lines: PurchaseOrderLine[];
}

export interface PurchaseOrderLine {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface PurchaseInvoice {
  id: string;
  erp_id: string;
  supplier_id: string;
  date: string;
  status: string;
  total_amount: number;
  lines: PurchaseInvoiceLine[];
}

export interface PurchaseInvoiceLine {
  id: string;
  invoice_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export const getPurchaseOrders = async (): Promise<PurchaseOrder[]> => {
  const [orders, lines] = await Promise.all([
    db.query('purchase_orders'),
    db.query('purchase_order_lines')
  ]);
  
  return orders.map(o => ({
    id: String(o.id),
    erp_id: o.name || String(o.id),
    date: o.date_order ? String(o.date_order).split(' ')[0] : '',
    supplier_id: Array.isArray(o.supplier_id) ? o.supplier_id[1] : o.supplier_id,
    total_amount: o.amount_total || 0,
    status: o.state || 'draft',
    lines: lines.filter(l => (Array.isArray(l.order_id) ? l.order_id[0] : l.order_id) === o.id).map(l => ({
        id: String(l.id),
        order_id: String(o.id),
        product_id: Array.isArray(l.product_id) ? String(l.product_id[0]) : String(l.product_id),
        quantity: l.product_qty || 0,
        unit_price: l.price_unit || 0,
        subtotal: l.price_subtotal || 0
    }))
  }));
};

export const updatePurchaseOrderStatus = async (id: string, status: string) => {
  return await db.update('purchase_orders', id, { state: status });
};

export const getPurchaseInvoices = async (): Promise<PurchaseInvoice[]> => {
  // Mapping to POs for now based on context 
  return []; 
};

export const updatePurchaseInvoiceStatus = async (_id: string, _status: string) => {
  return {};
};

/**
 * 從已確認的銷售訂單產生採購單
 * 
 * 流程：
 * 1. 彙總所有已確認銷售訂單的品項需求
 * 2. （未來可按供應商分組）建立單張採購單
 * 3. 逐行建立採購單明細
 */
export async function generatePurchaseOrders(
  confirmedOrders: Array<{ lines: Array<{ product_id: string; product_template_id?: string; name: string; quantity: number }> }>,
  _products: Array<{ id: string; name: string; sku: string }>,
): Promise<string[]> {
  if (confirmedOrders.length === 0) throw new Error('沒有已確認的訂單可產生採購單')

  // 彙總品項需求量
  const productDemand = new Map<string, { name: string; totalQty: number }>()
  for (const order of confirmedOrders) {
    for (const line of order.lines) {
      const pid = line.product_template_id || line.product_id
      const existing = productDemand.get(pid) || { name: line.name || '未知', totalQty: 0 }
      existing.totalQty = Math.round((existing.totalQty + line.quantity) * 100) / 100
      productDemand.set(pid, existing)
    }
  }

  // 建立採購單主檔
  const poRes = await db.insert<{ id: string }>('purchase_orders', {
    date_order: new Date().toISOString().slice(0, 10),
    state: 'draft',
    note: `自動產生自 ${confirmedOrders.length} 筆銷售訂單`,
  })
  const poId = poRes.id

  // 建立採購單明細行
  const linePromises = Array.from(productDemand.entries()).map(([pid, demand]) =>
    db.insert('purchase_order_lines', {
      order_id: poId,
      product_id: pid,
      product_qty: demand.totalQty,
      name: demand.name,
      price_unit: 0,
    })
  )
  await Promise.all(linePromises)

  return [poId]
}
