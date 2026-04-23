/**
 * AI GO Proxy API Client
 *
 * 支援完整 CRUD 操作：
 * - GET    /{table_name}           → 查詢
 * - POST   /{table_name}/query     → 進階查詢（filters/search/order_by/select_columns）
 * - POST   /{table_name}           → 新增記錄
 * - PATCH  /{table_name}/{row_id}  → 更新記錄
 * - DELETE /{table_name}/{row_id}  → 刪除記錄
 */

// 從 .env 讀取設定
const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1/open/proxy'
const API_KEY = import.meta.env.VITE_API_KEY || ''

// --- Raw API Types ---

export interface RawProductTemplate {
  id: string
  name: string
  categ_id: string | null
  list_price: number
  default_code: string | null
  uom_id: string | null
  // 以下欄位只在需要時查詢，首屏不載入
  standard_price?: number
  type?: string
  description?: string | null
  barcode?: string | null
  sale_ok?: boolean
  active?: boolean
}

export interface RawProductCategory {
  id: string
  name: string
  parent_id: string | null
  code?: string | null
}

export interface RawCustomer {
  id: string
  name: string
  phone: string | null
  registered_address: string | null
  contact_address: string | null
  email: string | null
  customer_type: string
  note: string | null
}

export interface RawSaleOrder {
  id: string
  name: string | null
  state: string
  date_order: string
  note: string | null
  amount_untaxed: number
  amount_total: number
  customer_id: string | null
  client_order_ref: string | null
  created_at?: string
}

export interface RawSaleOrderLine {
  id: string
  order_id: string
  product_template_id: string | null
  product_id: string | null
  name: string | null
  product_uom_qty: number
  price_unit: number
  price_subtotal: number
  price_total: number
  delivery_date: string | null
  created_at?: string
}

import { useAuthStore } from '../store/useAuthStore'

/** 通用 proxy fetch — 支援所有 HTTP methods */
async function fetchProxy<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: Record<string, unknown>,
  retries = 2,
): Promise<T> {
  const url = `${API_BASE}/${endpoint}`
  const token = useAuthStore.getState().token
  const options: RequestInit = {
    method,
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  }
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body)
  }
  
  try {
    const res = await fetch(url, options)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`API error ${res.status}: ${text}`)
    }
    // DELETE 可能不回傳 body
    if (res.status === 204 || res.headers.get('content-length') === '0') {
      return undefined as T
    }
    return res.json()
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000))
      return fetchProxy(endpoint, method, body, retries - 1)
    }
    throw err
  }
}

// --- 優化後的產品/分類查詢 ---

/** 首屏需要的產品欄位（精簡 payload） */
const PRODUCT_SELECT_COLUMNS = ['id', 'name', 'categ_id', 'list_price', 'default_code', 'uom_id']
const CATEGORY_SELECT_COLUMNS = ['id', 'name', 'parent_id']

/**
 * 使用 POST query API 載入產品
 * - 伺服器端過濾 sale_ok=true, active=true
 * - 只回傳首屏需要的欄位
 * - 並行分頁載入（500 筆/頁）
 */
