/**
 * 銷售訂單 — 檢視 + 確認訂單頁面
 * 搜尋、篩選、展開明細、確認訂單（單筆/批次）、列印
 */
import { useState, useMemo, useEffect } from 'react'
import BackButton from '../components/BackButton'
import { displayName, shortId } from '../utils/displayHelpers'
import { useAdminStore } from '../store/useAdminStore'
import { updateSalesInvoiceStatus } from '../api/sales'
import SearchInput from '../components/SearchInput'
import StatusDropdown from '../components/StatusDropdown'
import Pagination from '../components/Pagination'
import ConfirmDialog from '../components/ConfirmDialog'
import { usePrint, PrintArea } from '../components/PrintProvider'
import SalesInvoicePrint from '../templates/SalesInvoicePrint'

const stateOptions = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '新訂單' },
  { value: 'confirmed', label: '已確認' },
  { value: 'shipped', label: '已出貨' },
  { value: 'done', label: '已完成' },
]

const stateConfig: Record<string, { label: string; color: string }> = {
  draft:     { label: '新訂單', color: 'bg-blue-100 text-blue-700' },
  confirm:   { label: '已確認', color: 'bg-green-100 text-green-700' },
  confirmed: { label: '已確認', color: 'bg-green-100 text-green-700' },
  shipped:   { label: '已出貨', color: 'bg-orange-100 text-orange-700' },
  done:      { label: '已完成', color: 'bg-gray-100 text-gray-500' },
}

const PAGE_SIZE = 10

type ConfirmAction = { type: 'single'; orderId: string } | { type: 'batch' }

