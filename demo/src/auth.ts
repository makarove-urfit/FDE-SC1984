/* @ai-go-sdk */
/**
 * Auth SDK — 用戶資訊與權限
 */

const API_BASE = (window as any).__API_BASE__ || '/api/v1';

function _getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = (window as any).__APP_TOKEN__ || '';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}

export interface AppUser {
  id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
}

export async function getCurrentUser(): Promise<AppUser | null> {
  try {
    const isExternal = !!(window as any).__IS_EXTERNAL__;
    if (isExternal) {
      const slug = (window as any).__APP_SLUG__ || '';
      const resp = await fetch(API_BASE + '/custom-app-auth/' + slug + '/me', { headers: _getHeaders() });
      if (!resp.ok) return null;
      return resp.json();
    }
    return null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  const isExternal = !!(window as any).__IS_EXTERNAL__;
  if (!isExternal) return;
  const slug = (window as any).__APP_SLUG__ || '';
  const storageKey = `custom_app_auth_${slug}`;
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    try {
      const tokens = JSON.parse(stored);
      await fetch(API_BASE + '/custom-app-auth/' + slug + '/logout', {
        method: 'POST',
        headers: _getHeaders(),
        body: JSON.stringify({ refresh_token: tokens.refresh_token || '' }),
      }).catch(() => {});
    } catch {}
  }
  localStorage.removeItem(storageKey);
}
