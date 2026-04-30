const API_BASE = (window as any).__API_BASE__ || '/api/v1';
const APP_ID = (window as any).__APP_ID__ || '';

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

// ── Custom table UUID runtime lookup ──
let _customIds: Record<string, string> | null = null;

async function _getCustomIds(): Promise<Record<string, string>> {
  if (_customIds) return _customIds;
  const resp = await fetch(API_BASE + '/data/objects', { headers: _h(), credentials: 'include' });
  if (!resp.ok) { _customIds = {}; return {}; }
  const objs: any[] = await resp.json().catch(() => []);
  _customIds = {};
  for (const obj of objs) {
    if (obj.api_slug && obj.id) _customIds[obj.api_slug] = obj.id;
  }
  return _customIds;
}

async function _cid(slugOrUuid: string): Promise<string> {
  if (slugOrUuid.length === 36 && slugOrUuid.includes('-')) return slugOrUuid;
  const ids = await _getCustomIds();
  const uuid = ids[slugOrUuid];
  if (!uuid) throw new Error(`Custom table "${slugOrUuid}" not found`);
  return uuid;
}

// ── Pagination helpers ──
const PAGE_MAX = 500;

async function _fetchPage(table: string, limit: number, offset: number): Promise<any[]> {
  const p = new URLSearchParams();
  p.set('limit', String(limit));
  p.set('offset', String(offset));
  return _r(await fetch(API_BASE + '/proxy/' + APP_ID + '/' + table + '?' + p.toString(), {
    headers: _h(), credentials: 'include',
  }));
}

async function _fetchPageFiltered(table: string, filters: any[], limit: number, offset: number): Promise<any[]> {
  return _r(await fetch(API_BASE + '/proxy/' + APP_ID + '/' + table + '/query', {
    method: 'POST', headers: _h(), credentials: 'include',
    body: JSON.stringify({ filters, limit, offset }),
  }));
}

// ── Odoo proxy API ──
export async function query(table: string, opts?: { limit?: number; offset?: number }): Promise<any[]> {
  if (opts?.limit !== undefined && opts.limit <= PAGE_MAX) return _fetchPage(table, opts.limit, opts.offset || 0);
  if (opts?.offset !== undefined) return _fetchPage(table, PAGE_MAX, opts.offset);
  let all: any[] = [], offset = 0;
  while (true) {
    const page = await _fetchPage(table, PAGE_MAX, offset);
    if (!Array.isArray(page) || page.length === 0) break;
    all = all.concat(page);
    if (page.length < PAGE_MAX) break;
    offset += PAGE_MAX;
  }
  return all;
}

export async function queryFiltered(table: string, filters: any[], limit?: number): Promise<any[]> {
  if (limit !== undefined && limit <= PAGE_MAX) return _fetchPageFiltered(table, filters, limit, 0);
  let all: any[] = [], offset = 0;
  while (true) {
    const page = await _fetchPageFiltered(table, filters, PAGE_MAX, offset);
    if (!Array.isArray(page) || page.length === 0) break;
    all = all.concat(page);
    if (page.length < PAGE_MAX) break;
    offset += PAGE_MAX;
  }
  return all;
}

export async function update(table: string, id: string, data: Record<string, any>): Promise<any> {
  return _r(await fetch(API_BASE + '/proxy/' + APP_ID + '/' + table + '/' + id, {
    method: 'PATCH', headers: _h(), credentials: 'include',
    body: JSON.stringify({ data }),
  }));
}

export async function insert(table: string, data: Record<string, any>): Promise<any> {
  return _r(await fetch(API_BASE + '/proxy/' + APP_ID + '/' + table, {
    method: 'POST', headers: _h(), credentials: 'include',
    body: JSON.stringify({ data }),
  }));
}

export async function deleteRow(table: string, id: string): Promise<void> {
  const resp = await fetch(API_BASE + '/proxy/' + APP_ID + '/' + table + '/' + id, {
    method: 'DELETE', headers: _h(), credentials: 'include',
  });
  if (!resp.ok) {
    const b = await resp.json().catch(() => ({}));
    throw new Error(b.detail || 'Delete failed (' + resp.status + ')');
  }
}

