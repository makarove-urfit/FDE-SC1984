/**
 * 參照資料快取層 — 所有靜態表只抓一次，全域複用
 * 使用 Promise dedup 模式：並行請求同一表時，共用同一個 Promise，避免重複發送
 *
 * 快取對象：customers、suppliers、uom_uom、product_templates (品項基礎)、hr_employees
 */
import { db } from './client'

// ─── 內部快取（Promise dedup 模式）───

let _customerMapPromise: Promise<Record<string, string>> | null = null
let _supplierMapPromise: Promise<Record<string, string>> | null = null
let _uomMapPromise: Promise<Record<string, string>> | null = null
let _productUomMapPromise: Promise<Record<string, string>> | null = null
let _driversPromise: Promise<Array<{ id: string; name: string }>> | null = null
let _pid2tmplPromise: Promise<Record<string, string>> | null = null

// ─── 公開 API ───

/** 客戶 id → name 查找表（含快取 + dedup） */
export function getCachedCustomerMap(): Promise<Record<string, string>> {
  if (!_customerMapPromise) {
    _customerMapPromise = db.query('customers', { select_columns: ['id', 'name'], limit: 5000 })
      .then(data => {
        const map: Record<string, string> = {}
        data.forEach((c: any) => { map[String(c.id)] = c.name || '' })
        return map
      })
      .catch(() => { _customerMapPromise = null; return {} })
  }
  return _customerMapPromise
}

/** 供應商 id → name 查找表（含快取 + dedup） */
export function getCachedSupplierMap(): Promise<Record<string, string>> {
  if (!_supplierMapPromise) {
    _supplierMapPromise = db.query('suppliers', { select_columns: ['id', 'name'], limit: 5000 })
      .then(data => {
        const map: Record<string, string> = {}
        data.forEach((s: any) => { map[String(s.id)] = s.name || '未知供應商' })
        return map
      })
      .catch(() => { _supplierMapPromise = null; return {} })
  }
  return _supplierMapPromise
}

/** UoM id → name 查找表（含快取 + dedup） */
export function getCachedUomMap(): Promise<Record<string, string>> {
  if (!_uomMapPromise) {
    _uomMapPromise = db.query('uom_uom', { select_columns: ['id', 'name'], limit: 5000 })
      .then(data => {
        const map: Record<string, string> = {}
        data.forEach((u: any) => { map[String(u.id)] = u.name || '單位' })
        return map
      })
      .catch(() => ({}))
  }
  return _uomMapPromise
}

// 原始 product_templates 資料快取（Promise dedup）
let _productTemplatesPromise: Promise<any[]> | null = null

/** 取得快取的 product_templates 原始資料 */
export function getCachedProductTemplates(): Promise<any[]> {
  if (!_productTemplatesPromise) {
    _productTemplatesPromise = db.query('product_templates', {
      select_columns: ['id', 'name', 'default_code', 'uom_id'],
      filters: [
        { column: 'sale_ok', op: 'eq', value: true },
        { column: 'active', op: 'eq', value: true },
      ],
      limit: 5000,
    }).catch(() => { _productTemplatesPromise = null; return [] })
  }
  return _productTemplatesPromise
}

/** product_template id → uom 名稱（含快取 + dedup） */
export function getCachedProductUomMap(): Promise<Record<string, string>> {
  if (!_productUomMapPromise) {
    _productUomMapPromise = (async () => {
      const [templates, uomMap] = await Promise.all([
        getCachedProductTemplates(),
        getCachedUomMap(),
      ])

      const map: Record<string, string> = {}
      templates.forEach((p: any) => {
        const uomRaw = p.uom_id
        let uomName = '單位'
        if (Array.isArray(uomRaw) && uomRaw.length >= 2) uomName = String(uomRaw[1])
        else if (typeof uomRaw === 'string' && uomRaw.length < 30) uomName = uomRaw
        else if (typeof uomRaw === 'string') uomName = uomMap[uomRaw] || '單位'
        map[String(p.id)] = uomName
      })
      return map
    })()
  }
  return _productUomMapPromise
}

/** 司機清單（含快取 + dedup） */
export function getCachedDrivers(): Promise<Array<{ id: string; name: string }>> {
  if (!_driversPromise) {
    _driversPromise = db.query('hr_employees', { select_columns: ['id', 'name'], limit: 5000 })
      .then(data => data.map((e: any) => ({ id: String(e.id), name: e.name || '未知' })))
      .catch(() => { _driversPromise = null; return [] })
  }
  return _driversPromise
}

/** product_products.id → product_templates.id 映射表（含快取 + dedup） */
export function getCachedProductIdToTemplateMap(): Promise<Record<string, string>> {
  if (!_pid2tmplPromise) {
    _pid2tmplPromise = db.query('product_products', {
      select_columns: ['id', 'product_tmpl_id'],
      limit: 5000,
    }).then(data => {
      const map: Record<string, string> = {}
      data.forEach((p: any) => {
        const pid = String(p.id)
        const tmplId = Array.isArray(p.product_tmpl_id)
          ? String(p.product_tmpl_id[0])
          : String(p.product_tmpl_id || '')
        if (pid && tmplId) map[pid] = tmplId
      })
      return map
    }).catch(() => { _pid2tmplPromise = null; return {} })
  }
  return _pid2tmplPromise
}

/**
 * 預載所有參照資料（一次性平行載入）
 * 由於使用 Promise dedup，即使 loadAll 和各 API 同時呼叫也不會重複發送
 */
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

/** 強制清除全部快取（用於 force reload） */
export function clearRefCache(): void {
  _customerMapPromise = null
  _supplierMapPromise = null
  _uomMapPromise = null
  _productTemplatesPromise = null
  _productUomMapPromise = null
  _driversPromise = null
  _pid2tmplPromise = null
}
