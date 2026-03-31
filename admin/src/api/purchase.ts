/**
 * 採購訂單 API — 嚴格 AI GO 標準
 *
 * purchase_orders.state: draft | sent | purchase | done | cancel
 *
 * 供應商分組：透過 product_supplierinfo 間接對應
 * - product_supplierinfo.product_tmpl_id → supplier_id
 * - 無對應的品項歸「未定義供應商」
 *
 * 品項到貨狀態：qty_received > 0 即視為已到貨
 * 實際採購量：存在 qty_received 欄位
 */
import { db } from './client'
import { getUomMap, resolveUom } from './stock'
import { isUUID } from '../utils/displayHelpers'

// ─── 型別 ───

export interface PurchaseOrder {
  id: string
  name: string
  state: string           // draft | sent | purchase | done | cancel
  date: string
  supplierId: string      // 供應商原始 ID（可能是 UUID）
  supplierName: string    // 已解析的供應商名稱
  totalAmount: number
  note: string
  lines: PurchaseOrderLine[]
}

export interface PurchaseOrderLine {
  id: string
  orderId: string
  productTemplateId: string
  name: string
  quantity: number        // 需求量（唯讀，自動累加）
  actualQty: number       // 實際採購量（可編輯）
  unitPrice: number
  subtotal: number        // = actualQty × unitPrice
  uom: string             // 單位名稱
  received: boolean       // 是否已到貨
}

// 供應商對應表：product_template_id → supplier_id
export interface SupplierMapping {
  productTemplateId: string
  supplierId: string
}

// ─── 名稱解析 ───

const resolveSupplierName = (raw: any, supplierMap: Record<string, string>): string => {
  if (Array.isArray(raw)) return String(raw[1] || raw[0])
  if (typeof raw === 'string' && supplierMap[raw]) return supplierMap[raw]
  if (typeof raw === 'string' && !isUUID(raw)) return raw
  return '未定義供應商'
}

const resolveId = (raw: any): string => {
  if (Array.isArray(raw)) return String(raw[0])
  return String(raw || '')
}

// ─── API ───

/** 載入 product_supplierinfo → 產品↔供應商對應表 */
export const getSupplierMappings = async (): Promise<SupplierMapping[]> => {
  try {
    const rows = await db.query('product_supplierinfo', { select_columns: ['product_tmpl_id', 'supplier_id'] })
    return rows
      .filter((r: any) => r.product_tmpl_id && r.supplier_id)
      .map((r: any) => ({
        productTemplateId: resolveId(r.product_tmpl_id),
        supplierId: resolveId(r.supplier_id),
      }))
  } catch {
    return []
  }
}

/** 載入供應商清單 → id→name 查找表 */
export const getSupplierMap = async (): Promise<Record<string, string>> => {
  try {
    const suppliers = await db.query('suppliers', { select_columns: ['id', 'name'] })
    const map: Record<string, string> = {}
    suppliers.forEach((s: any) => { map[String(s.id)] = s.name || '未知供應商' })
    return map
  } catch {
    return {}
  }
}

export const getPurchaseOrders = async (): Promise<PurchaseOrder[]> => {
  const [orders, lines, supplierNameMap, uomMap, products] = await Promise.all([
    db.query('purchase_orders', { select_columns: ['id', 'name', 'state', 'date_order', 'supplier_id', 'amount_total', 'note'] }),
    db.query('purchase_order_lines', { select_columns: ['id', 'order_id', 'product_template_id', 'product_id', 'name', 'product_qty', 'qty_received', 'price_unit'] }),
    getSupplierMap(),
    getUomMap(),
    db.query('product_templates', { select_columns: ['id', 'uom_id'] }),
  ])

  // product_template_id → uom_id → 單位名稱
  const productUom: Record<string, string> = {}
  products.forEach((p: any) => { productUom[String(p.id)] = resolveUom(p.uom_id, uomMap) })

  return orders.map((o: any) => ({
    id: String(o.id),
    name: o.name || String(o.id),
    state: o.state || 'draft',
    date: o.date_order ? String(o.date_order).split(' ')[0] : '',
    supplierId: resolveId(o.supplier_id),
    supplierName: resolveSupplierName(o.supplier_id, supplierNameMap),
    totalAmount: o.amount_total || 0,
    note: o.note || '',
    lines: lines
      .filter((l: any) => resolveId(l.order_id) === String(o.id))
      .map((l: any) => {
        const ptId = resolveId(l.product_template_id || l.product_id)
        const actualQty = l.qty_received || 0
        const unitPrice = l.price_unit || 0
        return {
          id: String(l.id),
          orderId: String(o.id),
          productTemplateId: ptId,
          name: l.name || '未知商品',
          quantity: l.product_qty || 0,
          actualQty,
          unitPrice,
          subtotal: Math.round(actualQty * unitPrice * 100) / 100,
          uom: productUom[ptId] || '單位',
          received: actualQty > 0,
         }
      }),
  }))
}

