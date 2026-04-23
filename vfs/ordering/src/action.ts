/* @ai-go-sdk */
/**
 * Server-Side Action SDK — 供 Custom App 呼叫後端 Python Action
 * 透過 fetch 直接呼叫後端 API，觸發後端安全沙箱執行 Action。
 * 使用前需先在「開發」Tab 的 actions/ 目錄中建立 Action。
 */

const API_BASE = (window as any).__API_BASE__ || '/api/v1';

function _getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = (window as any).__APP_TOKEN__ || '';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}

/**
 * 呼叫後端 Action
 * @param actionName Action 名稱（需與 actions/ 目錄中的檔名一致）
 * @param params 傳入 Action 的參數
 * @returns {{ data, file }} — data 為 Action 回傳的 JSON，file 為檔案物件（若有）
 */
export async function runAction(
  actionName: string,
  params: Record<string, any> = {}
): Promise<any> {
  const appId = (window as any).__APP_ID__ || '';
  const isExternal = !!(window as any).__IS_EXTERNAL__;
  const actionUrl = isExternal
    ? API_BASE + '/ext/actions/run/' + actionName
    : API_BASE + '/actions/run/' + appId + '/' + actionName;
  const resp = await fetch(actionUrl, {
    method: 'POST',
    headers: _getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ params }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.detail || 'Action Error (' + resp.status + ')');
  }

  const result = await resp.json();
  if (result && result.status === 'error') {
    throw new Error(result.message || 'Action Error');
  }

  return {
    data: result.data || result,
    file: result.file || undefined,
  };
}

/**
 * 下載檔案（原生瀏覽器下載）
 * @param file 檔案物件，包含 content_base64, filename, mime_type 欄位
 */
export function downloadFile(file: any) {
  if (!file || !file.content_base64) return;
  const byteChars = atob(file.content_base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: file.mime_type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
