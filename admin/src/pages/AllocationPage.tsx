/**
 * Step 3: 出庫分配 — 以訂單為視角，分配實際出貨量、指派司機
 *
 * 規則：每個品項的分配總量不能超過實際採購量
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import BackButton from '../components/BackButton'
import { useAdminStore } from '../store/useAdminStore'
import { useUIStore } from '../store/useUIStore'
import {
  updateSaleOrderAllocation,
} from '../api/sales'
import ConfirmDialog from '../components/ConfirmDialog'
import { shortId } from '../utils/displayHelpers'

export default function AllocationPage() {
  const { saleOrders, purchaseOrders, drivers, loadAll } = useAdminStore()
  const { withLoading } = useUIStore()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)
  // 本地編輯：{ lineId: qty, orderId_driver: driverName }
  const [edits, setEdits] = useState<Record<string, string>>({})

  useEffect(() => { loadAll() }, [])

  // 已確認但尚未完成配送的訂單
  const allocatableOrders = useMemo(() =>
    saleOrders
      .filter(o => o.state === 'sale')
      .sort((a, b) => (a.allocated ? 1 : -1) - (b.allocated ? 1 : -1)),
    [saleOrders],
  )

  // 計算每個品項的實際採購總量（from purchase_order_lines）
  const purchasedQtyMap = useMemo(() => {
    const map: Record<string, number> = {}
    purchaseOrders
      .filter(po => po.state !== 'cancel')
      .forEach(po => {
        po.lines.forEach(line => {
          if (line.received && line.actualQty > 0) {
            const key = line.productTemplateId
            map[key] = (map[key] || 0) + line.actualQty
          }
        })
      })
    return map
  }, [purchaseOrders])

  // 計算每個品項已分配的總量（排除正在編輯的訂單）
  const getAllocatedTotal = useCallback((productTemplateId: string, excludeOrderId?: string) => {
    let total = 0
    allocatableOrders.forEach(order => {
      if (order.id === excludeOrderId) return
      order.lines.forEach(line => {
        if (line.productTemplateId === productTemplateId) {
          const editKey = `${line.id}_qty`
          const qty = edits[editKey] !== undefined
            ? parseFloat(edits[editKey]) || 0
            : line.actualDeliveryQty
          total += qty
        }
      })
    })
    return total
  }, [allocatableOrders, edits])

  // 檢查某訂單的分配是否超量
  const checkAllocationValid = useCallback((orderId: string) => {
    const order = allocatableOrders.find(o => o.id === orderId)
    if (!order) return true
    for (const line of order.lines) {
      const editKey = `${line.id}_qty`
      const thisQty = edits[editKey] !== undefined
        ? parseFloat(edits[editKey]) || 0
        : line.actualDeliveryQty
      const othersTotal = getAllocatedTotal(line.productTemplateId, orderId)
      const available = purchasedQtyMap[line.productTemplateId] || 0
      if (thisQty + othersTotal > available) return false
    }
    return true
  }, [allocatableOrders, edits, purchasedQtyMap, getAllocatedTotal])

  const handleSave = async (orderId: string) => {
    const order = allocatableOrders.find(o => o.id === orderId)
    if (!order) return
    await withLoading(async () => {
      // 收集所有修改的數量
      const allocations: Record<string, number> = {}
      for (const line of order.lines) {
        const editKey = `${line.id}_qty`
        if (edits[editKey] !== undefined) {
          allocations[line.id] = parseFloat(edits[editKey]) || 0
        }
      }

      // 取得司機修改
      const driverKey = `${orderId}_driver`
      const driverValue = edits[driverKey]

      // 一併寫入
      if (Object.keys(allocations).length > 0 || driverValue !== undefined) {
        await updateSaleOrderAllocation(orderId, { 
          driver: driverValue,
          allocations: Object.keys(allocations).length > 0 ? allocations : undefined
        })
      }
      // 清除此訂單的編輯
      setEdits(prev => {
        const next = { ...prev }
        order.lines.forEach(l => delete next[`${l.id}_qty`])
        delete next[driverKey]
        return next
      })
      await loadAll(true)
    }, '儲存分配中...', '分配已儲存')
  }

  const handleComplete = async () => {
    if (!completingId) return
    const order = allocatableOrders.find(o => o.id === completingId)
    if (!order) { setCompletingId(null); return }
    await withLoading(async () => {
      // 收集所有修改的數量
      const allocations: Record<string, number> = {}
      for (const line of order.lines) {
        const editKey = `${line.id}_qty`
        if (edits[editKey] !== undefined) {
          allocations[line.id] = parseFloat(edits[editKey]) || 0
        }
      }

      // 一次寫入 driver + allocated + allocations
      const driverKey = `${completingId}_driver`
      const driverValue = edits[driverKey] ?? order.driver
      await updateSaleOrderAllocation(completingId, {
        driver: driverValue,
        allocated: true,
        allocations: Object.keys(allocations).length > 0 ? allocations : undefined
      })
      // 清除此訂單的編輯
      setEdits(prev => {
        const next = { ...prev }
        order.lines.forEach(l => delete next[`${l.id}_qty`])
        delete next[driverKey]
        return next
      })
      await loadAll(true)
    }, '完成分配中...', '訂單已標記為分配完成')
    setCompletingId(null)
  }

  const unallocatedCount = allocatableOrders.filter(o => !o.allocated).length

  // 新增：計算所有待分配品項的剩餘狀況 (全域即時變更)
  const remainingSummary = useMemo(() => {
    const map = new Map<string, { id: string, name: string, uom: string, purchased: number, allocated: number }>()

    // 1. 蒐集產品基礎資訊與總採購量
    allocatableOrders.forEach(o => {
      o.lines.forEach(line => {
        if (!map.has(line.productTemplateId)) {
          map.set(line.productTemplateId, {
            id: line.productTemplateId,
            name: line.name,
            uom: line.uom,
            purchased: purchasedQtyMap[line.productTemplateId] || 0,
            allocated: 0,
          })
        }
      })
    })

    // 2. 扣除即時編輯中與既有的出庫數量
    allocatableOrders.forEach(order => {
      order.lines.forEach(line => {
        const item = map.get(line.productTemplateId)
        if (item) {
          const editKey = `${line.id}_qty`
          const thisQty = edits[editKey] !== undefined ? parseFloat(edits[editKey]) || 0 : line.actualDeliveryQty
          item.allocated += thisQty
        }
      })
    })

    return Array.from(map.values())
      // 排序：負數警告優先，大於 0 的次之，已分配完 (0) 放最後
      .sort((a, b) => {
        const diffA = a.purchased - a.allocated
        const diffB = b.purchased - b.allocated
        if (diffA < 0 && diffB >= 0) return -1
        if (diffB < 0 && diffA >= 0) return 1
        if (diffA > 0 && diffB <= 0) return -1
        if (diffB > 0 && diffA <= 0) return 1
        // 若類別相同，依剩餘量多寡排序
        return diffB - diffA
      })
  }, [allocatableOrders, edits, purchasedQtyMap])

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="px-6 py-4 flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-gray-900">出庫分配</h1>
            <p className="text-sm text-gray-400">
              {unallocatedCount > 0 ? `${unallocatedCount} 筆待分配` : '全部已分配'}
            </p>
          </div>
        </div>

        {/* 橫向滾動剩餘數量狀態列 */}
        {remainingSummary.length > 0 && (
          <div className="bg-gray-100/80 backdrop-blur-md px-6 py-2.5 overflow-x-auto no-scrollbar shadow-inner border-t border-gray-200">
            <div className="flex gap-3">
              <span className="text-xs font-bold text-gray-500 whitespace-nowrap self-center mr-2">
                即時可用扣減量：
              </span>
              {remainingSummary.map(item => {
                const remaining = Math.round((item.purchased - item.allocated) * 100) / 100
                const isNegative = remaining < 0
                const isZero = remaining === 0
                
                return (
                  <div key={item.id} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    isNegative 
                      ? 'bg-red-50 border-red-200 text-red-700 font-bold shadow-sm' 
                      : isZero
                        ? 'bg-gray-50 border-transparent text-gray-400 opacity-60'
                        : 'bg-white border-gray-200 text-gray-800 font-medium shadow-sm'
                  }`}>
                    <span>{item.name}</span>
                    <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold ${
                      isNegative ? 'bg-red-200 text-red-900' 
                      : isZero ? 'bg-gray-200 text-gray-500'
                      : 'bg-blue-50 text-blue-700'
                    }`}>
                      {remaining} {item.uom}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </header>

      <div className="p-6 max-w-5xl mx-auto space-y-3">
        {allocatableOrders.length === 0 ? (
          <div className="text-center text-gray-400 py-12">目前沒有待分配的訂單</div>
        ) : allocatableOrders.map(order => {
          const isExpanded = expanded === order.id
          const driverKey = `${order.id}_driver`
          const currentDriver = edits[driverKey] ?? order.driver
          const isValid = checkAllocationValid(order.id)

          return (
            <div key={order.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <button onClick={() => setExpanded(isExpanded ? null : order.id)}
                className="w-full px-4 py-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900">{order.customerName}</p>
                    {order.allocated ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">已分配</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">待分配</span>
                    )}
                    {order.driver && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        🚚 {order.driver}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">{shortId(order.name)} · {order.date} · {order.lines.length} 品項</p>
                </div>
                <span className="text-gray-400 text-xl">{isExpanded ? '▾' : '▸'}</span>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                  {/* 司機選擇 */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">指派司機：</span>
                    <select
                      value={currentDriver}
                      onChange={e => setEdits(prev => ({ ...prev, [driverKey]: e.target.value }))}
                      className="border border-gray-200 rounded px-2 py-1 text-sm"
                      disabled={order.allocated}>
                      <option value="">-- 未指派 --</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* 品項分配 */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 text-xs">
                        <th className="py-1 text-left">品名</th>
                        <th className="py-1 text-right w-24">下單量</th>
                        <th className="py-1 text-right w-32">實際出貨量</th>
                        <th className="py-1 text-right w-28">可用庫存</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.lines.map(line => {
                        const editKey = `${line.id}_qty`
                        const thisQty = edits[editKey] !== undefined
                          ? parseFloat(edits[editKey]) || 0
                          : line.actualDeliveryQty
                        const available = purchasedQtyMap[line.productTemplateId] || 0
                        const othersTotal = getAllocatedTotal(line.productTemplateId, order.id)
                        const remaining = Math.max(0, available - othersTotal)
                        const overLimit = thisQty > remaining

                        return (
                          <tr key={line.id} className="border-t border-gray-50">
                            <td className="py-2 font-medium">{line.name}</td>
                            <td className="py-2 text-right text-gray-500">
                              {line.quantity} <span className="text-xs text-gray-400">{line.uom}</span>
                            </td>
                            <td className="py-2 text-right">
                              {!order.allocated ? (
                                <div className="flex items-center justify-end gap-1">
                                  <input type="number" step="0.01" min="0"
                                    value={edits[editKey] ?? (line.actualDeliveryQty || '')}
                                    onChange={e => setEdits(prev => ({ ...prev, [editKey]: e.target.value }))}
                                    placeholder="填入"
                                    className={`w-20 text-right border rounded px-2 py-1 text-sm ${
                                      overLimit ? 'border-red-400 bg-red-50' : 'border-gray-200'
                                    }`} />
                                  <span className="text-xs text-gray-400">{line.uom}</span>
                                </div>
                              ) : (
                                <span>{line.actualDeliveryQty} <span className="text-xs text-gray-400">{line.uom}</span></span>
                              )}
                            </td>
                            <td className="py-2 text-right">
                              <span className={`text-xs ${remaining <= 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                {remaining} {line.uom}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* 操作按鈕 */}
                  {!order.allocated && (
                    <div className="flex gap-2 justify-end pt-2">
                      <button onClick={() => handleSave(order.id)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50">
                        儲存分配
                      </button>
                      <button onClick={() => setCompletingId(order.id)}
                        disabled={!isValid}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!isValid ? '分配總量超過實際採購量' : ''}>
                        完成分配
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={!!completingId}
        title="完成分配？"
        message="此訂單將標記為已分配，分配數量將鎖定。"
        confirmText="完成分配"
        variant="warning"
        onConfirm={handleComplete}
        onCancel={() => setCompletingId(null)}
      />
    </div>
  )
}
