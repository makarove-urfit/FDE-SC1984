/**
 * Dashboard — 四階段作業流程入口
 */
import { useNavigate } from 'react-router-dom'
import { useAdminStore } from '../store/useAdminStore'
import PageHeader from '../components/PageHeader'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { saleOrders, purchaseOrders } = useAdminStore()

  const step1Count = saleOrders.filter(o => o.state === 'draft').length
  const step2Count = purchaseOrders
    .filter(o => o.state === 'draft')
    .reduce((sum, po) => sum + po.lines.filter(l => !l.received).length, 0)
  const step3Count = saleOrders.filter(o => o.state === 'sale' && !o.allocated).length
  const step4Count = saleOrders.filter(o => o.state === 'sale' && o.allocated).length

  const steps = [
    { step: '1', label: '確認訂單', desc: '審核新訂單', href: '/orders', count: step1Count, color: 'bg-blue-500' },
    { step: '2', label: '採購管理', desc: '待採購品項', href: '/purchase', count: step2Count, color: 'bg-orange-500' },
    { step: '3', label: '出庫分配', desc: '分配出貨量', href: '/allocation', count: step3Count, color: 'bg-purple-500' },
    { step: '4', label: '出貨配送', desc: '配送給客戶', href: '/delivery', count: step4Count, color: 'bg-green-600' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PageHeader title="管理總覽" />

      <div className="p-6 max-w-[1600px] mx-auto w-full">
        <div className="grid grid-cols-4 gap-6">
          {steps.map(s => (
            <button key={s.step} onClick={() => navigate(s.href)}
              className="rounded-xl border border-gray-100 bg-white hover:bg-gray-50 p-6 text-left transition-all hover:shadow-md">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs text-white font-bold ${s.color} rounded-full w-6 h-6 flex items-center justify-center`}>
                  {s.step}
                </span>
                {s.count > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">{s.count}</span>
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
