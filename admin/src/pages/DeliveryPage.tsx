import { useState, useMemo, useEffect } from 'react'
import BackButton from '../components/BackButton'
import { getSalesInvoices, updateSalesInvoiceStatus, type SalesInvoice } from '../api/sales'
import { getProducts, type Product } from '../api/stock'
import ConfirmDialog from '../components/ConfirmDialog'
import SearchInput from '../components/SearchInput'
import StatusDropdown from '../components/StatusDropdown'
import Pagination from '../components/Pagination'
import { usePrint, PrintArea } from '../components/PrintProvider'
import DeliverySlipPrint from '../templates/DeliverySlipPrint'

const stateOptions = [
  { value: 'all', label: '全部' },
  { value: 'confirm', label: '待出貨' },
  { value: 'shipped', label: '運送中' },
  { value: 'done', label: '已送達' },
]

const stateConfig: Record<string, { label: string; color: string }> = {
  confirm: { label: '待出貨',    color: 'bg-orange-100 text-orange-700' },
  shipped: { label: '運送中', color: 'bg-blue-100 text-blue-700' },
  delivered: { label: '已送達',  color: 'bg-green-100 text-green-700' },
  done:    { label: '已送達',  color: 'bg-green-100 text-green-700' },
}

const drivers = ['司機 A', '司機 B', '司機 C']
const PAGE_SIZE = 10

type DeliveryAction = { type: 'ship' | 'deliver'; orderId: string }