// ── Custom table API (runtime UUID lookup) ──
export async function queryCustom(slugOrUuid: string): Promise<any[]> {
  const uuid = await _cid(slugOrUuid);
  const resp = await fetch(API_BASE + '/data/objects/' + uuid + '/records', {
    headers: _h(), credentials: 'include',
  });
  if (!resp.ok) return [];
  return resp.json();
}

export async function insertCustom(slugOrUuid: string, data: Record<string, any>): Promise<any> {
  const uuid = await _cid(slugOrUuid);
  return _r(await fetch(API_BASE + '/data/objects/' + uuid + '/records', {
    method: 'POST', headers: _h(), credentials: 'include',
    body: JSON.stringify({ data }),
  }));
}

export async function updateCustom(recordId: string, data: Record<string, any>): Promise<any> {
  return _r(await fetch(API_BASE + '/data/records/' + recordId, {
    method: 'PATCH', headers: _h(), credentials: 'include',
    body: JSON.stringify({ data }),
  }));
}

export async function deleteCustom(recordId: string): Promise<void> {
  const resp = await fetch(API_BASE + '/data/records/' + recordId, {
    method: 'DELETE', headers: _h(), credentials: 'include',
  });
  if (!resp.ok) {
    const b = await resp.json().catch(() => ({}));
    throw new Error(b.detail || 'Delete failed (' + resp.status + ')');
  }
}

// Path B：先建 user（pending），回傳 user_id；再用 user_id 發 invitation 取連結
export async function createInviteUser(email: string, name: string): Promise<{ user_id: string; status: string }> {
  return _r(await fetch(API_BASE + '/invitations/admin-users', {
    method: 'POST', headers: _h(), credentials: 'include',
    body: JSON.stringify({ email, name }),
  }));
}

export async function createInvitation(userId: string, name: string): Promise<{ token: string; chat_invite_link: string; user_id: string }> {
  return _r(await fetch(API_BASE + '/invitations', {
    method: 'POST', headers: _h(), credentials: 'include',
    body: JSON.stringify({ user_id: userId, name }),
  }));
}

export async function listPendingInvitations(): Promise<Array<{ id: string; user_id: string; email: string; status: string }>> {
  const res = await _r(await fetch(API_BASE + '/invitations?status=pending&limit=500', {
    headers: _h(), credentials: 'include',
  }));
  // 後端可能回 { items: [...] } 或直接陣列；統一展平
  return Array.isArray(res) ? res : (res?.items || []);
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const resp = await fetch(API_BASE + '/invitations/' + invitationId, {
    method: 'DELETE', headers: _h(), credentials: 'include',
  });
  if (!resp.ok && resp.status !== 204) {
    const b = await resp.json().catch(() => ({}));
    throw new Error(b.detail || 'Revoke failed (' + resp.status + ')');
  }
}

export async function runAction(actionName: string, params: Record<string, any> = {}): Promise<any> {
  const appId = (window as any).__APP_ID__ || '';
  const isExternal = !!(window as any).__IS_EXTERNAL__;
  const url = isExternal
    ? `${API_BASE}/ext/actions/run/${actionName}`
    : `${API_BASE}/actions/apps/${appId}/run/${actionName}`;
  const resp = await fetch(url, {
    method: 'POST', headers: _h(), credentials: 'include',
    body: JSON.stringify({ params }),
  });
  if (!resp.ok) {
    const b = await resp.json().catch(() => ({}));
    throw new Error(b.detail || 'Action Error (' + resp.status + ')');
  }
  const result = await resp.json();
  if (result?.status === 'error') throw new Error(result.message || 'Action Error');
  return result.data ?? result;
}

export async function recalcOrderTotal(orderIds: string[]): Promise<void> {
  const unique = [...new Set(orderIds)].filter(Boolean);
  await Promise.all(unique.map(async (oid) => {
    const lines = await queryFiltered('sale_order_lines', [{ column: 'order_id', op: 'eq', value: oid }]);
    const total = (Array.isArray(lines) ? lines : []).reduce((s: number, l: any) =>
      s + Number(l.product_uom_qty || 0) * Number(l.price_unit || 0), 0);
    await update('sale_orders', oid, { amount_total: Math.round(total * 100) / 100 });
  }));
}
