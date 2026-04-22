/**
 * product_templates CRUD（列表、編輯 categ_id）
 */
import { db } from './client'
import { TABLES } from './tables'
import { resolveId } from '../utils/odooHelpers'

export interface ProductTemplate {
  id: string
  name: string
  defaultCode: string
  categoryId: string
  categoryName: string
  saleOk: boolean
}

export async function listProductTemplates(): Promise<ProductTemplate[]> {
  const rows = await db.query<any>(TABLES.PRODUCT_TEMPLATES, {
    select_columns: ['id', 'name', 'default_code', 'categ_id', 'sale_ok'],
    filters: [{ column: 'active', op: 'eq', value: true }],
  })
  return (rows || []).map((r: any) => {
    const raw = r.categ_id
    const categoryName = Array.isArray(raw) && raw.length >= 2 ? String(raw[1]) : ''
    return {
      id: String(r.id),
      name: String(r.name || ''),
      defaultCode: String(r.default_code || ''),
      categoryId: resolveId(raw),
      categoryName,
      saleOk: Boolean(r.sale_ok),
    }
  })
}

export async function updateProductTemplateCategory(id: string, categoryId: string): Promise<void> {
  await db.update(TABLES.PRODUCT_TEMPLATES, id, { categ_id: categoryId })
}

export async function updateProductTemplateSaleOk(id: string, saleOk: boolean): Promise<void> {
  await db.update(TABLES.PRODUCT_TEMPLATES, id, { sale_ok: saleOk })
}
