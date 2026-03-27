import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminStore } from '../store/useAdminStore'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { salesOrders, purchaseOrders, loadAll } = useAdminStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll().then(() => setLoading(false))
  }, [])

  // 從 store 資料即時計算 stats
  const totalSalesOrders = salesOrders.length
  const totalPurchaseOrders = purchaseOrders.length
  const pendingShipments = salesOrders.filter(s => s.status !== 'posted' && s.status !== 'done').length
  const pendingReceives = purchaseOrders.filter(p => p.status !== 'received' && p.status !== 'done').length
  const todaySalesVolume = salesOrders.reduce((sum, inv) => sum + (inv.total_amount || 0), 0)

  // 各階段精確計數
  const draftCount = salesOrders.filter(s => s.status === 'draft').length
  const confirmedCount = salesOrders.filter(s => s.status === 'confirm' || s.status === 'confirmed').length
  const shippingCount = salesOrders.filter(s => s.status === 'confirm' || s.status === 'confirmed' || s.status === 'shipped').length

  const stats = { totalSalesOrders, totalPurchaseOrders, pendingShipments, pendingReceives, todaySalesVolume }

  const steps = [
    { step: '1', label: '確認訂單', desc: `${draftCount} 筆待確認`, href: '/sales-orders', count: draftCount },
    { step: '2', label: '訂單接收', desc: `${confirmedCount} 筆已確認`, href: '/purchase-list', count: confirmedCount },
    { step: '3', label: '採購定價', desc: `${stats?.totalPurchaseOrders || 0} 筆採購單`, href: '/procurement', count: stats?.totalPurchaseOrders || 0 },
    { step: '4', label: '出貨管理', desc: `${shippingCount} 筆待出貨`, href: '/delivery', count: shippingCount },
    { step: '5', label: '庫存報表', desc: '查看庫存', href: '/stock', count: 0 },
  ]

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">載入中...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 1a13 13 0 0 1 .8 13c-1 1.8-2 3.1-3.8 4.5"/><path d="M5 20c.5-1 1.4-3 2-4.5"/></svg>
          <h1 className="text-2xl font-bold text-gray-900">管理總覽</h1>
        </div>
        <p className="text-sm text-gray-400">{new Date().toISOString().slice(0,10)} 總覽（即時 API）</p>
      </header>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {l: '銷售訂單總數', v: stats?.totalSalesOrders, c: 'text-gray-900'},
            {l: '待出貨', v: stats?.pendingShipments, c: 'text-orange-600'},
            {l: '待收貨', v: stats?.pendingReceives, c: 'text-blue-600'},
            {l: '銷售額', v: `$${stats?.todaySalesVolume?.toLocaleString() || 0}`, c: 'text-green-600'}
          ].map(s => (
            <div key={s.l} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-sm text-gray-400">{s.l}</p><p className={`text-3xl font-bold ${s.c}`}>{s.v}</p>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-bold text-gray-900 mb-4">作業流程</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="workflow-steps">
            {steps.map(s => (
              <button key={s.label} onClick={() => navigate(s.href)} className="rounded-xl border border-gray-100 bg-white hover:bg-gray-50 p-4 text-left transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-medium bg-gray-100 rounded-full w-5 h-5 flex items-center justify-center">{s.step}</span>
                  {s.count > 0 && <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">{s.count}</span>}
                </div>
                <p className="font-medium mt-1 text-gray-900 text-sm">{s.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
