/**
 * AI GO Proxy API Client
 *
 * 支援完整 CRUD 操作：
 * - GET    /{table_name}           → 查詢
 * - POST   /{table_name}/query     → 進階查詢（filters/search/order_by）
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
  standard_price: number
  list_price: number
  default_code: string | null
  type: string
  description: string | null
  barcode: string | null
  sale_ok: boolean
  active: boolean
  uom_id: string | null
}

export interface RawProductCategory {
  id: string
  name: string
  parent_id: string | null
  code: string | null
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

// --- Product / Category / Customer (READ) ---

export async function fetchProductTemplates(): Promise<RawProductTemplate[]> {
  const data = await fetchProxy<RawProductTemplate[]>('product_templates')
  return data.filter(p => p.active !== false && p.sale_ok !== false)
}

export async function fetchProductCategories(): Promise<RawProductCategory[]> {
  return fetchProxy<RawProductCategory[]>('product_categories')
}

export async function fetchCustomers(): Promise<RawCustomer[]> {
  return fetchProxy<RawCustomer[]>('customers')
}

// --- Sale Order CRUD ---

/** 建立銷貨單 */
export async function createSaleOrder(data: {
  customer_id?: string
  date_order: string
  note?: string
  state?: string
  client_order_ref?: string
}): Promise<{ id: string; data: Record<string, unknown> }> {
  return fetchProxy('sale_orders', 'POST', data as Record<string, unknown>)
}

/** 建立銷貨單明細行 */
export async function createSaleOrderLine(data: {
  order_id: string
  product_template_id: string
  name: string
  product_uom_qty: number
  price_unit?: number
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

export function mapProducts(raw: RawProductTemplate[], categories: Category[]): Product[] {
  return raw.filter(p => p.name).map(p => ({
    id: p.id,
    name: p.name,
    categoryId: p.categ_id || (categories.length > 0 ? categories[0].id : 'unknown'),
    unit: (p.uom_id && p.uom_id.length === 36 && p.uom_id.includes('-')) ? (p.default_code || '') : (p.uom_id || '單位'),
    defaultCode: p.default_code || '',
    supplierId: '',
  }))
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