export async function fetchProductTemplates(): Promise<RawProductTemplate[]> {
  const PAGE_SIZE = 500
  const fetchPage = (offset: number) => fetchProxy<RawProductTemplate[]>('product_templates/query', 'POST', {
    filters: [
      { column: 'sale_ok', op: 'eq', value: true },
      { column: 'active', op: 'eq', value: true },
    ],
    select_columns: PRODUCT_SELECT_COLUMNS,
    limit: PAGE_SIZE,
    offset,
  })

  // 第一頁先拉取試探
  let all: RawProductTemplate[] = []
  try {
    const firstPage = await fetchPage(0)
    all = firstPage || []
    if (!Array.isArray(all) || all.length < PAGE_SIZE) return all
  } catch {
    return []
  }

  // 第二步：動態分頁，每次並行 2 頁避免過度消耗
  const BATCH_SIZE = 2
  let currentOffset = PAGE_SIZE
  const firstId = String((all[0] as any).id)

  while (true) {
    const batchPromises = Array.from(
      { length: BATCH_SIZE },
      (_, i) => fetchPage(currentOffset + i * PAGE_SIZE).catch(() => [] as RawProductTemplate[])
    )
    const batchResults = await Promise.all(batchPromises)
    
    let done = false
    for (const page of batchResults) {
      if (!Array.isArray(page) || page.length === 0) { done = true; break }
      // 防呆：若 server 忽略 offset 回傳相同首筆，中斷
      if (String((page[0] as any).id) === firstId) { done = true; break }

      const newItems = page.filter(item => !all.some(a => a.id === item.id))
      all = all.concat(newItems)

      if (page.length < PAGE_SIZE) { done = true; break }
    }

    if (done) break
    currentOffset += PAGE_SIZE * BATCH_SIZE
  }

  return all
}

/**
 * 使用 POST query API 載入分類（精簡欄位）
 */
export async function fetchProductCategories(): Promise<RawProductCategory[]> {
  return fetchProxy<RawProductCategory[]>('product_categories/query', 'POST', {
    select_columns: CATEGORY_SELECT_COLUMNS,
    limit: 200,
  })
}

/**
 * 查詢 uom_uom 表，回傳 { [id]: name } map
 * 用於將 product_templates.uom_id (UUID) 反查為中文單位名稱
 */
export async function fetchUomMap(): Promise<Record<string, string>> {
  try {
    const raw = await fetchProxy<{ id: string; name: string }[]>('uom_uom/query', 'POST', {
      select_columns: ['id', 'name'],
      limit: 500,
    })
    const map: Record<string, string> = {}
    for (const u of raw) {
      if (u.id && u.name) map[u.id] = u.name
    }
    return map
  } catch {
    // UoM 查詢失敗不阻塞，fallback 由 mapProducts 處理
    return {}
  }
}

export async function fetchCustomers(): Promise<RawCustomer[]> {
  return fetchProxy<RawCustomer[]>('customers')
}

// --- Sale Order CRUD ---

/** 透過後端 /order/create 建立訂單（強制 state='draft'，state 不可由前端傳入） */
export async function createOrderViaBackend(data: {
  customer_id?: string
  date_order?: string
  note?: string
  lines: Array<{
    product_template_id: string
    name: string
    product_uom_qty: number
    price_unit?: number
    delivery_date?: string
  }>
}): Promise<{ order_id: string }> {
  const token = useAuthStore.getState().token
  const res = await fetch('/order/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).message || '建立訂單失敗')
  }
  return res.json()
}

/** 建立銷貨單明細行（admin 或特殊用途直接呼叫） */
export async function createSaleOrderLine(data: {
  order_id: string
  product_template_id: string
  name: string
  product_uom_qty: number
  price_unit?: number
  delivery_date?: string
}): Promise<{ id: string; data: Record<string, unknown> }> {
  return fetchProxy('sale_order_lines', 'POST', data as Record<string, unknown>)
}

/** 查詢銷貨單（進階查詢） */
export async function querySaleOrders(
  filters?: Array<{ column: string; op: string; value: unknown }>,
  orderBy?: Array<{ column: string; direction: string }>,
  limit = 100,
  offset = 0,
): Promise<RawSaleOrder[]> {
  return fetchProxy<RawSaleOrder[]>('sale_orders/query', 'POST', {
    filters: filters || [],
    order_by: orderBy || [{ column: 'created_at', direction: 'desc' }],
    limit,
    offset,
  })
}

/** 查詢銷貨單明細行（進階查詢） */
export async function querySaleOrderLines(
  filters?: Array<{ column: string; op: string; value: unknown }>,
  limit = 500,
): Promise<RawSaleOrderLine[]> {
  return fetchProxy<RawSaleOrderLine[]>('sale_order_lines/query', 'POST', {
    filters: filters || [],
    limit,
    offset: 0,
  })
}

