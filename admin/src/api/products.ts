import { db } from './client'
import { TABLES } from './tables'
import { getCachedProductTemplates } from './refCache'

export interface Product {
  id: string            // product_products.id
  templateId: string    // product_templates.id
  name: string
  standardPrice: number // standard_price（成本價）
  lstPrice: number      // lst_price（售價）
}

export async function listProducts(): Promise<Product[]> {
  try {
    const [productProducts, templates] = await Promise.all([
      db.query<any>('product_products', {
        select_columns: ['id', 'product_tmpl_id', 'standard_price', 'lst_price'],
        filters: [{ column: 'active', op: 'eq', value: true }],
      }),
      getCachedProductTemplates(),
    ])
    const tmplNameMap: Record<string, string> = {}
    templates.forEach((t: any) => { tmplNameMap[String(t.id)] = t.name || '' })

    return (productProducts || []).map((pp: any) => {
      const tmplId = Array.isArray(pp.product_tmpl_id)
        ? String(pp.product_tmpl_id[0])
        : String(pp.product_tmpl_id || '')
      return {
        id: String(pp.id),
        templateId: tmplId,
        name: tmplNameMap[tmplId] || '未知品項',
        standardPrice: Number(pp.standard_price || 0),
        lstPrice: Number(pp.lst_price || 0),
      }
    })
  } catch {
    return []
  }
}

export async function getProductByTemplateId(templateId: string): Promise<Product | null> {
  try {
    const rows = await db.query<any>(TABLES.PRODUCT_TEMPLATES, {
      select_columns: ['id', 'name'],
      filters: [{ column: 'id', op: 'eq', value: templateId }],
    })
    if (!rows || rows.length === 0) return null
    const tmpl = rows[0]
    const ppRows = await db.query<any>('product_products', {
      select_columns: ['id', 'standard_price', 'lst_price'],
      filters: [{ column: 'product_tmpl_id', op: 'eq', value: templateId }],
    })
    const pp = ppRows?.[0]
    if (!pp) return null
    return {
      id: String(pp.id),
      templateId: templateId,
      name: String(tmpl.name || ''),
      standardPrice: Number(pp.standard_price || 0),
      lstPrice: Number(pp.lst_price || 0),
    }
  } catch {
    return null
  }
}
