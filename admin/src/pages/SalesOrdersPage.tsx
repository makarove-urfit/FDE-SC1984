/**
 * A6 Sales Orders - with search, filter, select, batch, pagination, oversell check
 */
import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { getSalesInvoices, updateSalesInvoiceStatus, type SalesInvoice } from '../api/sales'
import { getProducts, type Product } from '../api/stock'
import ConfirmDialog from '../components/ConfirmDialog'
import SearchInput from '../components/SearchInput'
import StatusDropdown from '../components/StatusDropdown'
import Pagination from '../components/Pagination'
import { usePrint, PrintArea } from '../components/PrintProvider'
import SalesInvoicePrint from '../templates/SalesInvoicePrint'

const stateOptions = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'confirmed', label: '已確認' },
  { value: 'shipped', label: '已出貨' },
  { value: 'delivered', label: '已送達' },
]

const stateConfig: Record<string, { label: string; color: string }> = {
  draft:     { label: '待處理',   color: 'bg-orange-100 text-orange-700' },
  pending:   { label: '待處理',   color: 'bg-orange-100 text-orange-700' },
  confirm:   { label: '已確認', color: 'bg-green-100 text-green-700' },
  allocated: { label: '已分配', color: 'bg-green-100 text-green-700' },
  shipped:   { label: '已出貨',   color: 'bg-blue-100 text-blue-700' },
  delivered: { label: '已送達', color: 'bg-gray-100 text-gray-600' },
  done:      { label: '已送達', color: 'bg-gray-100 text-gray-600' },
}

const PAGE_SIZE = 10