export default function SalesOrdersPage() {
  const { salesOrders, loadSales } = useAdminStore()
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const { contentRef, print: handlePrint } = usePrint()

  useEffect(() => {
    loadSales().then(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let list = salesOrders
    if (filter !== 'all') {
      if (filter === 'confirmed') list = list.filter(o => o.status === 'confirm' || o.status === 'confirmed')
      else if (filter === 'shipped') list = list.filter(o => o.status === 'shipped')
      else if (filter === 'done') list = list.filter(o => o.status === 'done')
      else list = list.filter(o => o.status === filter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(o => {
        const cName = displayName(o.customer_id, '現場客戶')
        return shortId(o.erp_id).toLowerCase().includes(q) || cName.toLowerCase().includes(q)
      })
    }
    return [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [salesOrders, filter, search])

  // 待確認訂單數量
  const draftCount = salesOrders.filter(o => o.status === 'draft').length

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const toggleOrder = (id: string) => {
    setSelectedOrders(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  const selectAll = () => {
    if (selectedOrders.size === filtered.length) setSelectedOrders(new Set())
    else setSelectedOrders(new Set(filtered.map(o => o.id)))
  }

  // 確認訂單操作
  const handleConfirm = async () => {
    if (!confirmAction) return
    try {
      if (confirmAction.type === 'single') {
        await updateSalesInvoiceStatus(confirmAction.orderId, 'confirm')
      } else {
        // 批次確認所有 draft 訂單
        const draftOrders = salesOrders.filter(o => o.status === 'draft')
        await Promise.all(draftOrders.map(o => updateSalesInvoiceStatus(o.id, 'confirm')))
      }
      await loadSales(true)
    } finally {
      setConfirmAction(null)
    }
  }

  const getDialogProps = () => {
    if (!confirmAction) return { title: '', message: '' }
    if (confirmAction.type === 'single') {
      const order = salesOrders.find(o => o.id === confirmAction.orderId)
      return {
        title: '確認此訂單？',
        message: `訂單 ${shortId(order?.erp_id)} 將標記為「已確認」，可進入採購流程。`,
      }
    }
    return {
      title: `批次確認 ${draftCount} 筆訂單？`,
      message: `所有「新訂單」將標記為「已確認」，可進入採購流程。`,
    }
  }

  const printableOrders = salesOrders.filter(o => selectedOrders.has(o.id))

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">載入中...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="text-xl font-bold text-gray-900">銷售訂單</h1>
              <p className="text-sm text-gray-400">{filtered.length} 筆訂單{draftCount > 0 && ` · ${draftCount} 筆待確認`}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {draftCount > 0 && (
              <button onClick={() => setConfirmAction({ type: 'batch' })}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                批次確認 ({draftCount})
              </button>
            )}
            <button onClick={selectAll} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50">
              {selectedOrders.size === filtered.length && filtered.length > 0 ? '取消全選' : `全選 (${filtered.length})`}
            </button>
            <button onClick={handlePrint} disabled={selectedOrders.size === 0}
              className={`px-3 py-1.5 text-sm rounded-lg ${selectedOrders.size > 0 ? 'bg-gray-600 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
              列印 ({selectedOrders.size})
            </button>
          </div>
        </div>
        <div className="flex gap-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="搜尋客戶、訂單..." className="flex-1 max-w-xs" />
          <StatusDropdown value={filter} onChange={(v) => { setFilter(v); setPage(1) }} options={stateOptions} />
        </div>
      </header>

      <div className="p-6 max-w-6xl mx-auto space-y-3">
        {paged.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p>{search || filter !== 'all' ? '無符合的訂單' : '尚無訂單'}</p>
          </div>
        ) : (
          paged.map(order => {
            const config = stateConfig[order.status] || stateConfig.draft
            const isExpanded = expanded === order.id
            const total = order.total_amount

            return (
              <div key={order.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 flex justify-between items-center hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selectedOrders.has(order.id)} onChange={() => toggleOrder(order.id)}
                      className="w-4 h-4 accent-primary rounded border-gray-300 bg-white" />
                    <button onClick={() => setExpanded(isExpanded ? null : order.id)} className="text-left">
                      <p className="font-bold text-gray-900">{displayName(order.customer_id, '現場客戶')}</p>
                      <p className="text-xs text-gray-400">{shortId(order.erp_id)} | {order.date} | {order.lines.length} 個品項</p>
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    {total > 0 && <span className="text-lg font-bold text-primary">${Math.round(total).toLocaleString()}</span>}
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>{config.label}</span>
                    {order.status === 'draft' && (
                      <button onClick={() => setConfirmAction({ type: 'single', orderId: order.id })}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                        確認訂單
                      </button>
                    )}
                    <button onClick={() => setExpanded(isExpanded ? null : order.id)} className="text-gray-400 text-xl">{isExpanded ? '\u25BE' : '\u25B8'}</button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-400 text-xs border-b border-gray-100">
                          <th className="py-2 px-4 text-left">品名</th>
                          <th className="py-2 px-4 text-right">數量</th>
                          <th className="py-2 px-4 text-right">單價</th>
                          <th className="py-2 px-4 text-right">金額</th>
                          <th className="py-2 px-4 text-left">備註</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.lines.map((line, idx) => {
                          const price = line.unit_price
                          const amount = Math.round(line.quantity * price)
                          const productName = line.name || '未知'
                          return (
                            <tr key={idx} className="border-b border-gray-50">
                              <td className="py-2 px-4 font-medium">{productName}</td>
                              <td className="py-2 px-4 text-right">{line.quantity.toFixed(2)}</td>
                              <td className="py-2 px-4 text-right">{price > 0 ? `$${price}` : <span className="text-orange-500 text-xs">待定</span>}</td>
                              <td className="py-2 px-4 text-right font-bold text-primary">{price > 0 ? `$${amount.toLocaleString()}` : '-'}</td>
                              <td className="py-2 px-4 text-gray-400 text-xs">{line.metadata?.note || ''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div className="px-4 py-2 bg-gray-50 text-right text-sm">
                      <span className="text-gray-400">小計：</span>
                      <strong className="text-primary text-lg">${Math.round(total).toLocaleString()}</strong>
                    </div>
                    {order.metadata?.note && <p className="px-4 py-1.5 text-xs text-gray-400 border-t border-gray-50">備註：{order.metadata.note}</p>}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

      <PrintArea printRef={contentRef}>
        <SalesInvoicePrint orders={printableOrders as any} />
      </PrintArea>

      <ConfirmDialog
        open={!!confirmAction}
        title={getDialogProps().title}
        message={getDialogProps().message}
        confirmText="確認"
        variant="info"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}
