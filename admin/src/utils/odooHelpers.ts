/**
 * Odoo API 回傳的 many2one 欄位可能是 [id, name] 陣列、純 id、物件，
 * 或者「無值」時是 false / null / undefined。本函式統一轉為 id 字串，
 * 空值一律回傳 ''（而非 'false' / 'null' 等字面字串，以免被當成合法 id）。
 */
export const resolveId = (raw: any): string => {
  if (raw === null || raw === undefined || raw === false) return ''
  if (Array.isArray(raw)) {
    const first = raw[0]
    if (first === null || first === undefined || first === false) return ''
    return String(first)
  }
  if (typeof raw === 'object' && 'id' in raw) {
    const id = (raw as { id?: unknown }).id
    if (id === null || id === undefined || id === false) return ''
    return String(id)
  }
  return String(raw)
}
