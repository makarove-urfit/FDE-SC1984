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

export default function OrderPage() {
  const navigate = useNavigate()
  const { cart, addToCart, removeFromCart, updateCartQty, loadProducts, liveProducts, liveCategories, productsLoading } = useStore()
  const { logout } = useAuthStore()
  const [activeCat, setActiveCat] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // 使用全域 store 的 LIVE 資料
  const categories: Category[] = liveCategories
  const products: Product[] = liveProducts
  const isLive = true

  useEffect(() => {
    loadProducts().catch(() => setError('無法連線 API，使用離線資料'))
  }, [loadProducts])

  useEffect(() => {
    if (categories.length > 0 && !activeCat) {
      setActiveCat(categories[0].id)
    }
  }, [categories, activeCat])

  const filteredProducts = products.filter(p => p.categoryId === activeCat)
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0)

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-gray-900">雄泉鮮食</h1>
          {isLive && <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] rounded font-bold">LIVE</span>}
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

      {error && (
        <div className="mx-4 mt-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
          ⚠️ {error}
        </div>
      )}

      {/* Category tabs */}
      <div className="sticky top-[57px] z-10 bg-white border-b border-gray-100">
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
            const inCart = cart.find(i => i.productId === product.id)
          return (
            <div key={product.id} className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
              <div>
                <p className="font-medium text-sm text-gray-900 leading-tight">{product.name}</p>
                <p className="text-xs text-gray-400">{product.unit}</p>
              </div>
              {inCart ? (
                <div className="flex items-center justify-between">
                  <button onClick={() => removeFromCart(product.id)}
                    className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-200 font-bold text-lg">−</button>
                  <input type="number" step="0.1" min="0"
                    className="w-12 text-center font-bold text-primary bg-transparent border-b border-gray-200 focus:outline-none focus:border-primary p-0"
                    value={inCart.qty}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      if (!isNaN(val)) updateCartQty(product.id, val)
                    }}
                  />
                  <button onClick={() => addToCart(product.id)}
                    className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center text-white hover:bg-green-700 font-bold text-lg">+</button>
                </div>
              ) : (
                <button onClick={() => addToCart(product.id)}
                  className="w-full py-1.5 bg-gray-50 text-gray-600 rounded-lg text-sm font-medium hover:bg-primary hover:text-white transition-colors">
                  + 加入
                </button>
              )}
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
            🛒 查看購物車（{cart.length} 項，共 {totalItems} 單位）
          </button>
        </div>
      )}
    </div>
  )
}
