import { db } from './client';

export interface SalesInvoice {
  id: string;
  erp_id: string;
  tenant_id: string;
  date: string;
  customer_id?: string;
  total_amount: number;
  status: string;
  lines: SalesInvoiceLine[];
  metadata?: any;
}

export interface SalesInvoiceLine {
  id: string;
  invoice_id: string;
  product_id: string;
  product_template_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  metadata?: any;
}

export const getSalesInvoices = async (): Promise<SalesInvoice[]> => {
  const [orders, lines, customers] = await Promise.all([
    db.query('sale_orders'),
    db.query('sale_order_lines'),
    db.query('customers').catch(() => []),
  ]);

  // 建立客戶名稱查找表
  const customerMap: Record<string, string> = {};
  (customers || []).forEach((c: any) => {
    customerMap[String(c.id)] = c.name || '';
  });

  return orders.map(o => {
    // 解析客戶 ID 並查找名稱
    const rawCustId = Array.isArray(o.customer_id) ? o.customer_id[0] : o.customer_id;
    const custName = Array.isArray(o.customer_id)
      ? o.customer_id[1]
      : (customerMap[String(rawCustId)] || rawCustId);

    return {
      id: String(o.id),
      erp_id: o.name || String(o.id),
      tenant_id: '',
      date: o.date_order ? String(o.date_order).split(' ')[0] : '',
      customer_id: custName || undefined,
      total_amount: o.amount_total || 0,
      status: o.state || 'draft',
      lines: lines.filter(l => (Array.isArray(l.order_id) ? l.order_id[0] : l.order_id) === o.id).map(l => {
        // line.name 格式通常是 "品名 (備註)" 或純品名
        const lineName = l.name || '';
        const noteMatch = lineName.match(/^(.+?)\s*\((.+)\)$/);
        const productName = noteMatch ? noteMatch[1] : lineName;
        const lineNote = noteMatch ? noteMatch[2] : '';

        return {
          id: String(l.id),
          invoice_id: String(o.id),
          product_id: Array.isArray(l.product_id) ? String(l.product_id[0]) : String(l.product_id || ''),
          product_template_id: Array.isArray(l.product_template_id) ? String(l.product_template_id[0]) : String(l.product_template_id || ''),
          name: productName,
          quantity: l.product_uom_qty || 0,
          unit_price: l.price_unit || 0,
          subtotal: l.price_subtotal || 0,
          metadata: { note: lineNote },
        };
      }),
      metadata: { note: o.note },
    };
  });
};

export const updateSalesInvoiceStatus = async (id: string, status: string) => {
  return await db.update('sale_orders', id, { state: status });
};

// Not used deeply yet but placeholder for standard mapping
export const getAllocations = async () => {
  return [];
};

export const updateAllocationStatus = async (_id: string, _status: string) => {
  return {};
};
