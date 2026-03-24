/**
 * Auth API Client
 * Handles register / login via AI GO Custom App Auth
 */

const AUTH_BASE = import.meta.env.VITE_AUTH_BASE || '/api/v1/custom-app-auth'
const APP_SLUG = import.meta.env.VITE_APP_SLUG || ''

// --- Types ---

export interface AuthUser {
  id: string
  email: string
  display_name: string
  avatar_url: string | null
  is_active: boolean
  created_at: string
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  user: AuthUser
  customer_id?: string | null
}

// --- API Calls ---

async function authFetch(endpoint: string, body: Record<string, string>): Promise<AuthResponse> {
  const res = await fetch(`${AUTH_BASE}/${APP_SLUG}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    // 先嘗試解析錯誤訊息，若 body 為空則使用 HTTP 狀態碼
    let msg = `伺服器錯誤 (${res.status})`
    try {
      const data = await res.json()
      msg = typeof data.detail === 'string'
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((d: { msg: string }) => d.msg).join(', ')
          : msg
    } catch { /* JSON 解析失敗時使用預設訊息 */ }
    throw new Error(msg)
  }

  return await res.json() as AuthResponse
}

export async function register(email: string, password: string, displayName: string): Promise<AuthResponse> {
  return authFetch('register', { email, password, display_name: displayName })
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return authFetch('login', { email, password })
}
