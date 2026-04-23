/**
 * C2 Product browsing / ordering page
 * Uses global store for LIVE product data
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Category, Product } from '../data/mockData'
import SkeletonCard from '../components/SkeletonCard'
import { useStore } from '../store/useStore'
import { useAuthStore } from '../store/useAuthStore'
import { getAvailableOrderDates, formatDateOption, fetchHolidays } from '../utils/dateSelection'
import { fetchPricesForDate } from '../api/client'

export default function OrderPage() {
  const navigate = useNavigate()
  const { cart, addToCart, removeFromCart, updateCartQty, loadProducts, liveProducts, liveCategories, productsLoading } = useStore()
  const { logout, token } = useAuthStore()
  const [activeCat, setActiveCat] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // 配送日期
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState('')
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [datesLoading, setDatesLoading] = useState(true)

  // 參考價（依配送日期動態查詢）
  const [priceMap, setPriceMap] = useState<Record<string, number>>({})

  const categories: Category[] = liveCategories
  const products: Product[] = liveProducts

  useEffect(() => {
    loadProducts().catch(() => setError('無法連線 API，使用離線資料'))
  }, [loadProducts])

  useEffect(() => {
    if (categories.length > 0 && !activeCat) {
      setActiveCat(categories[0].id)
    }
  }, [categories, activeCat])

  useEffect(() => {
    setDatesLoading(true)
    fetchHolidays(token).then(holidays => {
      const dates = getAvailableOrderDates(new Date(), holidays)
      setAvailableDates(dates)
      if (dates.length > 0 && !selectedDeliveryDate) setSelectedDeliveryDate(dates[0])
    }).finally(() => setDatesLoading(false))
  }, [token])

  useEffect(() => {
    if (!selectedDeliveryDate) return
    fetchPricesForDate(selectedDeliveryDate).then(setPriceMap).catch(() => {})
  }, [selectedDeliveryDate])

  const filteredProducts = products.filter(p => p.categoryId === activeCat)
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0)

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-gray-900">雄泉鮮食</h1>
          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] rounded font-bold">LIVE</span>
          {productsLoading && <span className="text-xs text-gray-400 animate-pulse">載入中...</span>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/orders')} className="text-sm text-gray-500 hover:text-gray-700">📋 訂單</button>
          <button onClick={() => navigate('/cart')} className="relative text-sm text-gray-500 hover:text-gray-700">
            🛒 購物車
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-3 bg-primary text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {cart.length}
              </span>
            )}
          </button>
          <button onClick={() => { logout(); navigate('/login') }} className="text-sm text-gray-400 hover:text-red-500 transition-colors ml-2">
            登出
          </button>
        </div>
      </header>

      {/* 配送日期選擇 */}
      <div className="sticky top-[57px] z-10 bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-2">
        <span className="text-xs text-gray-500 shrink-0">📅 配送日：</span>
        {datesLoading ? (
          <span className="text-xs text-gray-400">載入中...</span>
        ) : availableDates.length === 0 ? (
          <span className="text-xs text-red-400">無可選日期</span>
        ) : (
          <select
            value={selectedDeliveryDate}
            onChange={e => setSelectedDeliveryDate(e.target.value)}
            className="text-xs text-gray-700 font-medium bg-transparent border-none focus:outline-none cursor-pointer"
          >
            {availableDates.map(d => <option key={d} value={d}>{formatDateOption(d)}</option>)}
          </select>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
          ⚠️ {error}
        </div>
      )}

      {/* Category tabs */}
      <div className="sticky top-[93px] z-10 bg-white border-b border-gray-100">
        <div className="flex overflow-x-auto scrollbar-hide px-4 py-2 gap-2">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeCat === cat.id
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Product grid */}
      <div className="px-4 py-4 grid grid-cols-2 gap-3">
        {productsLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          filteredProducts.map(product => {
            const inCart = cart.find(i => i.productId === product.id && i.deliveryDate === selectedDeliveryDate)
            const qty = inCart?.qty ?? 0
            return (
              <div key={product.id} className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm text-gray-900 leading-tight">{product.name}</p>
                    <p className="text-xs text-gray-400">{product.unit}</p>
                  </div>
                  {priceMap[product.id] != null && (
                    <span className="text-sm font-semibold text-primary shrink-0 ml-1">
                      ${priceMap[product.id]}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => removeFromCart(product.id, selectedDeliveryDate)}
                    disabled={qty === 0}
                    className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-200 font-bold text-lg disabled:opacity-30 disabled:cursor-not-allowed"
                  >−</button>
                  <input
                    type="number" step="0.1" min="0"
                    className="w-12 text-center font-bold text-primary bg-transparent border-b border-gray-200 focus:outline-none focus:border-primary p-0"
                    value={qty}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      if (!isNaN(val)) updateCartQty(product.id, selectedDeliveryDate, val)
                    }}
                  />
                  <span className="text-xs text-gray-400 ml-0.5">{product.unit || '單位'}</span>
                  <button
                    onClick={() => addToCart(product.id, selectedDeliveryDate)}
                    className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center text-white hover:bg-green-700 font-bold text-lg"
                  >+</button>
                </div>
              </div>
            )
          })
        )}
        {filteredProducts.length === 0 && !productsLoading && (
          <div className="col-span-2 py-12 text-center text-gray-400">
            <p>此分類暫無商品</p>
          </div>
        )}
      </div>

      {/* Floating cart bar */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          <button onClick={() => navigate('/cart')}
            className="w-full py-3.5 bg-primary text-white rounded-xl font-bold text-lg hover:bg-green-700 transition-colors shadow-lg shadow-green-200 flex items-center justify-center gap-2">
            🛒 查看購物車（{cart.length} 項）
          </button>
        </div>
      )}
    </div>
  )
}
