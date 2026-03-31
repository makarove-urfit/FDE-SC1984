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
    let lastFirstId: string | null = null

    while (true) {
      let page: T[] = []
      try {
        if (hasAdvance) {
          const res = await apiClient.post(`/open/proxy/${table}/query`, {
            ...opts,
            limit: PAGE_SIZE,
            offset,
          })
          page = res.data
        } else {
          const params = new URLSearchParams()
          params.set('limit', String(PAGE_SIZE))
          params.set('offset', String(offset))
          const qs = params.toString() ? '?' + params.toString() : ''
          const res = await apiClient.get(`/open/proxy/${table}${qs}`)
          page = res.data
        }
      } catch (err) {
        // 如果 API 報錯（例如 400/500），中斷分頁以防死循環
        console.error(`[db.query] Failed fetching page for ${table} at offset ${offset}:`, err)
        break
      }

      if (!Array.isArray(page) || page.length === 0) break

      // 防呆：如果後端不支援 offset，永遠吐首頁資料，強制中斷
      const currentFirstId = String((page[0] as any).id)
      if (lastFirstId !== null && currentFirstId === lastFirstId) {
        console.warn(`[db.query] Offset seems ignored by server for ${table}, breaking loop to prevent infinite requests.`)
        break
      }
      lastFirstId = currentFirstId

      // 過濾重複資料（防禦性加總）
      const newItems = page.filter(item => !all.some(a => (a as any).id === (item as any).id))
      all = all.concat(newItems)

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
