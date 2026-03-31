/**
 * Step 4: 出貨配送 — 按司機篩選、確認送達
 */
import { useState, useMemo, useEffect } from 'react'
import PageHeader from '../components/PageHeader'
import { useAdminStore } from '../store/useAdminStore'
import { useUIStore } from '../store/useUIStore'
import { updateSaleOrderState } from '../api/sales'
import ConfirmDialog from '../components/ConfirmDialog'
import { shortId } from '../utils/displayHelpers'

export default function DeliveryPage() {
  const { targetDate, saleOrders, loadAll } = useAdminStore()
  const { withLoading } = useUIStore()
  const [driverFilter, setDriverFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('pending') // pending (待配送) | other (其他)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => { loadAll() }, [targetDate, loadAll])

  // 已確認 + 已分配的訂單（等待出貨 or 已送達）
  const deliverableOrders = useMemo(() => {
    let list = saleOrders.filter(o =>
      (o.state === 'sale' && o.allocated) || o.state === 'done',
    )
    if (statusFilter === 'pending') {
      list = list.filter(o => o.state === 'sale')
    } else if (statusFilter === 'other') {
      list = list.filter(o => o.state === 'done')
    }
    if (driverFilter !== 'all') {
      list = list.filter(o => o.driver === driverFilter)
    }
    return list.sort((a, b) => (a.state === 'sale' ? -1 : 1) - (b.state === 'sale' ? -1 : 1))
  }, [saleOrders, driverFilter, statusFilter])

  // 取得所有有訂單的司機名（用於篩選）
  const activeDrivers = useMemo(() => {
    const set = new Set<string>()
    saleOrders
      .filter(o => (o.state === 'sale' && o.allocated) || o.state === 'done')
      .forEach(o => { if (o.driver) set.add(o.driver) })
    return Array.from(set)
  }, [saleOrders])

  const handleConfirm = async () => {
    if (!confirmId) return
    await withLoading(async () => {
      await updateSaleOrderState(confirmId, 'done')
      await useAdminStore.getState().reloadBusinessData()
    }, '記錄送達中...', '訂單已完成')
    setConfirmId(null)
  }

  const confirmOrder = saleOrders.find(o => o.id === confirmId)
  const pendingCount = deliverableOrders.filter(o => o.state === 'sale').length

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <PageHeader title="出貨配送" showBack>
        <div className="flex items-center gap-3 pt-2">
          {/* 狀態篩選 */}
          <button onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              statusFilter === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            待配送
          </button>
          <button onClick={() => setStatusFilter('other')}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              statusFilter === 'other' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            其他
          </button>
          
          <div className="w-px h-6 bg-gray-300 mx-1"></div>

          {/* 司機篩選 */}
          <button onClick={() => setDriverFilter('all')}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              driverFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            全部司機
          </button>
          {activeDrivers.map(d => (
            <button key={d} onClick={() => setDriverFilter(d)}
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                driverFilter === d ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}>
              🚚 {d}
            </button>
          ))}
          {activeDrivers.length === 0 && (
            <span className="text-xs text-gray-400 py-1 ml-2">尚無指派司機的訂單</span>
          )}
          <span className="text-sm text-gray-500 ml-2">{pendingCount} 筆待出貨</span>
        </div>
      </PageHeader>

      <div className="p-6 max-w-[1600px] mx-auto w-full space-y-3">
        {deliverableOrders.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            {driverFilter !== 'all' ? '此司機無訂單' : '目前無待出貨訂單（請先完成出庫分配）'}
          </div>
        ) : deliverableOrders.map(order => {
          const isExpanded = expanded === order.id
          const canDeliver = order.state === 'sale'
          return (
            <div key={order.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <button onClick={() => setExpanded(isExpanded ? null : order.id)}
                className="w-full px-4 py-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900">{order.customerName}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      canDeliver ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {canDeliver ? '待出貨' : '已送達'}
                    </span>
                    {order.driver && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        🚚 {order.driver}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">{shortId(order.name)} · {order.date} · {order.lines.length} 品項</p>
                </div>
                <div className="flex items-center gap-2">
                  {canDeliver && (
                    <button onClick={e => { e.stopPropagation(); setConfirmId(order.id) }}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                      確認送達
                    </button>
                  )}
                  <span className="text-gray-400 text-xl">{isExpanded ? '▾' : '▸'}</span>
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 text-xs">
                        <th className="py-1 text-left">品名</th>
                        <th className="py-1 text-right">下單量</th>
                        <th className="py-1 text-right">實際出貨量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.lines.map(line => (
                        <tr key={line.id} className="border-t border-gray-50">
                          <td className="py-1.5 font-medium">{line.name}</td>
                          <td className="py-1.5 text-right text-gray-500">
                            {line.quantity} <span className="text-xs text-gray-400">{line.uom}</span>
                          </td>
                          <td className="py-1.5 text-right font-bold">
                            {line.actualDeliveryQty > 0
                              ? <>{line.actualDeliveryQty} <span className="text-xs text-gray-400 font-normal">{line.uom}</span></>
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={!!confirmId}
        title="確認送達？"
        message={`訂單 ${shortId(confirmOrder?.name)}（${confirmOrder?.customerName}）將標記為「已送達」。此操作不可逆。`}
        confirmText="確認送達"
        variant="warning"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  )
}
