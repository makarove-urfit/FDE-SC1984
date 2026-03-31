/**
 * Step 2: 採購管理 — 按供應商分組、需求量vs實際採購量、逐品項到貨
 *
 * 自動儲存：實際採購量和單價在 blur 或停止輸入後自動存到 DB
 * 到貨狀態：qty_received > 0 即視為已到貨
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import { useAdminStore } from '../store/useAdminStore'
import { useUIStore } from '../store/useUIStore'
import {
  updatePurchaseOrderLine,
  markLineReceived,
} from '../api/purchase'
import ConfirmDialog from '../components/ConfirmDialog'
import { shortId } from '../utils/displayHelpers'

type ConfirmTarget = { lineId: string; lineName: string; poId: string; actualQty: number } | null

export default function PurchasePage() {
  const { targetDate, purchaseOrders, loadAll } = useAdminStore()
  const { withLoading, toast } = useUIStore()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null)
  // 本地編輯：{ lineId: { actualQty, price } }
  const [edits, setEdits] = useState<Record<string, { actualQty?: string; price?: string }>>({})
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => { loadAll() }, [targetDate, loadAll])

  const activePOs = useMemo(() =>
    purchaseOrders
      .filter(po => po.state !== 'cancel')
      .sort((a, b) => (a.state === 'done' ? 1 : -1) - (b.state === 'done' ? 1 : -1)),
    [purchaseOrders],
  )

  const toggleCollapse = (poId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(poId) ? next.delete(poId) : next.add(poId)
      return next
    })
  }

  // 自動儲存（debounce 800ms）
  const autoSave = useCallback((lineId: string, field: 'actualQty' | 'price', value: string, originalLine: { quantity: number; unitPrice: number }) => {
    // 清除之前的 timer
    if (saveTimers.current[`${lineId}_${field}`]) {
      clearTimeout(saveTimers.current[`${lineId}_${field}`])
    }
    saveTimers.current[`${lineId}_${field}`] = setTimeout(async () => {
      try {
        if (field === 'price') {
          const v = parseFloat(value)
          if (!isNaN(v) && v !== originalLine.unitPrice) {
            await updatePurchaseOrderLine(lineId, { price_unit: v })
          }
        } else {
          const v = parseFloat(value)
          if (!isNaN(v) && v >= 0) {
            await updatePurchaseOrderLine(lineId, { qty_received: v })
          }
        }
      } catch (err) {
        toast('error', '自動儲存失敗，請重試')
      }
    }, 800)
  }, [])

  const updateEdit = useCallback((lineId: string, field: 'actualQty' | 'price', value: string, originalLine: { quantity: number; unitPrice: number }) => {
    setEdits(prev => ({ ...prev, [lineId]: { ...prev[lineId], [field]: value } }))
    autoSave(lineId, field, value, originalLine)
  }, [autoSave])

  // 標記到貨前的驗證：實際採購量必須 > 0
  const tryMarkReceived = (lineId: string, lineName: string, poId: string) => {
    const edit = edits[lineId]
    const line = activePOs.flatMap(po => po.lines).find(l => l.id === lineId)
    const actualQty = edit?.actualQty !== undefined
      ? parseFloat(edit.actualQty)
      : (line?.actualQty || 0)

    if (!actualQty || actualQty <= 0) {
      alert('請先填入實際採購量')
      return
    }
    setConfirmTarget({ lineId, lineName, poId, actualQty })
  }

  // 標記到貨（不可逆）
  const handleMarkReceived = async () => {
    if (!confirmTarget) return
    const po = purchaseOrders.find(p => p.id === confirmTarget.poId)
    if (!po) { setConfirmTarget(null); return }

    await withLoading(async () => {
      // 先存單價
      const edit = edits[confirmTarget.lineId]
      if (edit?.price) {
        await updatePurchaseOrderLine(confirmTarget.lineId, {
          price_unit: parseFloat(edit.price) || 0,
        })
      }

      await markLineReceived(
        confirmTarget.lineId,
        confirmTarget.poId,
        po.lines,
        confirmTarget.actualQty,
      )
      setEdits(prev => { const next = { ...prev }; delete next[confirmTarget.lineId]; return next })
      await loadAll(true)
    }, '記錄到貨中...', '已標記為到貨')
    setConfirmTarget(null)
  }

  const totalPending = activePOs
    .filter(po => po.state === 'draft')
    .reduce((sum, po) => sum + po.lines.filter(l => !l.received).length, 0)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PageHeader title="採購管理" showBack>
        <p className="text-sm text-gray-500 pt-2 text-center md:text-left">
          {totalPending > 0 ? `${totalPending} 個品項待採購` : '全部品項已到齊'}
        </p>
      </PageHeader>

      <div className="p-6 max-w-[1600px] mx-auto w-full space-y-4">
        {activePOs.length === 0 ? (
          <div className="text-center text-gray-400 py-12">尚無採購單。請先在「確認訂單」確認訂單。</div>
        ) : activePOs.map(po => {
          const isCollapsed = collapsed.has(po.id)
          const receivedCount = po.lines.filter(l => l.received).length
          const totalCount = po.lines.length
          const allReceived = receivedCount === totalCount
          const isDraft = po.state === 'draft'

          return (
            <div key={po.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <button onClick={() => toggleCollapse(po.id)}
                className="w-full px-4 py-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900">{po.supplierName}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      allReceived ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {allReceived ? '全部到齊' : `${receivedCount}/${totalCount} 已到`}
                    </span>
                    {!isDraft && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">已完成</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">{shortId(po.name)} · {po.date}</p>
                </div>
                <span className="text-gray-400 text-xl">{isCollapsed ? '▸' : '▾'}</span>
              </button>

              {!isCollapsed && (
                <div className="border-t border-gray-100 px-4 py-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 text-xs">
                        <th className="py-1 text-left">品名</th>
                        <th className="py-1 text-right w-28">需求量</th>
                        <th className="py-1 text-right w-36">實際採購量</th>
                        <th className="py-1 text-right w-32">單價</th>
                        <th className="py-1 text-right w-28">小計</th>
                        <th className="py-1 text-center w-28">狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.lines.map(line => {
                        const edit = edits[line.id]
                        const actualQty = edit?.actualQty !== undefined ? parseFloat(edit.actualQty) || 0 : line.actualQty
                        const price = edit?.price !== undefined ? parseFloat(edit.price) || 0 : line.unitPrice

                        return (
                          <tr key={line.id} className={`border-t border-gray-50 ${line.received ? 'opacity-50' : ''}`}>
                            <td className="py-2 font-medium">{line.name}</td>
                            <td className="py-2 text-right text-gray-500">
                              {line.quantity} <span className="text-xs text-gray-400">{line.uom}</span>
                            </td>
                            <td className="py-2 text-right">
                              {isDraft && !line.received ? (
                                <div className="flex items-center justify-end gap-1">
                                  <input type="number" step="0.01" min="0"
                                    value={edit?.actualQty ?? (line.actualQty || '')}
                                    onChange={e => updateEdit(line.id, 'actualQty', e.target.value, line)}
                                    placeholder="填入"
                                    className="w-28 text-right border border-gray-200 rounded px-2 py-1 text-sm focus:border-blue-400 focus:outline-none" />
                                  <span className="text-xs text-gray-400">{line.uom}</span>
                                </div>
                              ) : (
                                <span>{line.actualQty} <span className="text-xs text-gray-400">{line.uom}</span></span>
                              )}
                            </td>
                            <td className="py-2 text-right">
                              {isDraft && !line.received ? (
                                <input type="number" step="0.01" min="0"
                                  value={edit?.price ?? String(line.unitPrice)}
                                  onChange={e => updateEdit(line.id, 'price', e.target.value, line)}
                                  className="w-32 text-right border border-gray-200 rounded px-2 py-1 text-sm focus:border-blue-400 focus:outline-none" />
                              ) : `$${line.unitPrice}`}
                            </td>
                            <td className="py-2 text-right font-bold">${Math.round(actualQty * price).toLocaleString()}</td>
                            <td className="py-2 text-center">
                              {line.received ? (
                                <span className="text-green-600 font-medium text-xs">✓ 已到</span>
                              ) : isDraft ? (
                                <button onClick={() => tryMarkReceived(line.id, line.name, po.id)}
                                  className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">
                                  已採購到
                                </button>
                              ) : (
                                <span className="text-gray-400 text-xs">待採購</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={!!confirmTarget}
        title="確認已採購到？"
        message={`「${confirmTarget?.lineName}」實際採購量 ${confirmTarget?.actualQty}。此操作不可逆。`}
        confirmText="確認到貨"
        variant="warning"
        onConfirm={handleMarkReceived}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  )
}