/** 更新銷貨單 */
export async function patchSaleOrder(
  id: string,
  data: Partial<{ state: string; note: string }>,
): Promise<unknown> {
  return fetchProxy(`sale_orders/${id}`, 'PATCH', data as Record<string, unknown>)
}

/** 刪除銷貨單 */
export async function deleteSaleOrder(id: string): Promise<unknown> {
  return fetchProxy(`sale_orders/${id}`, 'DELETE')
}

// --- Data mapping to frontend model ---

import type { Product, Category, Customer } from '../data/mockData'

export function mapCategories(raw: RawProductCategory[]): Category[] {
  const valid = raw.filter(c => c.name)
  return valid.map(c => ({
    id: c.id,
    name: c.name,
    code: c.code || c.name.charAt(0).toUpperCase(),
  }))
}

export function mapProducts(raw: RawProductTemplate[], categories: Category[], uomMap?: Record<string, string>): Product[] {
  // 防禦性去重：API 可能因 JOIN 回傳重複的 product template
  const seen = new Set<string>()
  return raw.filter(p => {
    if (!p.name || seen.has(p.id)) return false
    seen.add(p.id)
    return true
  }).map(p => {
    // 查找 UoM 名稱：先用 uomMap 反查，fallback 為「單位」
    const uomName = (p.uom_id && uomMap?.[p.uom_id]) || '單位'
    return {
      id: p.id,
      name: p.name,
      categoryId: p.categ_id || (categories.length > 0 ? categories[0].id : 'unknown'),
      unit: uomName,
      defaultCode: p.default_code || '',
      supplierId: '',
    }
  })
}

export interface RawProductPrice {
  product_product_id: string
  lst_price: number
  effective_date: string
}

/**
 * 查詢 x_product_product_price_log，回傳 { [productTemplateId]: price }
 * 找每個品項在指定配送日期前最近一筆參考價
 */
export async function fetchPricesForDate(deliveryDate: string): Promise<Record<string, number>> {
  try {
    const [priceRecs, ppRecs] = await Promise.all([
      fetchProxy<RawProductPrice[]>('x_product_product_price_log/query', 'POST', {
        filters: [{ column: 'effective_date', op: 'lte', value: deliveryDate }],
        select_columns: ['product_product_id', 'lst_price', 'effective_date'],
        order_by: [{ column: 'effective_date', direction: 'desc' }],
        limit: 1000,
      }).catch(() => [] as RawProductPrice[]),
      fetchProxy<{ id: string; product_tmpl_id: string }[]>('product_product/query', 'POST', {
        filters: [{ column: 'active', op: 'eq', value: true }],
        select_columns: ['id', 'product_tmpl_id'],
        limit: 500,
      }).catch(() => [] as { id: string; product_tmpl_id: string }[]),
    ])

    const ppToTmpl: Record<string, string> = {}
    for (const pp of ppRecs) {
      if (pp.id && pp.product_tmpl_id) ppToTmpl[pp.id] = pp.product_tmpl_id
    }

    const priceMap: Record<string, number> = {}
    for (const rec of priceRecs) {
      const tmplId = ppToTmpl[rec.product_product_id]
      if (tmplId && !(tmplId in priceMap)) {
        priceMap[tmplId] = rec.lst_price
      }
    }
    return priceMap
  } catch {
    return {}
  }
}

export function mapCustomers(raw: RawCustomer[]): Customer[] {
  return raw.filter(c => c.name).map(c => ({
    id: c.id,
    ref: c.name.slice(0, 3).toUpperCase(),
    name: c.name,
    address: c.registered_address || c.contact_address || '',
    phone: c.phone || '',
    vat: '',
    contactPerson: '',
  }))
}
