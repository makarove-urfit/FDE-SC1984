/**
 * A3 採購定價頁 — 按品項彙總（跨訂單合併），量與單價可編輯
 *
 * 業務邏輯：
 * - 將所有 purchase_order_lines 按 product_template_id 彙總
 * - 管理員可編輯「採購量」與「單價」
 * - 儲存時逐行 PATCH purchase_order_lines 更新
 * - 支援批次確認訂單 / 批次入庫
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { updatePurchaseOrderStatus } from '../api/purchase'
import { db } from '../api/client'
import { useAdminStore } from '../store/useAdminStore'
import BackButton from '../components/BackButton'
import ConfirmDialog from '../components/ConfirmDialog'

const stateLabel: Record<string, { text: string; color: string }> = {
  draft: { text: '待採購', color: 'bg-gray-100 text-gray-500' },
  pending: { text: '待採購', color: 'bg-gray-100 text-gray-500' },
  confirm: { text: '已定價', color: 'bg-blue-100 text-blue-700' },
  received: { text: '已入庫', color: 'bg-green-100 text-green-700' },
  done: { text: '已完成', color: 'bg-green-100 text-green-700' },
}

type ConfirmAction =
  | { type: 'batchPrice' }
  | { type: 'batchStock' }
  | { type: 'saveAll' }

/** 彙總後的品項行 */
interface AggregatedLine {
  /** product_template_id（彙總鍵） */
  productId: string
  /** 品名 */
  name: string
  /** 品號 */
  sku: string
  /** 彙總總數量（可編輯） */
  totalQty: number
  /** 統一單價（可編輯） */
  unitPrice: number
  /** 原始 purchase_order_line IDs（儲存時需逐行更新） */
  sourceLineIds: string[]
  /** 原始各行數量（用於按比例分配） */
  sourceLineQtys: number[]
}

