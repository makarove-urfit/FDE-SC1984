/**
 * 銷售訂單 API — 嚴格 AI GO 標準
 *
 * sale_orders.state: draft | sent | sale | done | cancel
 */
import { db } from './client'
import { isUUID } from '../utils/displayHelpers'
import { getUomMap, resolveUom } from './stock'

// ─── 型別 ───

export interface SaleOrder {
  id: string
  name: string           // 訂單編號（如 S00001）
  state: string          // draft | sent | sale | done | cancel
  date: string
  customerName: string   // 已解析的客戶名稱
  totalAmount: number
  note: string
  driver: string         // 指派的司機名（from custom_data.driver）
  allocated: boolean     // 是否已完成分配
  lines: SaleOrderLine[]
}

export interface SaleOrderLine {
  id: string
  orderId: string
  productTemplateId: string
  name: string           // 品名
  quantity: number        // 客戶下單量
  actualDeliveryQty: number  // 實際出貨量（分配時填入）
  unitPrice: number
  subtotal: number
  uom: string             // 單位名稱
}

// ─── 名稱解析 ───

const resolveCustomerName = (raw: any, customerMap: Record<string, string>): string => {
  if (Array.isArray(raw)) return String(raw[1] || raw[0])
  if (typeof raw === 'string' && customerMap[raw]) return customerMap[raw]
  if (typeof raw === 'string' && !isUUID(raw)) return raw
  return '未知客戶'
}

// ─── API ───

export const getSaleOrders = async (): Promise<SaleOrder[]> => {
  const [orders, lines, customers, uomMap, products] = await Promise.all([
    db.query('sale_orders'),
    db.query('sale_order_lines'),
    db.query('customers').catch(() => []),
    getUomMap(),
    db.query('product_templates'),
  ])

  // 客戶 UUID → 名稱
  const customerMap: Record<string, string> = {}
  ;(customers || []).forEach((c: any) => {
    customerMap[String(c.id)] = c.name || ''
  })

  // product_template_id → 單位名稱
  const productUom: Record<string, string> = {}
  products.forEach((p: any) => {
    productUom[String(p.id)] = resolveUom(p.uom_id, uomMap)
  })

  return orders.map((o: any) => {
    const customData = o.custom_data || {}
    return {
      id: String(o.id),
      name: o.name || String(o.id),
      state: o.state || 'draft',
      date: o.date_order ? String(o.date_order).split(' ')[0] : '',
      customerName: resolveCustomerName(o.customer_id, customerMap),
      totalAmount: o.amount_total || 0,
      note: o.note || '',
      driver: customData.driver || '',
      allocated: customData.allocated === true,
      lines: lines
        .filter((l: any) => (Array.isArray(l.order_id) ? l.order_id[0] : l.order_id) === o.id)
        .map((l: any) => {
          const lineCustomData = l.custom_data || {}
          const ptId = Array.isArray(l.product_template_id)
            ? String(l.product_template_id[0])
            : String(l.product_template_id || '')
          return {
            id: String(l.id),
            orderId: String(o.id),
            productTemplateId: ptId,
            name: l.name || '未知商品',
            quantity: l.product_uom_qty || 0,
            actualDeliveryQty: lineCustomData.actual_delivery_qty ?? 0,
            unitPrice: l.price_unit || 0,
            subtotal: l.price_subtotal || 0,
            uom: productUom[ptId] || '',
          }
        }),
    }
  })
}

/** 更新銷售訂單狀態（不可逆操作） */
export const updateSaleOrderState = async (id: string, state: string) => {
  return await db.update('sale_orders', id, { state })
}

/** 更新銷售訂單的分配資訊（司機、分配完成狀態） */
export const updateSaleOrderAllocation = async (
  orderId: string,
  data: { driver?: string; allocated?: boolean },
) => {
  return await db.update('sale_orders', orderId, { custom_data: data })
}

/** 更新銷售訂單品項的實際出貨量 */
export const updateSaleOrderLineDelivery = async (
  lineId: string,
  actualDeliveryQty: number,
) => {
  return await db.update('sale_order_lines', lineId, {
    custom_data: { actual_delivery_qty: actualDeliveryQty },
  })
}
