/**
 * Dashboard — 兩個頁籤：每日流程、基礎設定
 */
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAdminStore } from '../store/useAdminStore'
import PageHeader from '../components/PageHeader'

type TabKey = 'daily' | 'settings'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { saleOrders, purchaseOrders } = useAdminStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: TabKey = searchParams.get('tab') === 'settings' ? 'settings' : 'daily'
  const setTab = (t: TabKey) => {
    if (t === 'daily') setSearchParams({})
    else setSearchParams({ tab: t })
  }

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

  const dailyShortcuts = [
    { label: '訂購清單', desc: '彙總所有品項', href: '/purchase-list' },
    { label: '品項價格', desc: '當日實價更新', href: '/price' },
  ]

  const settingsGroups: {
    title: string
    items: { label: string; desc: string; href: string }[]
  }[] = [
    {
      title: '商品設定',
      items: [
        { label: '產品管理', desc: '編輯產品分類', href: '/products' },
        { label: '產品分類管理', desc: '新增/修改分類', href: '/product-categories' },
        { label: '分類-買辦人對應', desc: '每個分類由誰買', href: '/category-buyer' },
      ],
    },
    {
      title: '關係對應',
      items: [
        { label: '供應商-產品對應', desc: '品項誰家供', href: '/supplier-mapping' },
        { label: '司機-客戶對應', desc: '誰送哪些客戶', href: '/driver-mapping' },
      ],
    },
    {
      title: '系統',
      items: [
        { label: '系統設定', desc: '假日、截止時間', href: '/settings' },
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PageHeader title="管理總覽" />

      <div className="pt-6 max-w-[1600px] mx-auto w-full px-6">
        <div className="flex gap-1" style={{ borderBottom: '1px solid #e5e7eb' }}>
          <TabButton active={tab === 'daily'} onClick={() => setTab('daily')}>每日流程</TabButton>
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>基礎設定</TabButton>
        </div>
      </div>

      <div className="p-6 max-w-[1600px] mx-auto w-full">

        {tab === 'daily' && (
          <div className="space-y-6">
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

            <div className="grid grid-cols-2 gap-4">
              {dailyShortcuts.map(s => (
                <button key={s.href} onClick={() => navigate(s.href)}
                  className="rounded-xl border border-gray-100 bg-white hover:bg-gray-50 p-4 text-left transition-all hover:shadow-sm">
                  <p className="font-semibold text-gray-800">{s.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="space-y-8">
            {settingsGroups.map(group => (
              <section key={group.title}>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{group.title}</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {group.items.map(item => (
                    <button key={item.href} onClick={() => navigate(item.href)}
                      className="rounded-xl border border-gray-100 bg-white hover:bg-gray-50 p-4 text-left transition-all hover:shadow-sm">
                      <p className="font-semibold text-gray-800">{item.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const base: React.CSSProperties = {
    padding: '10px 28px',
    fontSize: '14px',
    fontWeight: 600,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    cursor: 'pointer',
    marginBottom: -1,
    transition: 'all 0.15s',
  }
  const activeStyle: React.CSSProperties = {
    ...base,
    background: '#ffffff',
    color: '#111827',
    borderTop: '3px solid #2563eb',
    borderLeft: '1px solid #e5e7eb',
    borderRight: '1px solid #e5e7eb',
    borderBottom: '1px solid #ffffff',
  }
  const inactiveStyle: React.CSSProperties = {
    ...base,
    background: '#f3f4f6',
    color: '#6b7280',
    borderTop: '3px solid transparent',
    borderLeft: '1px solid #e5e7eb',
    borderRight: '1px solid #e5e7eb',
    borderBottom: '1px solid #e5e7eb',
  }
  return (
    <button onClick={onClick} style={active ? activeStyle : inactiveStyle}>
      {children}
    </button>
  )
}
