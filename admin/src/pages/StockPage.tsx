import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useAdminStore } from '../store/useAdminStore'
import SearchInput from '../components/SearchInput'
import { usePrint, PrintArea } from '../components/PrintProvider'
import StockReportPrint from '../templates/StockReportPrint'

export default function StockPage() {
  const navigate = useNavigate()
  const { products, loadProducts } = useAdminStore()
  const [loading, setLoading] = useState(true)
  const { contentRef, print: handlePrint } = usePrint()
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadProducts().then(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return products
    const q = search.toLowerCase()
    return products.filter(s => s.name.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q))
  }, [products, search])

  const totalValue = filtered.reduce((sum, s) => sum + (s.standard_price || 0), 0)
  const totalSellValue = filtered.reduce((sum, s) => sum + s.list_price, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="text-xl font-bold text-gray-900">庫存報表</h1>
              <p className="text-sm text-gray-400">{products.length} 個註冊商品</p>
            </div>
          </div>
          {products.length > 0 && (
            <button onClick={handlePrint} className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700">
              列印庫存報表
            </button>
          )}
        </div>
        {products.length > 0 && (
          <SearchInput value={search} onChange={setSearch} placeholder="搜尋商品..." className="max-w-xs" />
        )}
      </header>

      <div className="p-6 max-w-5xl mx-auto">
        {loading ? (
          <div className="text-center text-gray-400 py-12">載入中...</div>
        ) : products.length === 0 ? (
          <div className="text-center text-gray-400 py-12 space-y-2">
            <p>無可用商品</p>
            <button onClick={() => navigate('/procurement')} className="text-primary hover:underline text-sm">前往採購定價</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-sm text-gray-400">品項數</p>
                <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-sm text-gray-400">進貨成本</p>
                <p className="text-2xl font-bold text-orange-600">${Math.round(totalValue).toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-sm text-gray-400">預估營收</p>
                <p className="text-2xl font-bold text-primary">${Math.round(totalSellValue).toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                    <th className="py-3 px-4 text-left font-medium">#</th>
                    <th className="py-3 px-4 text-left font-medium">品名</th>
                    <th className="py-3 px-4 text-right font-medium">數量</th>
                    <th className="py-3 px-4 text-left font-medium">單位</th>
                    <th className="py-3 px-4 text-right font-medium">進價</th>
                    <th className="py-3 px-4 text-right font-medium">售價</th>
                    <th className="py-3 px-4 text-right font-medium">成本</th>
                    <th className="py-3 px-4 text-right font-medium">營收</th>
                    <th className="py-3 px-4 text-right font-medium">利潤</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => {
                    const priceBuy = item.standard_price || 0
                    const priceSell = item.list_price || 0
                    const qty = 0
                    
                    const cost = Math.round(priceBuy * qty)
                    const revenue = Math.round(priceSell * qty)
                    const profit = revenue - cost
                    return (
                      <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 px-4 text-gray-400">{idx + 1}</td>
                        <td className="py-2.5 px-4 font-medium">{item.name}</td>
                        <td className="py-2.5 px-4 text-right">{qty.toFixed(2)}</td>
                        <td className="py-2.5 px-4 text-gray-400">{item.uom_id}</td>
                        <td className="py-2.5 px-4 text-right">${priceBuy.toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-right font-medium text-primary">${priceSell.toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-right text-gray-600">${cost.toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-right text-gray-600">${revenue.toLocaleString()}</td>
                        <td className={`py-2.5 px-4 text-right font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${profit.toLocaleString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan={6} className="py-3 px-4 text-right">合計</td>
                    <td className="py-3 px-4 text-right text-orange-600">${Math.round(totalValue).toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-primary">${Math.round(totalSellValue).toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-green-600">${Math.round(totalSellValue - totalValue).toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      <PrintArea printRef={contentRef}>
        <StockReportPrint stockItems={products as any} />
      </PrintArea>
    </div>
  )
}