/** 更新採購單狀態 */
export const updatePurchaseOrderState = async (id: string, state: string) => {
  return await db.update('purchase_orders', id, { state })
}

/** 更新採購單明細行（數量 / 單價 / 實際採購量） */
export const updatePurchaseOrderLine = async (
  lineId: string,
  data: { product_qty?: number; price_unit?: number; qty_received?: number },
) => {
  return await db.update('purchase_order_lines', lineId, data)
}

/**
 * 標記品項已到貨（不可逆）
 * 寫入 qty_received，並檢查是否全部到齊
 */
export const markLineReceived = async (
  lineId: string,
  poId: string,
  allLines: PurchaseOrderLine[],
  actualQty: number,
) => {
  // 1. 寫入實際採購量
  await db.update('purchase_order_lines', lineId, {
    qty_received: actualQty,
  })

  // 2. 檢查是否所有 lines 都已到貨
  const otherLines = allLines.filter(l => l.id !== lineId)
  const allReceived = otherLines.every(l => l.received)
  if (allReceived) {
    await updatePurchaseOrderState(poId, 'done')
  }
}

/**
 * 確認訂單時：自動將品項加入採購單（按供應商分組）
 *
 * 邏輯：
 * 1. 查 product_supplierinfo 決定每個品項歸哪個供應商
 * 2. 無對應的品項歸 supplier_id = '' （未定義供應商）
 * 3. 找該供應商的 draft PO：
 *    - 有且有相同品項 line → 累加數量
 *    - 有但無此品項 → 新增 line
 *    - 沒有 draft PO → 建立新 PO + line
 */
export async function autoAddToPurchaseOrder(
  orderLines: Array<{ productTemplateId: string; name: string; quantity: number }>,
): Promise<void> {
  if (orderLines.length === 0) return

  // 1. 載入供應商對應
  const mappings = await getSupplierMappings()
  const productToSupplier = new Map<string, string>()
  mappings.forEach(m => productToSupplier.set(m.productTemplateId, m.supplierId))

  // 2. 按供應商分組
  const bySupplier = new Map<string, typeof orderLines>()
  for (const line of orderLines) {
    const supplierId = productToSupplier.get(line.productTemplateId) || ''
    const group = bySupplier.get(supplierId) || []
    group.push(line)
    bySupplier.set(supplierId, group)
  }

  // 3. 載入現有 draft POs
  const existingPOs = await db.query('purchase_orders')
  const existingLines = await db.query('purchase_order_lines')

  const draftPOs = existingPOs.filter((po: any) => po.state === 'draft')

  // 4. 逐供應商處理
  for (const [supplierId, lines] of bySupplier.entries()) {
    // 找此供應商的 draft PO
    let targetPO = draftPOs.find((po: any) => {
      const poSupplierId = resolveId(po.supplier_id)
      if (supplierId === '') return !poSupplierId || poSupplierId === ''
      return poSupplierId === supplierId
    })
    let targetPOId: string

    if (targetPO) {
      targetPOId = String(targetPO.id)
    } else {
      // 建新 PO
      const poData: any = {
        date_order: new Date().toISOString().slice(0, 10),
        state: 'draft',
        note: '自動產生自銷售訂單確認',
      }
      if (supplierId) poData.supplier_id = supplierId
      const newPO = await db.insert<{ id: string }>('purchase_orders', poData)
      targetPOId = newPO.id
    }

    // 此 PO 現有的 lines
    const poLines = existingLines.filter((l: any) => resolveId(l.order_id) === targetPOId)

    // 逐品項處理
    for (const line of lines) {
      const existingLine = poLines.find(
        (l: any) => resolveId(l.product_template_id) === line.productTemplateId,
      )

      if (existingLine) {
        // 累加數量
        const newQty = Math.round(((existingLine.product_qty || 0) + line.quantity) * 100) / 100
        await db.update('purchase_order_lines', String(existingLine.id), { product_qty: newQty })
      } else {
        // 新增 line
        await db.insert('purchase_order_lines', {
          order_id: targetPOId,
          product_template_id: line.productTemplateId,
          product_qty: line.quantity,
          name: line.name,
          price_unit: 0,
        })
      }
    }
  }
}
