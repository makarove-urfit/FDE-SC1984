/**
 * Dashboard — 三階段作業流程入口
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminStore } from '../store/useAdminStore'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { saleOrders, purchaseOrders, loadAll } = useAdminStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll().then(() => setLoading(false))
  }, [])

  const step1Count = saleOrders.filter(o => o.state === 'draft').length
  const step2Count = purchaseOrders
    .filter(o => o.state === 'draft')
    .reduce((sum, po) => sum + po.lines.filter(l => !l.received).length, 0)
  const step3Count = saleOrders.filter(o => o.state === 'sale').length

  const steps = [
    { step: '1', label: '確認訂單', desc: '審核新訂單', href: '/orders', count: step1Count, color: 'bg-blue-500' },
    { step: '2', label: '採購管理', desc: '待採購品項', href: '/purchase', count: step2Count, color: 'bg-orange-500' },
    { step: '3', label: '出貨配送', desc: '出貨給客戶', href: '/delivery', count: step3Count, color: 'bg-green-600' },
  ]

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">載入中...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 1a13 13 0 0 1 .8 13c-1 1.8-2 3.1-3.8 4.5"/><path d="M5 20c.5-1 1.4-3 2-4.5"/></svg>
          <h1 className="text-2xl font-bold text-gray-900">管理總覽</h1>
        </div>
        <p className="text-sm text-gray-400">{new Date().toISOString().slice(0, 10)}</p>
      </header>

      <div className="p-6 max-w-4xl mx-auto">
        <div className="grid grid-cols-3 gap-4">
          {steps.map(s => (
            <button key={s.step} onClick={() => navigate(s.href)}
              className="rounded-xl border border-gray-100 bg-white hover:bg-gray-50 p-5 text-left transition-all hover:shadow-md">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs text-white font-bold ${s.color} rounded-full w-6 h-6 flex items-center justify-center`}>
                  {s.step}
                </span>
                {s.count > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                    {s.count}
                  </span>
                )}
              </div>
              <p className="font-bold text-gray-900">{s.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
