/**
 * 參照資料快取層 — 所有靜態表只抓一次，全域複用
 * 包含記憶體 Promise dedup 模式與 LocalStorage TTL 快取
 * 快取對象：customers、suppliers、uom_uom、product_templates (品項基礎)、hr_employees
 */
import { db } from './client'

const CACHE_TTL = 12 * 60 * 60 * 1000 // 12 小時

function getLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`aigo_ref_${key}`)
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (Date.now() - entry.timestamp > CACHE_TTL) return null
    return entry.data as T
  } catch {
    return null
  }
}

function setLocal<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`aigo_ref_${key}`, JSON.stringify({ data, timestamp: Date.now() }))
  } catch {}
}

const p = {
  customerMap: null as Promise<Record<string, string>> | null,
  supplierMap: null as Promise<Record<string, string>> | null,
  uomMap: null as Promise<Record<string, string>> | null,
  productUomMap: null as Promise<Record<string, string>> | null,
  productTemplates: null as Promise<any[]> | null,
  drivers: null as Promise<Array<{ id: string; name: string }>> | null,
  pid2tmpl: null as Promise<Record<string, string>> | null,
}

export function getCachedCustomerMap(): Promise<Record<string, string>> {
  if (!p.customerMap) {
    const cached = getLocal<Record<string, string>>('customerMap')
    if (cached) return p.customerMap = Promise.resolve(cached)
      
    p.customerMap = db.query('customers', { select_columns: ['id', 'name'], limit: 5000 })
      .then(data => {
        const map: Record<string, string> = {}
        data.forEach((c: any) => { map[String(c.id)] = c.name || '' })
        setLocal('customerMap', map)
        return map
      })
      .catch(() => { p.customerMap = null; return {} })
  }
  return p.customerMap
}

export function getCachedSupplierMap(): Promise<Record<string, string>> {
  if (!p.supplierMap) {
    const cached = getLocal<Record<string, string>>('supplierMap')
    if (cached) return p.supplierMap = Promise.resolve(cached)

    p.supplierMap = db.query('suppliers', { select_columns: ['id', 'name'], limit: 5000 })
      .then(data => {
        const map: Record<string, string> = {}
        data.forEach((s: any) => { map[String(s.id)] = s.name || '未知供應商' })
        setLocal('supplierMap', map)
        return map
      })
      .catch(() => { p.supplierMap = null; return {} })
  }
  return p.supplierMap
}

export function getCachedUomMap(): Promise<Record<string, string>> {
  if (!p.uomMap) {
    const cached = getLocal<Record<string, string>>('uomMap')
    if (cached) return p.uomMap = Promise.resolve(cached)

    p.uomMap = db.query('uom_uom', { select_columns: ['id', 'name'], limit: 5000 })
      .then(data => {
        const map: Record<string, string> = {}
        data.forEach((u: any) => { map[String(u.id)] = u.name || '單位' })
        setLocal('uomMap', map)
        return map
      })
      .catch(() => ({}))
  }
  return p.uomMap
}

export function getCachedProductTemplates(): Promise<any[]> {
  if (!p.productTemplates) {
    const cached = getLocal<any[]>('productTemplates')
    if (cached) return p.productTemplates = Promise.resolve(cached)

    p.productTemplates = db.query('product_templates', {
      select_columns: ['id', 'name', 'default_code', 'uom_id'],
      filters: [
        { column: 'sale_ok', op: 'eq', value: true },
        { column: 'active', op: 'eq', value: true },
      ],
      limit: 5000,
    }).then(data => {
      setLocal('productTemplates', data)
      return data
    }).catch(() => { p.productTemplates = null; return [] })
  }
  return p.productTemplates
}

export function getCachedProductUomMap(): Promise<Record<string, string>> {
  if (!p.productUomMap) {
    const cached = getLocal<Record<string, string>>('productUomMap')
    if (cached) return p.productUomMap = Promise.resolve(cached)

    p.productUomMap = (async () => {
      const [templates, uomMap] = await Promise.all([
        getCachedProductTemplates(),
        getCachedUomMap(),
      ])
      const map: Record<string, string> = {}
      templates.forEach((pr: any) => {
        const uomRaw = pr.uom_id
        let uomName = '單位'
        if (Array.isArray(uomRaw) && uomRaw.length >= 2) uomName = String(uomRaw[1])
        else if (typeof uomRaw === 'string' && uomRaw.length < 30) uomName = uomRaw
        else if (typeof uomRaw === 'string') uomName = uomMap[uomRaw] || '單位'
        map[String(pr.id)] = uomName
      })
      setLocal('productUomMap', map)
      return map
    })()
  }
  return p.productUomMap
}

export function getCachedDrivers(): Promise<Array<{ id: string; name: string }>> {
  if (!p.drivers) {
    const cached = getLocal<Array<{ id: string; name: string }>>('drivers')
    if (cached) return p.drivers = Promise.resolve(cached)

    p.drivers = db.query('hr_employees', { select_columns: ['id', 'name'], limit: 5000 })
      .then(data => {
        const res = data.map((e: any) => ({ id: String(e.id), name: e.name || '未知' }))
        setLocal('drivers', res)
        return res
      })
      .catch(() => { p.drivers = null; return [] })
  }
  return p.drivers
}

export function getCachedProductIdToTemplateMap(): Promise<Record<string, string>> {
  if (!p.pid2tmpl) {
    const cached = getLocal<Record<string, string>>('pid2tmpl')
    if (cached) return p.pid2tmpl = Promise.resolve(cached)

    p.pid2tmpl = db.query('product_products', {
      select_columns: ['id', 'product_tmpl_id'],
      limit: 5000,
    }).then(data => {
      const map: Record<string, string> = {}
      data.forEach((pr: any) => {
        const pid = String(pr.id)
        const tmplId = Array.isArray(pr.product_tmpl_id)
          ? String(pr.product_tmpl_id[0])
          : String(pr.product_tmpl_id || '')
        if (pid && tmplId) map[pid] = tmplId
      })
      setLocal('pid2tmpl', map)
      return map
    }).catch(() => { p.pid2tmpl = null; return {} })
  }
  return p.pid2tmpl
}

export async function preloadRefData(): Promise<void> {
  await Promise.all([
    getCachedCustomerMap(),
    getCachedSupplierMap(),
    getCachedUomMap(),
    getCachedProductUomMap(),
    getCachedDrivers(),
    getCachedProductIdToTemplateMap(),
  ])
}

export function clearRefCache(): void {
  p.customerMap = null
  p.supplierMap = null
  p.uomMap = null
  p.productTemplates = null
  p.productUomMap = null
  p.drivers = null
  p.pid2tmpl = null
  
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith('aigo_ref_')) localStorage.removeItem(k)
  })
}