export default function ProcurementPage() {
  const navigate = useNavigate()
  const { purchaseOrders, products, loadPurchases, loadProducts } = useAdminStore()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  // 編輯中的數值 { [productId]: { qty, price } }
  const [edits, setEdits] = useState<Record<string, { qty: string; price: string }>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    Promise.all([loadPurchases(), loadProducts()]).then(() => setLoading(false))
  }, [])

  // 按品項彙總所有 purchase_order_lines
  const aggregatedLines = useMemo(() => {
    const map = new Map<string, AggregatedLine>()
    for (const order of purchaseOrders) {
      for (const line of order.lines) {
        const pid = line.product_id
        const existing = map.get(pid)
        const prod = products.find(p => p.id === pid)
        const prodName = prod?.name || line.name || '未知商品'
        if (existing) {
          existing.totalQty += line.quantity
          existing.sourceLineIds.push(line.id)
          existing.sourceLineQtys.push(line.quantity)
        } else {
          map.set(pid, {
            productId: pid,
            name: prodName,
            sku: prod?.sku || '-',
            totalQty: line.quantity,
            unitPrice: line.unit_price,
            sourceLineIds: [line.id],
            sourceLineQtys: [line.quantity],
          })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))
  }, [purchaseOrders, products])

  // 初始化 edits（載入原始數值）
  useEffect(() => {
    if (aggregatedLines.length > 0 && Object.keys(edits).length === 0) {
      const initial: Record<string, { qty: string; price: string }> = {}
      for (const line of aggregatedLines) {
        initial[line.productId] = {
          qty: line.totalQty.toString(),
          price: line.unitPrice.toString(),
        }
      }
      setEdits(initial)
    }
  }, [aggregatedLines])

  const handleEdit = useCallback((pid: string, field: 'qty' | 'price', value: string) => {
    setEdits(prev => ({
      ...prev,
      [pid]: { ...prev[pid], [field]: value },
    }))
    setDirty(true)
  }, [])

  // 取得編輯後的數值
  const getQty = (pid: string, fallback: number) => {
    const v = edits[pid]?.qty
    return v !== undefined ? parseFloat(v) || 0 : fallback
  }
  const getPrice = (pid: string, fallback: number) => {
    const v = edits[pid]?.price
    return v !== undefined ? parseFloat(v) || 0 : fallback
  }

  // 儲存所有修改：逐行 PATCH purchase_order_lines
  const handleSaveAll = async () => {
    setSaving(true)
    try {
      const promises: Promise<any>[] = []
      for (const line of aggregatedLines) {
        const newQty = getQty(line.productId, line.totalQty)
        const newPrice = getPrice(line.productId, line.unitPrice)

        if (line.sourceLineIds.length === 1) {
          // 單行：直接更新
          promises.push(
            db.update('purchase_order_lines', line.sourceLineIds[0], {
              product_qty: newQty,
              price_unit: newPrice,
            })
          )
        } else {
          // 多行：按原始比例分配數量，統一單價
          const totalOrigQty = line.sourceLineQtys.reduce((s, q) => s + q, 0)
          for (let i = 0; i < line.sourceLineIds.length; i++) {
            const ratio = totalOrigQty > 0 ? line.sourceLineQtys[i] / totalOrigQty : 1 / line.sourceLineIds.length
            const allocatedQty = Math.round(newQty * ratio * 100) / 100
            promises.push(
              db.update('purchase_order_lines', line.sourceLineIds[i], {
                product_qty: allocatedQty,
                price_unit: newPrice,
              })
            )
          }
        }
      }
      await Promise.all(promises)
      setDirty(false)
      await loadPurchases(true)
    } catch (err) {
      console.error('[Procurement] 儲存失敗:', err)
      alert('儲存失敗，請重試')
    } finally {
      setSaving(false)
      setConfirmAction(null)
    }
  }

  // 統計
  const pendingCount = purchaseOrders.filter(i => i.status === 'draft' || i.status === 'pending').length
  const pricedCount = purchaseOrders.filter(i => i.status === 'confirm').length

  // 計算合計
  const totalAmount = aggregatedLines.reduce((sum, line) => {
    const qty = getQty(line.productId, line.totalQty)
    const price = getPrice(line.productId, line.unitPrice)
    return sum + qty * price
  }, 0)

  const handleConfirm = async () => {
    if (!confirmAction) return
    try {
      switch (confirmAction.type) {
        case 'saveAll':
          await handleSaveAll()
          return
        case 'batchPrice':
          await Promise.all(
            purchaseOrders
              .filter(i => i.status === 'draft' || i.status === 'pending')
              .map(o => updatePurchaseOrderStatus(o.id, 'confirm'))
          )
          break
        case 'batchStock':
          await Promise.all(
            purchaseOrders
              .filter(i => i.status === 'confirm')
              .map(o => updatePurchaseOrderStatus(o.id, 'received'))
          )
          break
      }
      await loadPurchases(true)
    } finally {
      setConfirmAction(null)
    }
  }

  const getDialogProps = () => {
    if (!confirmAction) return { title: '', message: '' }
    switch (confirmAction.type) {
      case 'saveAll':
        return { title: '儲存所有修改？', message: `將更新 ${aggregatedLines.length} 個品項的數量與單價。` }
      case 'batchPrice':
        return { title: '批次確認所有採購單？', message: `將確認 ${pendingCount} 張採購單。` }
      case 'batchStock':
        return { title: '批次入庫所有已確認採購單？', message: `將入庫 ${pricedCount} 張已確認採購單。` }
    }
  }

  // 採購單狀態總覽
  const orderStatusSummary = useMemo(() => {
    return purchaseOrders.map(o => {
      const label = stateLabel[o.status] || stateLabel.draft
      return { id: o.id, status: o.status, ...label }
    })
  }, [purchaseOrders])

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading procurements...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold">採購定價與入庫</h1>
            <p className="text-sm text-gray-400">
              {aggregatedLines.length} 品項 · {purchaseOrders.length} 張採購單 · {pendingCount} 待確認 · {pricedCount} 已確認
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <button
              onClick={() => setConfirmAction({ type: 'saveAll' })}
              disabled={saving}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? '儲存中...' : '💾 儲存修改'}
            </button>
          )}
          {pendingCount > 0 && (
            <button
              onClick={() => setConfirmAction({ type: 'batchPrice' })}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              批次確認訂單
            </button>
          )}
          {pricedCount > 0 && (
            <button
              onClick={() => setConfirmAction({ type: 'batchStock' })}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              批次入庫
            </button>
          )}
        </div>
      </header>

      <div className="p-6 max-w-5xl mx-auto">
        {/* 採購單狀態總覽 */}
        {purchaseOrders.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {orderStatusSummary.map(o => (
              <span key={o.id} className={`px-2 py-0.5 rounded-full text-xs ${o.color}`}>{o.text}</span>
            ))}
          </div>
        )}

        {aggregatedLines.length === 0 ? (
          <div className="text-center text-gray-400 py-12 space-y-2">
            <p>尚無採購品項</p>
            <button onClick={() => navigate('/purchase-list')} className="text-primary hover:underline text-sm">
              前往訂單接收 →
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs">
                  <th className="py-3 px-4 text-left font-medium w-16">品號</th>
                  <th className="py-3 px-4 text-left font-medium">品名</th>
                  <th className="py-3 px-4 text-right font-medium w-28">採購量</th>
                  <th className="py-3 px-4 text-right font-medium w-28">單價</th>
                  <th className="py-3 px-4 text-right font-medium w-28">小計</th>
                </tr>
              </thead>
              <tbody>
                {aggregatedLines.map(line => {
                  const qty = getQty(line.productId, line.totalQty)
                  const price = getPrice(line.productId, line.unitPrice)
                  const subtotal = qty * price
                  return (
                    <tr key={line.productId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="py-2.5 px-4 text-gray-400 text-xs font-mono">{line.sku}</td>
                      <td className="py-2.5 px-4 font-medium text-gray-800">{line.name}</td>
                      <td className="py-2.5 px-4 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={edits[line.productId]?.qty ?? line.totalQty}
                          onChange={e => handleEdit(line.productId, 'qty', e.target.value)}
                          className="w-24 text-right px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={edits[line.productId]?.price ?? line.unitPrice}
                          onChange={e => handleEdit(line.productId, 'price', e.target.value)}
                          className="w-24 text-right px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-primary">
                        ${Math.round(subtotal).toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={2} className="py-3 px-4 text-sm font-medium text-gray-500">
                    合計 {aggregatedLines.length} 品項
                  </td>
                  <td className="py-3 px-4 text-right text-sm font-bold text-gray-600">
                    {aggregatedLines.reduce((s, l) => s + getQty(l.productId, l.totalQty), 0).toFixed(2)}
                  </td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4 text-right text-sm font-bold text-primary">
                    ${Math.round(totalAmount).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        title={getDialogProps().title}
        message={getDialogProps().message}
        confirmText="確認執行"
        variant={confirmAction?.type === 'batchStock' ? 'warning' : 'info'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}
