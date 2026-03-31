/**
 * 全域狀態管理 — Zustand Store
 *
 * 優化策略：
 * 1. products / categories 由 POST query API 載入（伺服器端過濾 + 欄位精簡）
 * 2. localStorage 快取（30 分鐘 TTL）— 二次載入即時渲染
 * 3. submitOrder 改為 async，呼叫 API 建立 sale_order + sale_order_lines
 * 4. orders 延遲載入 — 只在進入 /orders 時才觸發
 */
import { create } from 'zustand'
import { type Product, type Category } from '../data/mockData'
import { useAuthStore } from './useAuthStore'
import { useUIStore } from './useUIStore'
import {
  fetchProductTemplates,
  fetchProductCategories,
  mapCategories,
  mapProducts,
  createSaleOrder,
  querySaleOrders,
  querySaleOrderLines,
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

// === LocalStorage 快取 ===

const CACHE_KEY_PRODUCTS = 'cache_products'
const CACHE_KEY_CATEGORIES = 'cache_categories'
const CACHE_TTL = 30 * 60 * 1000 // 30 分鐘

interface CacheEntry<T> {
  data: T
  timestamp: number
}

function getCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(key)
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() }
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // localStorage 容量不足時靜默失敗
  }
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

  // 訂單（API）— 延遲載入
  apiOrders: ApiOrder[]
  ordersLoading: boolean
  loadOrders: (offset?: number) => Promise<void>
  submitOrderAsync: (note: string, onProgress?: (step: string) => void) => Promise<string>
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
    // 5 分鐘記憶體 TTL
    if (!force && Date.now() - productsLoadedAt < 5 * 60 * 1000) return
    if (productsLoading) return

    // 策略：先從 localStorage 快取立即渲染，再背景刷新
    const cachedProds = getCache<Product[]>(CACHE_KEY_PRODUCTS)
    const cachedCats = getCache<Category[]>(CACHE_KEY_CATEGORIES)
    if (cachedProds && cachedCats && !force) {
      set({
        liveProducts: cachedProds,
        liveCategories: cachedCats,
        productsLoadedAt: Date.now(),
      })
      // 背景靜默刷新（不擋 UI）
      refreshFromApi(set)
      return
    }

    // 無快取或強制刷新：顯示 loading
    set({ productsLoading: true })
    const { showLoading, hideLoading, toast } = useUIStore.getState()
    showLoading('載入菜單中...')
    try {
      await refreshFromApi(set)
    } catch (err) {
      toast('error', '載入菜單失敗，請稍後再試')
      console.error('載入產品失敗:', err)
    } finally {
      hideLoading()
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

  // === API 訂單（延遲載入） ===
  apiOrders: [],
  ordersLoading: false,
  submitError: null,

  loadOrders: async (offset = 0) => {
    set({ ordersLoading: true })
    const { showLoading, hideLoading, toast } = useUIStore.getState()
    if (offset === 0) showLoading('載入歷史訂單中...')
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
      if (offset === 0) toast('error', '載入歷史訂單失敗，請稍後重試')
      console.error('載入訂單失敗:', err)
    } finally {
      if (offset === 0) hideLoading()
      set({ ordersLoading: false })
    }
  },

  submitOrderAsync: async (note, onProgress) => {
    const { cart, liveProducts, clearCart } = get()
    if (cart.length === 0) throw new Error('購物車是空的')

    set({ submitError: null })
    try {
      // 1. 整理 Odoo One2many 格式的訂單明細
      const orderLines = cart.map(item => {
        const product = liveProducts.find(p => p.id === item.productId)
        return [0, 0, {
          product_template_id: item.productId,
          name: product ? `${product.name}${item.note ? ` (${item.note})` : ''}` : item.productId,
          product_uom_qty: item.qty,
        }]
      })

      // 2. 建立 sale_order (包含明細)
      onProgress?.('建立訂單與明細中...')
      const customerId = useAuthStore.getState().customerId
      const orderRes = await createSaleOrder({
        customer_id: customerId || undefined,
        date_order: new Date().toISOString().slice(0, 10),
        note: note || undefined,
        state: 'draft',
        order_line: orderLines,
      })
      const orderId = orderRes.id

      // 3. 清空購物車，背景刷新訂單（不阻塞）
      onProgress?.('完成！')
      clearCart()
      get().loadOrders() // fire-and-forget，不 await

      return orderId
    } catch (err) {
      const msg = err instanceof Error ? err.message : '下單失敗'
      set({ submitError: msg })
      throw err
    }
  },
}))

/** 從 API 載入產品並更新快取 */
async function refreshFromApi(set: (partial: Partial<AppState>) => void): Promise<void> {
  const [rawTemplates, rawCategories] = await Promise.all([
    fetchProductTemplates(),
    fetchProductCategories(),
  ])
  const cats = mapCategories(rawCategories)
  const prods = mapProducts(rawTemplates, cats)

  // 更新 store
  set({ liveProducts: prods, liveCategories: cats, productsLoadedAt: Date.now(), productsLoading: false })

  // 寫入 localStorage 快取
  setCache(CACHE_KEY_PRODUCTS, prods)
  setCache(CACHE_KEY_CATEGORIES, cats)
}
