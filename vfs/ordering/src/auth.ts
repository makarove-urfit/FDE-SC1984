const API_BASE = (window as any).__API_BASE__ || "/api/v1";
const APP_SLUG = (window as any).__APP_SLUG__ || "";

export interface AppUser {
  id: string;
  email: string;
  display_name?: string;
}

const STORAGE_KEY = `custom_app_auth_${APP_SLUG}`;

export async function getCurrentUser(): Promise<AppUser | null> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.access_token) (window as any).__APP_TOKEN__ = data.access_token;
    return data.user || null;
  } catch { return null; }
}
