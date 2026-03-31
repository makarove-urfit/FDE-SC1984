/**
 * UI 全域狀態 — Loading Cover + Toast 通知
 *
 * withLoading: 包裝非同步操作，自動顯示/隱藏 cover + toast
 * 安全機制：最大 15 秒自動消失
 */
import { create } from 'zustand'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

interface UIState {
  // Loading Cover
  loadingVisible: boolean
  loadingText: string
  showLoading: (text?: string) => void
  hideLoading: () => void
  withLoading: <T>(fn: () => Promise<T>, text?: string, successMsg?: string) => Promise<T | undefined>

  // Toast
  toasts: Toast[]
  toast: (type: Toast['type'], message: string) => void
  removeToast: (id: string) => void
}

const MAX_TIMEOUT = 45_000

let loadingTimer: ReturnType<typeof setTimeout> | null = null

export const useUIStore = create<UIState>((set, get) => ({
  loadingVisible: false,
  loadingText: '處理中...',

  showLoading: (text = '處理中...') => {
    // 清除上一個 timeout
    if (loadingTimer) clearTimeout(loadingTimer)
    loadingTimer = setTimeout(() => {
      set({ loadingVisible: false })
      get().toast('error', '操作逾時，請重新嘗試')
    }, MAX_TIMEOUT)
    set({ loadingVisible: true, loadingText: text })
  },

  hideLoading: () => {
    if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null }
    set({ loadingVisible: false })
  },

  withLoading: async (fn, text = '處理中...', successMsg = '操作完成') => {
    const { showLoading, hideLoading, toast } = get()
    showLoading(text)
    try {
      const result = await fn()
      toast('success', successMsg)
      return result
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || '操作失敗'
      toast('error', msg)
      return undefined
    } finally {
      hideLoading()
    }
  },

  toasts: [],

  toast: (type, message) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    set(s => ({ toasts: [...s.toasts, { id, type, message }] }))
    // 3 秒後自動移除
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
    }, 3000)
  },

  removeToast: (id) => {
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
  },
}))
