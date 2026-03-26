/**
 * A3 採購定價頁（合併成交價 + 利潤率）— 含確認 Dialog
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { updatePurchaseOrderStatus, type PurchaseOrder } from '../api/purchase'
import { useAdminStore } from '../store/useAdminStore'
import ConfirmDialog from '../components/ConfirmDialog'
import { displayName, shortId } from '../utils/displayHelpers'

const stateLabel: Record<string, { text: string; color: string }> = {
  draft: { text: '待採購', color: 'bg-gray-100 text-gray-500' },
  pending: { text: '待採購', color: 'bg-gray-100 text-gray-500' },
  confirm: { text: '已定價', color: 'bg-blue-100 text-blue-700' },
  received: { text: '已入庫', color: 'bg-green-100 text-green-700' },
  done: { text: '已完成', color: 'bg-green-100 text-green-700' },
}

// 實務上這會有多種操作
type ConfirmAction = { type: 'price'; orderId: string } | { type: 'receive'; orderId: string } | { type: 'batchPrice' } | { type: 'batchStock' }

export default function ProcurementPage() {
  const navigate = useNavigate()
  const { purchaseOrders: procurementOrders, products, loadPurchases, loadProducts } = useAdminStore()
  const [loading, setLoading] = useState(true)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  useEffect(() => {
    Promise.all([loadPurchases(), loadProducts()]).then(() => setLoading(false))
  }, [])

  const supplierGroups = new Map<string, PurchaseOrder[]>()
  for (const item of procurementOrders) {
    const list = supplierGroups.get(item.supplier_id) || []
    list.push(item)
    supplierGroups.set(item.supplier_id, list)
  }

  const pendingCount = procurementOrders.filter(i => i.status === 'draft' || i.status === 'pending').length
  const pricedCount = procurementOrders.filter(i => i.status === 'confirm').length
  const stockedCount = procurementOrders.filter(i => i.status === 'received' || i.status === 'done').length

  const handleConfirm = async () => {
    if (!confirmAction) return
    try {
      switch (confirmAction.type) {
        case 'price': await updatePurchaseOrderStatus(confirmAction.orderId, 'confirm'); break
        case 'receive': await updatePurchaseOrderStatus(confirmAction.orderId, 'received'); break
        case 'batchPrice': 
          await Promise.all(procurementOrders.filter(i => i.status === 'draft' || i.status === 'pending').map(o => updatePurchaseOrderStatus(o.id, 'confirm'))); break
        case 'batchStock': 
          await Promise.all(procurementOrders.filter(i => i.status === 'confirm').map(o => updatePurchaseOrderStatus(o.id, 'received'))); break
      }
      // 強制刷新 store 快取
      await loadPurchases(true)
    } finally {
      setConfirmAction(null)
    }
  }

  const getDialogProps = () => {
    if (!confirmAction) return { title: '', message: '' }
    switch (confirmAction.type) {
      case 'price': return { title: `確認採購單?`, message: `採購單狀態將標記為已確認` }
      case 'receive': return { title: `將採購單進行收貨入庫?`, message: `實際進貨數量將登錄至庫存` }
      case 'batchPrice': return { title: '批次確認所有品項？', message: `將確認 ${pendingCount} 個品項。` }
      case 'batchStock': return { title: '批次入庫所有定價品項？', message: `將入庫 ${pricedCount} 個已定價品項。` }
    }
  }

  const getSupplierName = (id: string) => displayName(id, '未指定供應商')
  
  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading procurements...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600">←</button>
          <div>
            <h1 className="text-xl font-bold">採購定價與入庫</h1>
            <p className="text-sm text-gray-400">{pendingCount} 待採購 · {pricedCount} 已確認 · {stockedCount} 已收貨</p>
          </div>
        </div>
        <div className="flex gap-2">
          {pendingCount > 0 && (
            <button onClick={() => setConfirmAction({ type: 'batchPrice' })} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              批次確認訂單
            </button>
          )}
          {pricedCount > 0 && (
            <button onClick={() => setConfirmAction({ type: 'batchStock' })} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-green-700">
              批次入庫已定價品項
            </button>
          )}
        </div>
      </header>

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {procurementOrders.length === 0 ? (
          <div className="text-center text-gray-400 py-12 space-y-2">
            <p>尚無採購單紀錄</p>
            <button onClick={() => navigate('/purchase-list')} className="text-primary hover:underline text-sm">前往列表 →</button>
          </div>
        ) : (
          Array.from(supplierGroups.entries()).map(([suppId, pOrders]) => {
            const groupTotal = pOrders.reduce((sum, o) => sum + o.total_amount, 0)
            return (
              <div key={suppId} className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-6">
                <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold">{getSupplierName(suppId)}</h3>
                    <p className="text-xs text-gray-400">{pOrders.length} 張單據</p>
                  </div>
                  <span className="text-sm font-bold text-gray-600">總金額: ${Math.round(groupTotal).toLocaleString()}</span>
                </div>
                
                {pOrders.map(order => {
                  const { text, color } = stateLabel[order.status] || stateLabel.draft
                  return (
                    <div key={order.id} className="border-b border-gray-100 last:border-0 p-4">
                      <div className="flex justify-between items-center mb-3">
                        <div>
                          <p className="font-medium text-gray-800 text-sm">採購單 {shortId(order.erp_id)}</p>
                          <p className="text-xs text-gray-400">{order.date}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${color}`}>{text}</span>
                          {(order.status === 'draft' || order.status === 'pending') && (
                            <button onClick={() => setConfirmAction({ type: 'price', orderId: order.id })}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">確認訂單</button>
                          )}
                          {order.status === 'confirm' && (
                            <button onClick={() => setConfirmAction({ type: 'receive', orderId: order.id })}
                              className="px-3 py-1 bg-primary text-white rounded text-xs hover:bg-green-700">進貨登錄</button>
                          )}
                        </div>
                      </div>

                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-50 text-gray-400 text-xs">
                            <th className="py-2 px-2 text-left font-medium w-16">號碼</th>
                            <th className="py-2 px-2 text-left font-medium">品名</th>
                            <th className="py-2 px-2 text-right font-medium">量</th>
                            <th className="py-2 px-2 text-right font-medium">單價</th>
                            <th className="py-2 px-2 text-right font-medium">小計</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.lines.map((line, idx) => {
                            const prod = products.find(pp => pp.id === line.product_id)
                            return (
                              <tr key={idx} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                                <td className="py-2 px-2 text-gray-400 text-xs font-mono">{prod?.sku || '-'}</td>
                                <td className="py-2 px-2 font-medium">{prod?.name || '未知商品'}</td>
                                <td className="py-2 px-2 text-right text-gray-600">{line.quantity.toFixed(2)}</td>
                                <td className="py-2 px-2 text-right">
                                  ${line.unit_price}
                                </td>
                                <td className="py-2 px-2 text-right font-bold text-primary">
                                  ${Math.round(line.subtotal).toLocaleString()}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="text-right text-xs bg-gray-50 rounded">
                            <td colSpan={4} className="py-2 px-3">本單小計</td>
                            <td className="py-2 px-3 font-bold text-gray-700">${Math.round(order.total_amount).toLocaleString()}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        title={getDialogProps().title}
        message={getDialogProps().message}
        confirmText="確認執行"
        variant={confirmAction?.type === 'receive' || confirmAction?.type === 'batchStock' ? 'warning' : 'info'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}
