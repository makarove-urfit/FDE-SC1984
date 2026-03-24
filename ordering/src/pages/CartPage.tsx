/**
 * C3 購物車 / 下單確認頁
 * 串接真實 API — 建立 sale_order + sale_order_lines
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { useAuthStore } from '../store/useAuthStore'
import ConfirmDialog from '../components/ConfirmDialog'

export default function CartPage() {
  const navigate = useNavigate()
  const { cart, updateCartQty, updateCartNote, removeFromCart, submitOrderAsync, liveProducts } = useStore()
  const { logout } = useAuthStore()
  const [orderNote, setOrderNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 用 LIVE 產品資料（若有），否則 fallback 至 productId
  const getProduct = (productId: string) =>
    liveProducts.find(p => p.id === productId)

  const cartProducts = cart.map(item => ({
    ...item,
    product: getProduct(item.productId),
  }))

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await submitOrderAsync(orderNote)
      setSubmitted(true)
      setShowConfirm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '下單失敗')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-xs">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full">
            <span className="text-4xl">✅</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">訂單已送出！</h2>
          <p className="text-gray-500">我們會在備好後通知您</p>
          <div className="space-y-2 pt-4">
            <button onClick={() => navigate('/orders')} className="w-full py-3 bg-primary text-white rounded-xl font-bold">查看訂單</button>
            <button onClick={() => { setSubmitted(false); navigate('/order') }} className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium">繼續點餐</button>
          </div>
        </div>
      </div>
    )
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <span className="text-5xl">🛒</span>
          <p className="text-gray-500">購物車是空的</p>
          <button onClick={() => navigate('/order')} className="px-6 py-2 bg-primary text-white rounded-xl font-medium">去點餐</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/order')} className="text-gray-400 hover:text-gray-600">←</button>
          <h1 className="text-lg font-bold">確認訂單</h1>
          <span className="text-sm text-gray-400">({cart.length} 項)</span>
        </div>
        <button onClick={() => { logout(); navigate('/login') }} className="text-sm text-gray-400 hover:text-red-500 transition-colors">
          登出
        </button>
      </header>

      <div className="px-4 py-4 space-y-3">
        {cartProducts.map(({ product, qty, note, productId }) => (
          <div key={productId} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="font-medium text-gray-900">{product?.name || productId}</span>
                <span className="text-sm text-gray-400 ml-2">{product?.unit || ''}</span>
              </div>
              <button onClick={() => removeFromCart(productId)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-500 w-10">數量</label>
              <input type="number" value={qty} min={0} step={0.1}
                onChange={(e) => {
                  const val = parseFloat(e.target.value)
                  if (!isNaN(val)) updateCartQty(productId, val)
                }}
                className="w-24 text-center px-2 py-1 border border-gray-200 rounded-lg bg-gray-50 font-medium" />
              <span className="text-sm text-gray-400">{product?.unit || ''}</span>
            </div>
            <input placeholder="備註（如：去頭尾、切小丁、不黑不爛）" value={note}
              onChange={(e) => updateCartNote(productId, e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 placeholder:text-gray-300" />
          </div>
        ))}

        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 mt-4">
          <h3 className="font-medium text-gray-900">📍 訂單備註</h3>
          <div>
            <textarea placeholder="如：下周二吃、需要保冰配送" value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm placeholder:text-gray-300" rows={2} />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
            ⚠️ {error}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <button onClick={() => setShowConfirm(true)} disabled={submitting}
          className="w-full py-3.5 bg-primary text-white rounded-xl font-bold text-lg hover:bg-green-700 transition-colors shadow-lg shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed">
          {submitting ? '送出中...' : `送出訂單（${cart.length} 項）`}
        </button>
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="確認送出訂單？"
        message={`將送出 ${cart.length} 項品項。送出後訂單將寫入系統。`}
        confirmText="確認送出"
        variant="info"
        onConfirm={handleSubmit}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  )
}