export default function DeliveryPage() {
  const [salesOrders, setSalesOrders] = useState<SalesInvoice[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<DeliveryAction | null>(null)
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [driverMap, setDriverMap] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const { contentRef: batchRef, print: printBatch } = usePrint()
  const { contentRef: singleRef, print: printSingle } = usePrint()
  const [singlePrintId, setSinglePrintId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getSalesInvoices(), getProducts()]).then(([invoices, prods]) => {
      setSalesOrders(invoices)
      setProducts(prods)
      setLoading(false)
    })
  }, [])

  const getProductName = (productId: string) => products.find(p => p.id === productId)?.name || '未知'

  const deliverableOrders = useMemo(() => {
    let list = salesOrders.filter(o => ['confirm', 'shipped', 'delivered', 'done'].includes(o.status))
    if (filter !== 'all') list = list.filter(o => o.status === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(o => {
        const cName = o.customer_id || ''
        return o.erp_id.toLowerCase().includes(q) || cName.toLowerCase().includes(q)
      })
    }
    return list
  }, [salesOrders, filter, search])

  const totalPages = Math.ceil(deliverableOrders.length / PAGE_SIZE)
  const paged = deliverableOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const customerGroups = new Map<string, typeof paged>()
  for (const order of paged) {
    const cid = order.customer_id || 'Unknown'
    const list = customerGroups.get(cid) || []
    list.push(order)
    customerGroups.set(cid, list)
  }

  const handleConfirm = async () => {
    if (!confirmAction) return
    try {
      if (confirmAction.type === 'ship') await updateSalesInvoiceStatus(confirmAction.orderId, 'shipped')
      else await updateSalesInvoiceStatus(confirmAction.orderId, 'done')
      
      const updated = await getSalesInvoices()
      setSalesOrders(updated)
    } finally {
      setConfirmAction(null)
    }
  }

  const toggleOrderSelect = (orderId: string) => {
    setSelectedOrders(prev => { const next = new Set(prev); next.has(orderId) ? next.delete(orderId) : next.add(orderId); return next })
  }
  const selectAllOrders = () => {
    if (selectedOrders.size === deliverableOrders.length) setSelectedOrders(new Set())
    else setSelectedOrders(new Set(deliverableOrders.map(o => o.id)))
  }

  const handleSinglePrint = (orderId: string) => { setSinglePrintId(orderId); setTimeout(() => printSingle(), 100) }

  const batchPrintOrders = salesOrders.filter(o => selectedOrders.has(o.id))
  const singlePrintOrder = singlePrintId ? salesOrders.filter(o => o.id === singlePrintId) : []
  const actionOrder = confirmAction ? salesOrders.find(o => o.id === confirmAction.orderId) : null

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">載入中...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold text-gray-900">出貨管理</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={selectAllOrders} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50">
              {selectedOrders.size === deliverableOrders.length && deliverableOrders.length > 0 ? '取消全選' : '全選'}
            </button>
            <button onClick={printBatch} disabled={selectedOrders.size === 0}
              className={`px-3 py-1.5 text-sm rounded-lg ${selectedOrders.size > 0 ? 'bg-gray-600 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
              列印 ({selectedOrders.size})
            </button>
          </div>
        </div>
        <div className="flex gap-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="搜尋..." className="flex-1 max-w-xs" />
          <StatusDropdown value={filter} onChange={(v) => { setFilter(v); setPage(1) }} options={stateOptions} />
        </div>
      </header>

      <div className="p-6 max-w-5xl mx-auto">
        {customerGroups.size === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p>{search || filter !== 'all' ? '無符合的訂單' : '無出貨訂單'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from(customerGroups.entries()).map(([custId, custOrders]) => {
              const isExpanded = expanded === custId
              return (
                <div key={custId} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <button onClick={() => setExpanded(isExpanded ? null : custId)} className="w-full px-4 py-4 flex justify-between items-center hover:bg-gray-50">
                    <div className="text-left">
                      <p className="font-bold text-gray-900">{custId}</p>
                      <p className="text-sm text-gray-400">載入地址中...</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">{custOrders.length} 筆訂單</span>
                      <span className="text-gray-400 text-xl">{isExpanded ? '\u25BE' : '\u25B8'}</span>
                    </div>
                  </button>
                  {isExpanded && custOrders.map(order => {
                    const config = stateConfig[order.status] || stateConfig.confirm
                    return (
                      <div key={order.id} className="border-t border-gray-200">
                        <div className="px-4 py-3 flex justify-between items-center bg-gray-50">
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={selectedOrders.has(order.id)} onChange={() => toggleOrderSelect(order.id)} className="w-4 h-4 accent-primary bg-white" />
                            <div>
                              <p className="text-sm font-medium">{order.id}</p>
                              <p className="text-xs text-gray-400">{order.lines.length} 個品項</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <select value={driverMap[order.id] || ''} onChange={(e) => setDriverMap(prev => ({ ...prev, [order.id]: e.target.value }))}
                              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600">
                              <option value="">司機</option>
                              {drivers.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>{config.label}</span>
                            <button onClick={() => setPreviewId(previewId === order.id ? null : order.id)} className="px-3 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300">{previewId === order.id ? '關閉' : '預覽'}</button>
                            <button onClick={() => handleSinglePrint(order.id)} className="px-3 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300">列印</button>
                            {order.status === 'confirm' && <button onClick={() => setConfirmAction({ type: 'ship', orderId: order.id })} className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">出貨</button>}
                            {order.status === 'shipped' && <button onClick={() => setConfirmAction({ type: 'deliver', orderId: order.id })} className="px-3 py-1 bg-primary text-white rounded text-xs hover:bg-green-700">已送達</button>}
                          </div>
                        </div>
                        <div className="px-4 py-2">
                          <div className="flex flex-wrap gap-1.5">
                            {order.lines.map((line, i) => {
                              const pName = getProductName(line.product_id)
                              return <span key={i} className="px-2 py-0.5 bg-gray-50 rounded text-xs text-gray-500">{pName} x{line.quantity}</span>
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

      <PrintArea printRef={batchRef}><DeliverySlipPrint orders={batchPrintOrders as any} /></PrintArea>
      <PrintArea printRef={singleRef}><DeliverySlipPrint orders={singlePrintOrder as any} /></PrintArea>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.type === 'ship' ? '確認出貨？' : '確認送達？'}
        message={`訂單 ${actionOrder?.erp_id}，客戶：${actionOrder?.customer_id}`}
        confirmText={confirmAction?.type === 'ship' ? '出貨' : '已送達'}
        variant={confirmAction?.type === 'deliver' ? 'info' : 'warning'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}
