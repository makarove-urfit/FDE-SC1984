/* @ai-go-sdk */
/**
 * DB Proxy SDK — 供 Custom App 存取現有 SaaS 資料表
 * 透過 fetch 直接呼叫後端 API，操作已授權的現有資料表。
 */

const API_BASE = (window as any).__API_BASE__ || '/api/v1';

function _getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = (window as any).__APP_TOKEN__ || '';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}

async function _handleResponse(resp: Response): Promise<any> {
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.detail || 'DB Proxy Error (' + resp.status + ')');
  }
  return resp.json();
}

// ─── 查詢選項介面 ─── 

interface FilterCondition {
  column: string;
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is_null' | 'is_not_null';
  value?: any;
}

interface OrderByOption {
  column: string;
  direction: 'asc' | 'desc';
}

interface QueryOptions {
  filters?: FilterCondition[];
  order_by?: OrderByOption[];
  search?: string;
  search_columns?: string[];
  select?: string[];
  limit?: number;
  offset?: number;
  count_only?: boolean;
}

// ─── 查詢 API ─── 

const appId = (window as any).__APP_ID__ || '';
const isExternal = !!(window as any).__IS_EXTERNAL__;
const proxyBase = isExternal
  ? API_BASE + '/ext/proxy/'
  : API_BASE + '/proxy/' + appId + '/';

/** 查詢引用表資料（簡易版） */
export async function query(table: string, options?: { limit?: number; offset?: number }): Promise<any[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  const qs = params.toString() ? '?' + params.toString() : '';
  const resp = await fetch(proxyBase + table + qs, {
    headers: _getHeaders(),
    credentials: 'include',
  });
  return _handleResponse(resp);
}

/**
 * 進階查詢 — 支援 filter / order_by / search / select / count_only
 *
 * 範例：
 * \`\`\`
 * // 篩選 + 排序 + 分頁
 * const rows = await db.queryAdvanced('clients', {
 *   filters: [
 *     { column: 'is_company', op: 'eq', value: true },
 *     { column: 'name', op: 'ilike', value: '%大' },
 *   ],
 *   order_by: [{ column: 'name', direction: 'asc' }],
 *   limit: 20,
 *   offset: 0,
 * });
 *
 * // 全文搜尋
 * const results = await db.queryAdvanced('clients', {
 *   search: '王',
 *   search_columns: ['name', 'phone', 'email'],
 * });
 *
 * // 只取得筆數
 * const { total } = await db.count('sale_orders', [
 *   { column: 'state', op: 'eq', value: 'sale' },
 * ]);
 * \`\`\`
 */
export async function queryAdvanced(table: string, options?: QueryOptions): Promise<any> {
  const resp = await fetch(proxyBase + table + '/query', {
    method: 'POST',
    headers: _getHeaders(),
    credentials: 'include',
    body: JSON.stringify(options || {}),
  });
  return _handleResponse(resp);
}

/** 計算符合條件的筆數 */
export async function count(table: string, filters?: FilterCondition[]): Promise<{ total: number }> {
  return queryAdvanced(table, { filters, count_only: true }) as Promise<{ total: number }>;
}

// ─── 寫入 API ─── 

/** 新增一筆記錄 */
export async function insert(table: string, data: Record<string, any>): Promise<any> {
  const resp = await fetch(proxyBase + table, {
    method: 'POST',
    headers: _getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ data }),
  });
  return _handleResponse(resp);
}

/** 更新一筆記錄 */
export async function update(table: string, id: string, data: Record<string, any>): Promise<any> {
  const resp = await fetch(proxyBase + table + '/' + id, {
    method: 'PUT',
    headers: _getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ data }),
  });
  return _handleResponse(resp);
}

/** 刪除一筆記錄 */
export async function remove(table: string, id: string): Promise<{ success: boolean }> {
  const resp = await fetch(proxyBase + table + '/' + id, {
    method: 'DELETE',
    headers: _getHeaders(),
    credentials: 'include',
  });
  return _handleResponse(resp);
}

// ─── 型別匯出（供 Custom App TypeScript 使用） ─── 
export type { FilterCondition, OrderByOption, QueryOptions };
