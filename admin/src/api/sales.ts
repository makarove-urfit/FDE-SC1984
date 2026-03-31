/**
 * 銷售訂單 API — 嚴格 AI GO 標準（零 custom_data 依賴）
 *
 * sale_orders.state: draft | sent | sale | done | cancel
 * sale_orders.note: JSON 存 { driver, allocated }
 * sale_order_lines.qty_delivered: 實際出貨量
 */
import { db } from './client'
import { isUUID } from '../utils/displayHelpers'
import { getUomMap, resolveUom } from './stock'

// ─── 型別 ───

export interface SaleOrder {
  id: string
  name: string
  state: string
  date: string
  customerName: string
  totalAmount: number
  note: string
  driver: string         // 指派的司機名（from note JSON）
  allocated: boolean     // 是否已完成分配
  lines: SaleOrderLine[]
}

export interface SaleOrderLine {
  id: string
  orderId: string
  productTemplateId: string
  name: string
  quantity: number
  actualDeliveryQty: number  // 實際出貨量（from qty_delivered）
  unitPrice: number
  subtotal: number
  uom: string
}

// ─── note JSON 解析 ───

interface NoteData {
  driver?: string
  allocated?: boolean
  text?: string            // 原始備註文字
}

/** 解析 note 欄位 — 嘗試作為 JSON，失敗則視為純文字 */
const parseNote = (raw: any): NoteData => {
  if (!raw) return {}
  const str = String(raw).trim()
  if (str.startsWith('{')) {
    try { return JSON.parse(str) } catch { /* fallthrough */ }
  }
  return { text: str }
}

/** 將 NoteData 序列化為 note 欄位值 */
const serializeNote = (data: NoteData): string => {
  return JSON.stringify(data)
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
    db.query('sale_orders', { select_columns: ['id', 'name', 'state', 'date_order', 'customer_id', 'amount_total', 'note'] }),
    db.query('sale_order_lines', { select_columns: ['id', 'order_id', 'product_template_id', 'name', 'product_uom_qty', 'qty_delivered', 'price_unit', 'price_subtotal'] }),
    db.query('customers', { select_columns: ['id', 'name'] }).catch(() => []),
    getUomMap(),
    db.query('product_templates', { select_columns: ['id', 'uom_id'] }),
  ])

  const customerMap: Record<string, string> = {}
  ;(customers || []).forEach((c: any) => {
    customerMap[String(c.id)] = c.name || ''
  })

  const productUom: Record<string, string> = {}
  products.forEach((p: any) => {
    productUom[String(p.id)] = resolveUom(p.uom_id, uomMap)
  })

  return orders.map((o: any) => {
    const noteData = parseNote(o.note)
    return {
      id: String(o.id),
      name: o.name || String(o.id),
      state: o.state || 'draft',
      date: o.date_order ? String(o.date_order).split(' ')[0] : '',
      customerName: resolveCustomerName(o.customer_id, customerMap),
      totalAmount: o.amount_total || 0,
      note: noteData.text || '',
      driver: noteData.driver || '',
      allocated: noteData.allocated === true,
      lines: lines
        .filter((l: any) => (Array.isArray(l.order_id) ? l.order_id[0] : l.order_id) === o.id)
        .map((l: any) => {
          const ptId = Array.isArray(l.product_template_id)
            ? String(l.product_template_id[0])
            : String(l.product_template_id || '')
          return {
            id: String(l.id),
            orderId: String(o.id),
            productTemplateId: ptId,
            name: l.name || '未知商品',
            quantity: l.product_uom_qty || 0,
            actualDeliveryQty: l.qty_delivered || 0,
            unitPrice: l.price_unit || 0,
            subtotal: l.price_subtotal || 0,
            uom: productUom[ptId] || '單位',
          }
        }),
    }
  })
}

/** 更新銷售訂單狀態（不可逆操作） */
export const updateSaleOrderState = async (id: string, state: string) => {
  return await db.update('sale_orders', id, { state })
}

/** 更新銷售訂單的分配資訊（司機、分配完成狀態）— 存在 note 欄位 */
export const updateSaleOrderAllocation = async (
  orderId: string,
  data: { driver?: string; allocated?: boolean },
) => {
  // 先讀取現有 note，合併後寫回
  const orders = await db.query('sale_orders', { limit: 200 })
  const order = orders.find((o: any) => String(o.id) === orderId)
  const existing = parseNote(order?.note)
  const merged = { ...existing, ...data }
  return await db.update('sale_orders', orderId, { note: serializeNote(merged) })
}

/** 更新銷售訂單品項的實際出貨量 — 使用原生 qty_delivered */
export const updateSaleOrderLineDelivery = async (
  lineId: string,
  actualDeliveryQty: number,
) => {
  return await db.update('sale_order_lines', lineId, {
    qty_delivered: actualDeliveryQty,
  })
}
