/**
 * 全域狀態管理 — Zustand Store
 *
 * 核心改動：
 * 1. products / categories 由 API 載入，全域共享
 * 2. submitOrder 改為 async，呼叫 API 建立 sale_order + sale_order_lines
 * 3. orders 由 API 載入（querySaleOrders）
 * 4. 保留 Admin 端功能（procurement, stock）以免影響
 */
import { create } from 'zustand'
import { type Product, type Category } from '../data/mockData'
import { useAuthStore } from './useAuthStore'
import {
  fetchProductTemplates,
  fetchProductCategories,
  mapCategories,
  mapProducts,
  createSaleOrder,
  createSaleOrderLine,
  querySaleOrders,
  querySaleOrderLines,
  deleteSaleOrder,
  type RawSaleOrder,
  type RawSaleOrderLine,
} from '../api/client'

// === 型別定義 ===

export interface CartItem {
  productId: string
  qty: number
  note: string
}



export interface ApiOrder {
  raw: RawSaleOrder
  lines: RawSaleOrderLine[]
}



// === Store ===

interface AppState {
  // 全域產品（LIVE API）
  liveProducts: Product[]
  liveCategories: Category[]
  productsLoading: boolean
  productsLoadedAt: number
  loadProducts: (force?: boolean) => Promise<void>

  // 購物車
  cart: CartItem[]
  addToCart: (productId: string) => void
  removeFromCart: (productId: string) => void
  updateCartQty: (productId: string, qty: number) => void
  updateCartNote: (productId: string, note: string) => void
  clearCart: () => void

  // 訂單（API）
  apiOrders: ApiOrder[]
  ordersLoading: boolean
  loadOrders: (offset?: number) => Promise<void>
  submitOrderAsync: (note: string) => Promise<string>
  submitError: string | null


}

export const useStore = create<AppState>((set, get) => ({

  // === 全域產品 ===
  liveProducts: [],
  liveCategories: [],
  productsLoading: false,
  productsLoadedAt: 0,
  loadProducts: async (force = false) => {
    const { productsLoadedAt, productsLoading } = get()
    // 5 minutes TTL
    if (!force && Date.now() - productsLoadedAt < 5 * 60 * 1000) return
    if (productsLoading) return
    set({ productsLoading: true })
    try {
      const [rawTemplates, rawCategories] = await Promise.all([
        fetchProductTemplates(),
        fetchProductCategories(),
      ])
      const cats = mapCategories(rawCategories)
      const prods = mapProducts(rawTemplates, cats)
      set({ liveProducts: prods, liveCategories: cats, productsLoadedAt: Date.now() })
    } catch (err) {
      console.error('Failed to load products:', err)
    } finally {
      set({ productsLoading: false })
    }
  },

  // === 購物車 ===
  cart: [],
  addToCart: (productId) => set((s) => {
    const existing = s.cart.find(i => i.productId === productId)
    if (existing) {
      return { cart: s.cart.map(i => i.productId === productId ? { ...i, qty: Math.round((i.qty + 0.5) * 100) / 100 } : i) }
    }
    return { cart: [...s.cart, { productId, qty: 1, note: '' }] }
  }),
  removeFromCart: (productId) => set((s) => {
    const existing = s.cart.find(i => i.productId === productId)
    if (existing && existing.qty > 0.5) {
      return { cart: s.cart.map(i => i.productId === productId ? { ...i, qty: Math.round((i.qty - 0.5) * 100) / 100 } : i) }
    }
    return { cart: s.cart.filter(i => i.productId !== productId) }
  }),
  updateCartQty: (productId, qty) => set((s) => ({
    cart: qty <= 0 ? s.cart.filter(i => i.productId !== productId) : s.cart.map(i => i.productId === productId ? { ...i, qty } : i)
  })),
  updateCartNote: (productId, note) => set((s) => ({
    cart: s.cart.map(i => i.productId === productId ? { ...i, note } : i)
  })),
  clearCart: () => set({ cart: [] }),

  // === API 訂單 ===
  apiOrders: [],
  ordersLoading: false,
  submitError: null,

  loadOrders: async (offset = 0) => {
    set({ ordersLoading: true })
    try {
      const orders = await querySaleOrders(
        [],
        [{ column: 'created_at', direction: 'desc' }],
        50,
        offset,
      )
      // 批次載入所有訂單的明細行
      const orderIds = orders.map(o => o.id)
      let allLines: RawSaleOrderLine[] = []
      if (orderIds.length > 0) {
        allLines = await querySaleOrderLines(
          [{ column: 'order_id', op: 'in', value: orderIds }],
          500,
        )
      }
      const apiOrders: ApiOrder[] = orders.map(o => ({
        raw: o,
        lines: allLines.filter(l => l.order_id === o.id),
      }))
      set(state => ({ 
        apiOrders: offset > 0 ? [...state.apiOrders, ...apiOrders] : apiOrders 
      }))
    } catch (err) {
      console.error('Failed to load orders:', err)
    } finally {
      set({ ordersLoading: false })
    }
  },

  submitOrderAsync: async (note) => {
    const { cart, liveProducts, clearCart } = get()
    if (cart.length === 0) throw new Error('購物車是空的')

    set({ submitError: null })
    try {
      // 1. 建立 sale_order
      const customerId = useAuthStore.getState().customerId
      const orderRes = await createSaleOrder({
        customer_id: customerId || undefined,
        date_order: new Date().toISOString().slice(0, 10),
        note: note || undefined,
        state: 'draft',
      })
      const orderId = orderRes.id

      // 2. 建立每一行 sale_order_line
      try {
        const linePromises = cart.map(item => {
          const product = liveProducts.find(p => p.id === item.productId)
          return createSaleOrderLine({
            order_id: orderId,
            product_template_id: item.productId,
            name: product ? `${product.name}${item.note ? ` (${item.note})` : ''}` : item.productId,
            product_uom_qty: item.qty,
          })
        })
        await Promise.all(linePromises)
      } catch (lineErr) {
        // 部分失敗回滾
        await deleteSaleOrder(orderId).catch(console.error)
        throw lineErr
      }

      // 3. 清空購物車並重新載入訂單
      clearCart()
      get().loadOrders()

      return orderId
    } catch (err) {
      const msg = err instanceof Error ? err.message : '下單失敗'
      set({ submitError: msg })
      throw err
    }
  },
}))
