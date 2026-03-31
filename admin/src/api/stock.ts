/**
 * 產品 API — 品名 + 單位查找
 */
import { db } from './client'

export interface Product {
  id: string
  name: string
  sku: string
  uom: string       // 單位名稱（如 台斤、包、箱）
}

/**
 * 解析 UoM 欄位 — 支援三種格式：
 * 1. [uuid, "台斤"] → "台斤"
 * 2. "台斤"         → "台斤"
 * 3. uuid           → 查 uomMap
 */
const resolveUom = (raw: any, uomMap: Record<string, string>): string => {
  if (Array.isArray(raw) && raw.length >= 2) return String(raw[1])
  if (typeof raw === 'string') {
    // 如果不像 UUID，直接用（可能已經是名稱）
    if (raw.length < 30) return raw
    // 是 UUID → 查表
    return uomMap[raw] || ''
  }
  return ''
}

/** 取得 UoM 查找表：uuid → 名稱 */
export const getUomMap = async (): Promise<Record<string, string>> => {
  try {
    const uoms = await db.query('uom_uom')
    const map: Record<string, string> = {}
    uoms.forEach((u: any) => { map[String(u.id)] = u.name || '' })
    return map
  } catch {
    return {}
  }
}

export const getProducts = async (): Promise<Product[]> => {
  const [templates, uomMap] = await Promise.all([
    db.query('product_templates'),
    getUomMap(),
  ])
  return templates.map((t: any) => ({
    id: String(t.id),
    name: t.name || '未知商品',
    sku: t.default_code || '-',
    uom: resolveUom(t.uom_id, uomMap),
  }))
}

/** 解析單位（export 給其他 API 使用） */
export { resolveUom }

/** 取得司機（配送員）清單 from hr_employees */
export const getDrivers = async (): Promise<Array<{ id: string; name: string }>> => {
  try {
    const employees = await db.query('hr_employees')
    return employees.map((e: any) => ({
      id: String(e.id),
      name: e.name || '未知',
    }))
  } catch {
    return []
  }
}
