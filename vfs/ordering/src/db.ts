const API_BASE = (window as any).__API_BASE__ || '/api/v1';
const APP_SLUG = (window as any).__APP_SLUG__ || '';
const proxyBase = API_BASE + '/ext/proxy/';

function _h(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = (window as any).__APP_TOKEN__ || '';
  if (t) h['Authorization'] = 'Bearer ' + t;
  return h;
}

async function _r(resp: Response): Promise<any> {
  if (!resp.ok) {
    const b = await resp.json().catch(() => ({}));
    throw new Error(b.detail || 'API Error (' + resp.status + ')');
  }
  return resp.json();
}

export async function query(table: string, opts?: {
  limit?: number; offset?: number;
  filters?: any[];
  order_by?: { column: string; direction?: string }[];
  select_columns?: string[];
}): Promise<any[]> {
  if (opts?.filters || opts?.order_by || opts?.select_columns) {
    const body: any = {};
    if (opts.filters) body.filters = opts.filters;
    if (opts.order_by) body.order_by = opts.order_by;
    if (opts.select_columns) body.select_columns = opts.select_columns;
    if (opts.limit) body.limit = opts.limit;
    if (opts.offset) body.offset = opts.offset;
    return _r(await fetch(proxyBase + table + '/query', {
      method: 'POST', headers: _h(), credentials: 'include', body: JSON.stringify(body),
    }));
  }
  const p = new URLSearchParams();
  if (opts?.limit) p.set('limit', String(opts.limit));
  if (opts?.offset) p.set('offset', String(opts.offset));
  const qs = p.toString() ? '?' + p.toString() : '';
  return _r(await fetch(proxyBase + table + qs, { headers: _h(), credentials: 'include' }));
}

export async function insert(table: string, data: Record<string, any>): Promise<any> {
  return _r(await fetch(proxyBase + table, {
    method: 'POST', headers: _h(), credentials: 'include', body: JSON.stringify(data),
  }));
}

export async function fetchById(table: string, id: string): Promise<any | null> {
  const resp = await fetch(proxyBase + table + '/' + id, { headers: _h(), credentials: 'include' });
  if (!resp.ok) {
    console.error(`[db.fetchById] ${table}/${id} → ${resp.status}`, await resp.text().catch(() => ''));
    return null;
  }
  return resp.json();
}

export async function update(table: string, id: string, data: Record<string, any>): Promise<any> {
  return _r(await fetch(proxyBase + table + '/' + id, {
    method: 'PATCH', headers: _h(), credentials: 'include', body: JSON.stringify(data),
  }));
}

export async function queryCustom(slug: string): Promise<any[]> {
  const resp = await fetch(API_BASE + '/data/objects/' + slug + '/records', {
    headers: _h(), credentials: 'include',
  });
  if (!resp.ok) return [];
  return resp.json();
}

export async function runAction(actionName: string, params: Record<string, any> = {}): Promise<any> {
  const appId = (window as any).__APP_ID__ || '';
  const isExternal = !!(window as any).__IS_EXTERNAL__;
  const actionUrl = isExternal
    ? API_BASE + '/ext/actions/run/' + actionName
    : API_BASE + '/actions/run/' + appId + '/' + actionName;
  const resp = await fetch(actionUrl, {
    method: 'POST', headers: _h(), credentials: 'include',
    body: JSON.stringify({ params }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.detail || 'Action Error (' + resp.status + ')');
  }
  const result = await resp.json();
  if (result && result.status === 'error') throw new Error(result.message || 'Action Error');
  return result.data ?? result;
}
