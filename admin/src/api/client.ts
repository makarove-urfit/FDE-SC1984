import axios from 'axios';

const AIGO_API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';

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
// 使用 /open/proxy 端點（API Key 認證），與 ordering client 一致
interface QueryOptions {
  limit?: number
  offset?: number
  filters?: any[]
  order_by?: any[]
  select_columns?: string[]
}

export const db = {
  async query<T = any>(table: string, opts?: QueryOptions): Promise<T[]> {
    const hasAdvance = opts?.filters || opts?.order_by || opts?.select_columns

    // 若呼叫端明確指定 limit/offset，維持原行為（單次請求）
    if (opts?.limit !== undefined || opts?.offset !== undefined) {
      if (hasAdvance) {
        const res = await apiClient.post(`/open/proxy/${table}/query`, opts)
        return res.data
      } else {
        const params = new URLSearchParams()
        if (opts.limit !== undefined) params.set('limit', String(opts.limit))
        if (opts.offset !== undefined) params.set('offset', String(opts.offset))
        const qs = params.toString() ? '?' + params.toString() : ''
        const res = await apiClient.get(`/open/proxy/${table}${qs}`)
        return res.data
      }
    }

    // 自動分頁：每頁 200 筆，循環取完所有資料
    const PAGE_SIZE = 200
    let all: T[] = []
    let offset = 0
    while (true) {
      let page: T[]
      if (hasAdvance) {
        const res = await apiClient.post(`/open/proxy/${table}/query`, {
          ...opts,
          limit: PAGE_SIZE,
          offset,
        })
        page = res.data
      } else {
        const res = await apiClient.get(`/open/proxy/${table}?limit=${PAGE_SIZE}&offset=${offset}`)
        page = res.data
      }
      all = all.concat(page)
      if (page.length < PAGE_SIZE) break // 不足一頁 = 已到最後
      offset += PAGE_SIZE
    }
    return all
  },
  
  async update<T = any>(table: string, id: string | number, data: Record<string, any>): Promise<T> {
    const res = await apiClient.patch(`/open/proxy/${table}/${id}`, data);
    return res.data;
  },

  async insert<T = any>(table: string, data: Record<string, any>): Promise<T> {
    const res = await apiClient.post(`/open/proxy/${table}`, data);
    return res.data;
  }
};

export default apiClient;
