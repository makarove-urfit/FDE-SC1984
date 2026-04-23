/* @ai-go-sdk — ordering app proxy + action */
const API_BASE = (window as any).__API_BASE__ || '/api/v1';
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

/** 查詢引用表（無 filter → GET；有 filter → POST /query） */
export async function query(table: string, opts?: {
  limit?: number; offset?: number;
  filters?: { column: string; op: string; value?: any }[];
}): Promise<any[]> {
  if (opts?.filters?.length) {
    const body: any = { filters: opts.filters };
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

/** 新增（data 必須包在 { data: {...} } 內） */
export async function insert(table: string, data: Record<string, any>): Promise<any> {
  return _r(await fetch(proxyBase + table, {
    method: 'POST', headers: _h(), credentials: 'include', body: JSON.stringify({ data }),
  }));
}

/** 更新（PUT + { data: {...} }） */
export async function update(table: string, id: string, data: Record<string, any>): Promise<any> {
  return _r(await fetch(proxyBase + table + '/' + id, {
    method: 'PUT', headers: _h(), credentials: 'include', body: JSON.stringify({ data }),
  }));
}

/** 呼叫後端 Action（外部 app: /ext/actions/run/{name}；內部: /actions/run/{appId}/{name}） */
export async function runAction(actionName: string, params: Record<string, any> = {}): Promise<any> {
  const appId = (window as any).__APP_ID__ || '';
  const isExternal = !!(window as any).__IS_EXTERNAL__;
  const url = isExternal
    ? `${API_BASE}/ext/actions/run/${actionName}`
    : `${API_BASE}/actions/run/${appId}/${actionName}`;
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
