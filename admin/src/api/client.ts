import axios from 'axios';

const AIGO_API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';
const APP_ID = import.meta.env.VITE_APP_SLUG;
if (!APP_ID) {
  console.error('[client] VITE_APP_SLUG 環境變數未設定');
}

export const apiClient = axios.create({
  baseURL: AIGO_API_BASE,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': import.meta.env.VITE_API_KEY || '',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// AI GO Custom App Table API helpers
export const db = {
  async query<T = any>(table: string, opts?: { limit?: number; offset?: number }): Promise<T[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));
    const qs = params.toString() ? '?' + params.toString() : '';
    
    // URL pattern: /proxy/{app_id}/{table}
    const res = await apiClient.get(`/proxy/${APP_ID}/${table}${qs}`);
    // proxy endpoint actually returns the array directly
    return res.data;
  },
  
  async update<T = any>(table: string, id: string | number, data: Record<string, any>): Promise<T> {
    const res = await apiClient.patch(`/proxy/${APP_ID}/${table}/${id}`, { data });
    return res.data;
  },

  async insert<T = any>(table: string, data: Record<string, any>): Promise<T> {
    const res = await apiClient.post(`/proxy/${APP_ID}/${table}`, { data });
    return res.data;
  }
};

export default apiClient;