export default function SalesOrdersPage() {
  const navigate = useNavigate()
  const [salesOrders, setSalesOrders] = useState<SalesInvoice[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [confirmAction, setConfirmAction] = useState<{ type: 'single' | 'batch'; orderId?: string } | null>(null)
  const [page, setPage] = useState(1)
  const [allocatedMap, setAllocatedMap] = useState<Record<string, number>>({})
  const { contentRef, print: handlePrint } = usePrint()

  useEffect(() => {
    Promise.all([getSalesInvoices(), getProducts()]).then(([invoices, prods]) => {
      setSalesOrders(invoices)
      setProducts(prods)
      setLoading(false)
    })
  }, [])

  const getProduct = (productId: string) => products.find(s => s.id === productId)
  const getStockQty = (productId: string) => {
    const p = getProduct(productId)
    return p?.stock || 0
  }

  const filtered = useMemo(() => {
    let list = salesOrders
    if (filter !== 'all') {
      if (filter === 'confirmed') list = list.filter(o => o.status === 'confirm')
      else list = list.filter(o => o.status === filter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(o => {
        const cName = o.customer_id || ''
        return o.erp_id.toLowerCase().includes(q) || cName.toLowerCase().includes(q)
      })
    }
    return [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [salesOrders, filter, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const toggleOrder = (id: string) => {
    setSelectedOrders(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  const selectAll = () => {
    if (selectedOrders.size === filtered.length) setSelectedOrders(new Set())
    else setSelectedOrders(new Set(filtered.map(o => o.id)))
  }

  const updateAllocatedQty = (orderId: string, productId: string, qty: number) => {
    setAllocatedMap(prev => ({ ...prev, [`${orderId}_${productId}`]: qty }))
  }

  const handleConfirm = async () => {
    if (!confirmAction) return
    try {
      if (confirmAction.type === 'single' && confirmAction.orderId) {
        await updateSalesInvoiceStatus(confirmAction.orderId, 'confirm')
      } else if (confirmAction.type === 'batch') {
        const promises = []
        for (const id of selectedOrders) {
          const o = salesOrders.find(ord => ord.id === id)
          if (o && (o.status === 'draft' || o.status === 'pending')) {
            promises.push(updateSalesInvoiceStatus(id, 'confirm'))
          }
        }
        await Promise.all(promises)
      }
      
      const updated = await getSalesInvoices()
      setSalesOrders(updated)
    } finally {
      setConfirmAction(null)
      setSelectedOrders(new Set())
    }
  }

  const checkOversell = (orderId: string) => {
    const order = salesOrders.find(o => o.id === orderId)
    if (!order) return false
    return order.lines.some(l => { 
      const s = getStockQty(l.product_id)
      const allocated = allocatedMap[`${orderId}_${l.product_id}`] ?? l.quantity
      return s > 0 && allocated > s 
    })
  }

  const printableOrders = salesOrders.filter(o => selectedOrders.has(o.id))
  const batchableCount = [...selectedOrders].filter(id => { const o = salesOrders.find(ord => ord.id === id); return o?.status === 'draft' || o?.status === 'pending' }).length

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">載入中...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="text-xl font-bold text-gray-900">銷售訂單</h1>
              <p className="text-sm text-gray-400">{filtered.length} 筆訂單 | {products.length} 個註冊商品</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={selectAll} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50">
              {selectedOrders.size === filtered.length && filtered.length > 0 ? '取消全選' : `全選 (${filtered.length})`}
            </button>
            {batchableCount > 0 && (
              <button onClick={() => setConfirmAction({ type: 'batch' })} className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:opacity-90">
                批次確認 ({batchableCount})
              </button>
            )}
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

      {products.length > 0 && (
        <div className="px-6 pt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm">
            <span className="font-medium text-blue-700">商品追蹤數量：</span>
            <span className="text-blue-600 ml-2">{products.length} 個品項</span>
          </div>
        </div>
      )}

      <div className="p-6 max-w-6xl mx-auto space-y-3">
        {paged.length === 0 ? (
          <div className="text-center text-gray-400 py-12 space-y-2">
            <p>{search || filter !== 'all' ? '無符合的訂單' : '尚無訂單'}</p>
            {!search && filter === 'all' && (
              <button onClick={() => navigate('/purchase-list')} className="text-primary hover:underline text-sm">前往進貨清單</button>
            )}
          </div>
        ) : (
          paged.map(order => {
            const config = stateConfig[order.status] || stateConfig.draft
            const isExpanded = expanded === order.id
            const hasOversell = checkOversell(order.id)
            const total = order.total_amount

            return (
              <div key={order.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 flex justify-between items-center hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selectedOrders.has(order.id)} onChange={() => toggleOrder(order.id)}
                      className="w-4 h-4 accent-primary rounded border-gray-300 bg-white" />
                    <button onClick={() => setExpanded(isExpanded ? null : order.id)} className="text-left">
                      <p className="font-bold text-gray-900">{order.customer_id || '現場客戶'}</p>
                      <p className="text-xs text-gray-400">{order.erp_id} | {order.date} | {order.lines.length} 個品項</p>
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    {total > 0 && <span className="text-lg font-bold text-primary">${Math.round(total).toLocaleString()}</span>}
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>{config.label}</span>
                    {(order.status === 'draft' || order.status === 'pending') && (
                      <button onClick={() => setConfirmAction({ type: 'single', orderId: order.id })}
                        className={`px-3 py-1 rounded text-xs text-white ${hasOversell ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-green-700'}`}>
                        {hasOversell ? '超賣！' : '確認'}
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
                          <th className="py-2 px-4 text-right">需求</th>
                          <th className="py-2 px-4 text-right">分配</th>
                          <th className="py-2 px-4 text-left">單位</th>
                          <th className="py-2 px-4 text-right">庫存</th>
                          <th className="py-2 px-4 text-right">單價</th>
                          <th className="py-2 px-4 text-right">金額</th>
                          <th className="py-2 px-4 text-left">備註</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.lines.map((line, idx) => {
                          const prod = getProduct(line.product_id)
                          const price = line.unit_price
                          const stockQty = getStockQty(line.product_id)
                          const allocated = allocatedMap[`${order.id}_${line.product_id}`] ?? line.quantity
                          const amount = Math.round(allocated * price)
                          const oversell = stockQty > 0 && allocated > stockQty
                          return (
                            <tr key={idx} className={`border-b border-gray-50 ${oversell ? 'bg-red-50/50' : stockQty === 0 ? 'bg-yellow-50/50' : ''}`}>
                              <td className="py-2 px-4 font-medium">{prod?.name || '未知'}</td>
                              <td className="py-2 px-4 text-right text-gray-400">{line.quantity.toFixed(2)}</td>
                              <td className="py-2 px-4 text-right">
                                <input type="number" value={allocated} step="0.01" min="0"
                                  onChange={(e) => updateAllocatedQty(order.id, line.product_id, parseFloat(e.target.value) || 0)}
                                  className="w-20 text-right px-1.5 py-1 border border-gray-200 rounded-lg bg-white font-medium text-sm"
                                  disabled={order.status === 'confirm'} />
                              </td>
                              <td className="py-2 px-4 text-gray-400">{prod?.uom_id || '單位'}</td>
                              <td className={`py-2 px-4 text-right text-xs ${stockQty > 0 ? (oversell ? 'text-red-600 font-bold' : 'text-green-600') : 'text-orange-500'}`}>
                                {stockQty > 0 ? stockQty.toFixed(2) : 'N/A'}
                              </td>
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
        title={confirmAction?.type === 'batch' ? `批次確認 ${batchableCount} 筆訂單？` : '確認出貨？'}
        message={confirmAction?.type === 'batch'
          ? `將確認 ${batchableCount} 筆待處理訂單。`
          : '確認後分配數量將無法修改。'}
        confirmText="確認"
        variant="warning"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}
