/**
 * Step 1: 確認訂單 — 逐筆確認 draft → sale
 */
import { useState, useMemo, useEffect } from 'react'
import PageHeader from '../components/PageHeader'
import { useAdminStore } from '../store/useAdminStore'
import { useUIStore } from '../store/useUIStore'
import { updateSaleOrderState } from '../api/sales'
import { autoAddToPurchaseOrder } from '../api/purchase'
import SearchInput from '../components/SearchInput'
import StatusDropdown from '../components/StatusDropdown'
import Pagination from '../components/Pagination'
import ConfirmDialog from '../components/ConfirmDialog'
import { shortId } from '../utils/displayHelpers'

const stateOptions = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '待確認' },
  { value: 'sale', label: '已確認' },
  { value: 'done', label: '已完成' },
]

const stateConfig: Record<string, { label: string; color: string }> = {
  draft: { label: '待確認', color: 'bg-blue-100 text-blue-700' },
  sent:  { label: '已報價', color: 'bg-yellow-100 text-yellow-700' },
  sale:  { label: '已確認', color: 'bg-green-100 text-green-700' },
  done:  { label: '已完成', color: 'bg-gray-100 text-gray-500' },
  cancel:{ label: '已取消', color: 'bg-red-100 text-red-500' },
}

const PAGE_SIZE = 10

export default function OrdersPage() {
  const { targetDate, saleOrders, loadSales } = useAdminStore()
  const { withLoading } = useUIStore()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => { loadSales(targetDate) }, [targetDate, loadSales])

  const filtered = useMemo(() => {
    let list = saleOrders
    if (filter !== 'all') list = list.filter(o => o.state === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(o =>
        shortId(o.name).toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q),
      )
    }
    return [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [saleOrders, filter, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleConfirm = async () => {
    if (!confirmId) return
    const order = saleOrders.find(o => o.id === confirmId)
    await withLoading(async () => {
      // 1. 確認訂單 (draft → sale)
      await updateSaleOrderState(confirmId, 'sale')
      // 2. 自動將品項加入採購單（按供應商分組）
      if (order) {
        await autoAddToPurchaseOrder(
          order.lines.map(l => ({
            productTemplateId: l.productTemplateId,
            productId: l.productId,
            name: l.name,
            quantity: l.quantity,
          })),
        )
      }
      // 3. 重新載入
      await useAdminStore.getState().reloadBusinessData()
    }, '確認訂單中...', '訂單已確認')
    setConfirmId(null)
  }

  const confirmOrder = saleOrders.find(o => o.id === confirmId)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <PageHeader title="確認訂單" showBack>
        <div className="flex items-center gap-3 pt-2">
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="搜尋客戶、訂單..." className="w-80" />
          <StatusDropdown value={filter} onChange={v => { setFilter(v); setPage(1) }} options={stateOptions} />
          <span className="text-sm text-gray-500 ml-2">{filtered.length} 筆訂單</span>
        </div>
      </PageHeader>

      <div className="p-6 max-w-[1600px] mx-auto w-full space-y-3">
        {paged.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            {search || filter !== 'all' ? '無符合的訂單' : '尚無訂單'}
          </div>
        ) : paged.map(order => {
          const config = stateConfig[order.state] || stateConfig.draft
          const isExpanded = expanded === order.id
          return (
            <div key={order.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div onClick={() => setExpanded(isExpanded ? null : order.id)}
                className="w-full px-4 py-4 flex justify-between items-center hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900">{order.customerName}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>{config.label}</span>
                  </div>
                  <p className="text-sm text-gray-400">{shortId(order.name)} · {order.date} · {order.lines.length} 品項 · NT${order.totalAmount.toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {order.state === 'draft' && (
                    <button onClick={e => { e.stopPropagation(); setConfirmId(order.id) }}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                      確認訂單
                    </button>
                  )}
                  <span className="text-gray-400 text-xl">{isExpanded ? '▾' : '▸'}</span>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 text-xs">
                        <th className="py-1 text-left">品名</th>
                        <th className="py-1 text-right">數量</th>
                        <th className="py-1 text-right">單價</th>
                        <th className="py-1 text-right">小計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.lines.map(line => (
                        <tr key={line.id} className="border-t border-gray-50">
                          <td className="py-1.5 font-medium">{line.name}</td>
                          <td className="py-1.5 text-right">{line.quantity}</td>
                          <td className="py-1.5 text-right text-gray-500">NT${line.unitPrice}</td>
                          <td className="py-1.5 text-right font-bold">NT${line.subtotal.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {order.note && <p className="text-xs text-gray-400 mt-2 bg-gray-50 px-2 py-1 rounded">📝 {order.note}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

      <ConfirmDialog
        open={!!confirmId}
        title="確認此訂單？"
        message={`訂單 ${shortId(confirmOrder?.name)} 將標記為「已確認」。此操作不可逆，確認後訂單將進入採購流程。`}
        confirmText="確認訂單"
        variant="warning"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  )
}
