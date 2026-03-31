/**
 * Admin 全域狀態管理 — Zustand Store
 *
 * 資料來源：銷售訂單、產品、採購單、司機
 * 含 5 分鐘 TTL 快取 + 參照資料一次性預載
 */
import { create } from 'zustand'
import { getSaleOrders, type SaleOrder } from '../api/sales'
import { getProducts, type Product } from '../api/stock'
import { getPurchaseOrders, type PurchaseOrder } from '../api/purchase'
import { getTodayDateStr } from '../utils/dateHelpers'
import { preloadRefData, clearRefCache, getCachedDrivers } from '../api/refCache'

const TTL = 5 * 60 * 1000

interface AdminState {
  targetDate: string
  setTargetDate: (dateStr: string) => Promise<void>

  // 快取池 (以 dateStr 為 key)
  salesCache: Record<string, SaleOrder[]>
  purchasesCache: Record<string, PurchaseOrder[]>
  salesLoadedAt: Record<string, number>
  purchasesLoadedAt: Record<string, number>

  // 當前畫面的暴露狀態
  saleOrders: SaleOrder[]
  salesLoading: boolean
  loadSales: (dateStr: string, force?: boolean) => Promise<void>

  products: Product[]
  productsLoadedAt: number
  productsLoading: boolean
  loadProducts: (force?: boolean) => Promise<void>

  purchaseOrders: PurchaseOrder[]
  purchasesLoading: boolean
  loadPurchases: (dateStr: string, force?: boolean) => Promise<void>

  drivers: Array<{ id: string; name: string }>
  driversLoadedAt: number
  loadDrivers: (force?: boolean) => Promise<void>

  // 全域 Loading 狀態
  globalLoading: boolean
  loadAll: (force?: boolean) => Promise<void>
  /** 操作後僅刷新業務資料（不重載靜態參照快取） */
  reloadBusinessData: () => Promise<void>
}

export const useAdminStore = create<AdminState>((set, get) => ({
  targetDate: getTodayDateStr(),
  setTargetDate: async (dateStr: string) => {
    set({ targetDate: dateStr })
    // 更新對外呈現的當前指標，若已存在則直接秒切
    const state = get()
    set({
      saleOrders: state.salesCache[dateStr] || [],
      purchaseOrders: state.purchasesCache[dateStr] || [],
    })
    // 若快取不存在，觸發載入（會顯示 loading）
    if (!state.salesCache[dateStr] || !state.purchasesCache[dateStr]) {
      await get().loadAll()
    }
  },

  salesCache: {},
  purchasesCache: {},
  salesLoadedAt: {},
  purchasesLoadedAt: {},

  saleOrders: [],
  salesLoading: false,
  loadSales: async (dateStr: string, force = false) => {
    const { salesLoadedAt, salesLoading } = get()
    if (!force && (Date.now() - (salesLoadedAt[dateStr] || 0) < TTL)) return
    if (salesLoading) return
    set({ salesLoading: true })
    try {
      const data = await getSaleOrders(dateStr)
      set(state => ({
        salesCache: { ...state.salesCache, [dateStr]: data },
        salesLoadedAt: { ...state.salesLoadedAt, [dateStr]: Date.now() },
        ...(state.targetDate === dateStr ? { saleOrders: data } : {})
      }))
    } catch (err) {
      console.error('[store] 載入銷售訂單失敗:', err)
    } finally {
      set({ salesLoading: false })
    }
  },

  products: [],
  productsLoadedAt: 0,
  productsLoading: false,
  loadProducts: async (force = false) => {
    const { productsLoadedAt, productsLoading } = get()
    if (!force && Date.now() - productsLoadedAt < TTL) return
    if (productsLoading) return
    set({ productsLoading: true })
    try {
      const data = await getProducts()
      set({ products: data, productsLoadedAt: Date.now() })
    } catch (err) {
      console.error('[store] 載入產品失敗:', err)
    } finally {
      set({ productsLoading: false })
    }
  },

  purchaseOrders: [],
  purchasesLoading: false,
  loadPurchases: async (dateStr: string, force = false) => {
    const { purchasesLoadedAt, purchasesLoading } = get()
    if (!force && (Date.now() - (purchasesLoadedAt[dateStr] || 0) < TTL)) return
    if (purchasesLoading) return
    set({ purchasesLoading: true })
    try {
      const data = await getPurchaseOrders(dateStr)
      set(state => ({
        purchasesCache: { ...state.purchasesCache, [dateStr]: data },
        purchasesLoadedAt: { ...state.purchasesLoadedAt, [dateStr]: Date.now() },
        ...(state.targetDate === dateStr ? { purchaseOrders: data } : {})
      }))
    } catch (err) {
      console.error('[store] 載入採購單失敗:', err)
    } finally {
      set({ purchasesLoading: false })
    }
  },

  drivers: [],
  driversLoadedAt: 0,
  loadDrivers: async (force = false) => {
    const { driversLoadedAt } = get()
    if (!force && Date.now() - driversLoadedAt < TTL) return
    try {
      const data = await getCachedDrivers()
      set({ drivers: data, driversLoadedAt: Date.now() })
    } catch (err) {
      console.error('[store] 載入司機失敗:', err)
    }
  },

  globalLoading: false,
  loadAll: async (force = false) => {
    set({ globalLoading: true })
    try {
      // 步驟一：預載所有參照資料（快取命中時秒回）
      if (force) clearRefCache()
      await preloadRefData()

      // 步驟二：平行載入依賴日期的業務資料
      const { targetDate, loadSales, loadProducts, loadPurchases, loadDrivers } = get()
      await Promise.all([
        loadSales(targetDate, force), 
        loadProducts(force), 
        loadPurchases(targetDate, force), 
        loadDrivers(force)
      ])
    } finally {
      set({ globalLoading: false })
    }
  },

  reloadBusinessData: async () => {
    set({ globalLoading: true })
    try {
      // 僅刷新業務資料，靜態參照快取保持不變
      const { targetDate, loadSales, loadPurchases } = get()
      await Promise.all([
        loadSales(targetDate, true),
        loadPurchases(targetDate, true),
      ])
    } finally {
      set({ globalLoading: false })
    }
  },
}))
