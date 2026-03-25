/**
 * Admin 全域狀態管理 — Zustand Store
 *
 * 集中管理三大資料來源（銷售訂單、產品、採購單），
 * 含 5 分鐘 TTL 快取，避免頁面切換時重複 API 呼叫。
 */
import { create } from 'zustand'
import { getSalesInvoices, type SalesInvoice } from '../api/sales'
import { getProducts, type Product } from '../api/stock'
import { getPurchaseOrders, type PurchaseOrder } from '../api/purchase'

const TTL = 5 * 60 * 1000 // 5 分鐘快取

interface AdminState {
  // 銷售訂單
  salesOrders: SalesInvoice[]
  salesLoadedAt: number
  salesLoading: boolean
  loadSales: (force?: boolean) => Promise<void>

  // 產品
  products: Product[]
  productsLoadedAt: number
  productsLoading: boolean
  loadProducts: (force?: boolean) => Promise<void>

  // 採購單
  purchaseOrders: PurchaseOrder[]
  purchasesLoadedAt: number
  purchasesLoading: boolean
  loadPurchases: (force?: boolean) => Promise<void>

  // 一次載入全部（Dashboard / PurchaseList 用）
  loadAll: (force?: boolean) => Promise<void>
}

export const useAdminStore = create<AdminState>((set, get) => ({
  // === 銷售訂單 ===
  salesOrders: [],
  salesLoadedAt: 0,
  salesLoading: false,
  loadSales: async (force = false) => {
    const { salesLoadedAt, salesLoading } = get()
    if (!force && Date.now() - salesLoadedAt < TTL) return
    if (salesLoading) return
    set({ salesLoading: true })
    try {
      const data = await getSalesInvoices()
      set({ salesOrders: data, salesLoadedAt: Date.now() })
    } catch (err) {
      console.error('[store] 載入銷售訂單失敗:', err)
    } finally {
      set({ salesLoading: false })
    }
  },

  // === 產品 ===
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

  // === 採購單 ===
  purchaseOrders: [],
  purchasesLoadedAt: 0,
  purchasesLoading: false,
  loadPurchases: async (force = false) => {
    const { purchasesLoadedAt, purchasesLoading } = get()
    if (!force && Date.now() - purchasesLoadedAt < TTL) return
    if (purchasesLoading) return
    set({ purchasesLoading: true })
    try {
      const data = await getPurchaseOrders()
      set({ purchaseOrders: data, purchasesLoadedAt: Date.now() })
    } catch (err) {
      console.error('[store] 載入採購單失敗:', err)
    } finally {
      set({ purchasesLoading: false })
    }
  },

  // === 全部載入 ===
  loadAll: async (force = false) => {
    const { loadSales, loadProducts, loadPurchases } = get()
    await Promise.all([
      loadSales(force),
      loadProducts(force),
      loadPurchases(force),
    ])
  },
}))
