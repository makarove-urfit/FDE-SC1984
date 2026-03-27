import { db } from './client';

// UUID v4 格式
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Product {
  id: string;
  erp_id?: string;
  name: string;
  sku: string;
  type: string;     // 'goods', 'service' 等
  uom_id: string;   // 預設計量單位（已解析為名稱）
  category_id?: string;
  list_price: number;
  standard_price?: number;
  qty_available: number;
}

export const getProducts = async (): Promise<Product[]> => {
  let products: any[] = [];

  try {
    products = await db.query('product_templates');
  } catch (e) {
    console.warn('[stock] product_templates 查詢失敗:', e);
    return [];
  }

  return (products || []).map(p => {
    // 解析 uom_id：可能是陣列 [id, name] 或 UUID 或名稱字串
    let uomName = '';
    if (Array.isArray(p.uom_id)) {
      uomName = p.uom_id[1] || '';
    } else if (p.uom_id && !UUID_RE.test(p.uom_id)) {
      uomName = p.uom_id;
    }

    return {
      id: String(p.id),
      erp_id: p.default_code || '',
      name: p.name || 'Unknown',
      sku: p.default_code || '',
      type: 'goods',
      uom_id: uomName,
      category_id: Array.isArray(p.categ_id) ? String(p.categ_id[0]) : p.categ_id,
      list_price: p.list_price || 0,
      standard_price: p.standard_price || 0,
      qty_available: p.qty_available || 0,
    };
  });
};
