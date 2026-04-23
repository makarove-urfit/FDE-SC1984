/* @ai-go-sdk */
/**
 * Custom Data SDK — 供 Custom App 使用
 * 透過 fetch 直接呼叫後端 API，操作自訂資料表。
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
    throw new Error(body.detail || 'API Error (' + resp.status + ')');
  }
  return resp.json();
}

/** 送出（新增）一筆記錄到指定的資料表 */
export async function submitRecord(objectId: string, data: Record<string, any>): Promise<any> {
  const resp = await fetch(API_BASE + '/data/objects/' + objectId + '/records', {
    method: 'POST',
    headers: _getHeaders(),
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return _handleResponse(resp);
}

/** 查詢資料表的所有記錄 */
export async function listRecords(objectId: string): Promise<any[]> {
  const resp = await fetch(API_BASE + '/data/objects/' + objectId + '/records', {
    headers: _getHeaders(),
    credentials: 'include',
  });
  return _handleResponse(resp);
}

/** 更新一筆記錄 */
export async function updateRecord(objectId: string, recordId: string, data: Record<string, any>): Promise<any> {
  const resp = await fetch(API_BASE + '/data/records/' + recordId, {
    method: 'PUT',
    headers: _getHeaders(),
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return _handleResponse(resp);
}

/** 刪除一筆記錄 */
export async function deleteRecord(objectId: string, recordId: string): Promise<any> {
  const resp = await fetch(API_BASE + '/data/records/' + recordId, {
    method: 'DELETE',
    headers: _getHeaders(),
    credentials: 'include',
  });
  return _handleResponse(resp);
}
