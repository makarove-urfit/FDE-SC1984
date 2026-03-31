/**
 * 銷售訂單 API — 嚴格 AI GO 標準（零 custom_data 依賴）
 *
 * sale_orders.state: draft | sent | sale | done | cancel
 * sale_orders.note: JSON 存 { driver, allocated }
 * sale_order_lines.qty_delivered: 實際出貨量
 */
import { db } from './client'
import { isUUID } from '../utils/displayHelpers'
// 參照資料由 refCache 統一管理

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
  productId: string
  name: string
  quantity: number
  actualDeliveryQty: number  // 從 note JSON 解析而得的自定義分配量，如果沒分配過則為預設 0
  unitPrice: number
  subtotal: number
  uom: string
}

// ─── note JSON 解析 ───

interface NoteData {
  driver?: string
  allocated?: boolean
  allocations?: Record<string, number> // { 產品 ID 或 行 ID: 分配數量 }
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

import { getOrderDateBounds } from '../utils/dateHelpers'
import { getCachedCustomerMap, getCachedProductUomMap } from './refCache'

export const getSaleOrders = async (targetDate: string): Promise<SaleOrder[]> => {
  // 取出精準的 Odoo UTC [開始, 結束) 界線（用於前端篩選）
  const { start, end } = getOrderDateBounds(targetDate)

  // 平行拉取：活躍訂單 + 快取的參照資料
  const [allOrders, customerMap, productUom] = await Promise.all([
    db.query('sale_orders', { 
      select_columns: ['id', 'name', 'state', 'date_order', 'customer_id', 'amount_total', 'note'],
      filters: [
        { column: 'state', op: 'in', value: ['draft', 'sent', 'sale'] }
      ]
    }),
    getCachedCustomerMap(),
    getCachedProductUomMap(),
  ])

  // 前端做 02:00 UTC+8 週期過濾（後端 proxy 不支援 ge/lt 運算子）
  const orders = allOrders.filter((o: any) => {
    const d = String(o.date_order || '')
    return d >= start && d < end
  })

  // 第二階段：只拉取這批訂單關聯的子明細
  const orderIds = orders.map((o: any) => o.id)
  let lines: any[] = []
  if (orderIds.length > 0) {
    lines = await db.query('sale_order_lines', { 
      select_columns: ['id', 'order_id', 'product_template_id', 'product_id', 'name', 'product_uom_qty', 'qty_delivered', 'price_unit', 'price_subtotal'],
      filters: [{ column: 'order_id', op: 'in', value: orderIds }]
    })
  }

  return orders.map((o: any) => {
    const noteData = parseNote(o.note)
    return {
      id: String(o.id),
      name: o.name || String(o.id),
      state: o.state || 'draft',
      date: targetDate, // 強制歸屬為目標日
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
          const pId = Array.isArray(l.product_id)
            ? String(l.product_id[0])
            : String(l.product_id || ptId)
          
          const actualDeliveryQty = noteData.allocations?.[String(l.id)] ?? 0
          
          return {
            id: String(l.id),
            orderId: String(o.id),
            productTemplateId: ptId,
            productId: pId,
            name: l.name || '未知商品',
            quantity: l.product_uom_qty || 0,
            actualDeliveryQty,
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
  data: { driver?: string; allocated?: boolean; allocations?: Record<string, number> },
) => {
  // 先讀取現有 note，合併後寫回
  try {
    const records = await db.query('sale_orders', { 
      select_columns: ['id', 'note'],
      filters: [{ column: 'id', op: 'eq', value: parseInt(orderId) }], 
      limit: 1 
    })
    const existing = parseNote(records[0]?.note)
    
    // 將新的數量分配混入 existing.allocations
    let newAllocations = existing.allocations || {}
    if (data.allocations) {
      newAllocations = { ...newAllocations, ...data.allocations }
    }

    const merged: NoteData = { 
      ...existing, 
      ...data, 
      allocations: Object.keys(newAllocations).length > 0 ? newAllocations : undefined
    }
    return await db.update('sale_orders', orderId, { note: serializeNote(merged) })
  } catch (err) {
    console.error(`[updateSaleOrderAllocation] Failed:`, err)
    throw err
  }
}

