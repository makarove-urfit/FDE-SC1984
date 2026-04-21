/**
 * 訂購清單 — 按日期列出所有銷售訂單，每筆訂單獨立顯示
 * 小計依 product_product_price_log 中距配送日最近的歷史價格估算
 */
import { useState, useMemo, useEffect } from 'react'
import PageHeader from '../components/PageHeader'
import { useAdminStore } from '../store/useAdminStore'
import { db } from '../api/client'
import { TABLES } from '../api/tables'
import { shortId } from '../utils/displayHelpers'

interface PriceEntry {
  productProductId: string
  lstPrice: number
  updatedAt: string
}

export default function PurchaseListPage() {
  const { targetDate, saleOrders, loadSales } = useAdminStore()
  const [priceHistory, setPriceHistory] = useState<PriceEntry[]>([])
  const [priceLoading, setPriceLoading] = useState(false)

  useEffect(() => { loadSales(targetDate) }, [targetDate, loadSales])

  // 抓所有涉及品項的價格記錄（一次性批量查詢）
  useEffect(() => {
    const productIds = [
      ...new Set(saleOrders.flatMap(o => o.lines.map(l => l.productId)).filter(Boolean))
    ]
    if (productIds.length === 0) { setPriceHistory([]); return }

    setPriceLoading(true)
    db.query<any>(TABLES.PRODUCT_PRODUCT_PRICE_LOG, {
      filters: [{ column: 'product_product_id', op: 'in', value: productIds }],
      select_columns: ['product_product_id', 'lst_price', 'updated_at'],
    })
      .then(rows => {
        setPriceHistory((rows || []).map(r => ({
          productProductId: String(r.product_product_id),
          lstPrice: Number(r.lst_price),
          updatedAt: String(r.updated_at),
        })))
      })
      .catch(() => setPriceHistory([]))
      .finally(() => setPriceLoading(false))
  }, [saleOrders])

  // 依 targetDate 找最近的歷史價格（≤ 當天），找不到則 fallback 到 price_unit
  const effectivePriceMap = useMemo(() => {
    const byProduct: Record<string, PriceEntry[]> = {}
    for (const entry of priceHistory) {
      if (!byProduct[entry.productProductId]) byProduct[entry.productProductId] = []
      byProduct[entry.productProductId].push(entry)
    }
    const map: Record<string, number> = {}
    for (const [pid, entries] of Object.entries(byProduct)) {
      const valid = entries
        .filter(e => e.updatedAt.slice(0, 10) <= targetDate)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      if (valid.length > 0) map[pid] = valid[0].lstPrice
    }
    return map
  }, [priceHistory, targetDate])

  // 所有非取消訂單，各自獨立顯示（同客戶多訂單不合併）
  const activeOrders = useMemo(() =>
    saleOrders
      .filter(o => o.state !== 'cancel')
      .sort((a, b) => a.customerName.localeCompare(b.customerName, 'zh-TW')),
    [saleOrders],
  )

  const grandTotal = useMemo(() =>
    activeOrders.reduce((sum, order) => {
      return sum + order.lines.reduce((s, line) => {
        const price = effectivePriceMap[line.productId] ?? line.unitPrice
        return s + Math.round(line.quantity * price)
      }, 0)
    }, 0),
    [activeOrders, effectivePriceMap],
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PageHeader title="訂購清單" showBack>
        <div className="pt-2 text-sm text-gray-500 text-center md:text-left">
          {activeOrders.length} 筆訂單 · 合計 NT${grandTotal.toLocaleString()}
          {priceLoading && <span className="ml-2 text-blue-400 text-xs">載入價格中...</span>}
        </div>
      </PageHeader>

      <div className="p-6 max-w-[1600px] mx-auto w-full space-y-4">
        {activeOrders.length === 0 ? (
          <div className="text-center text-gray-400 py-12">此日期尚無訂單</div>
        ) : activeOrders.map(order => {
          const linesWithPrice = order.lines.map(line => {
            const effectivePrice = effectivePriceMap[line.productId] ?? line.unitPrice
            const effectiveSubtotal = Math.round(line.quantity * effectivePrice)
            const priceChanged = effectivePrice !== line.unitPrice
            return { ...line, effectivePrice, effectiveSubtotal, priceChanged }
          })
          const orderTotal = linesWithPrice.reduce((s, l) => s + l.effectiveSubtotal, 0)

          return (
            <div key={order.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <p className="font-bold text-gray-900">{order.customerName}</p>
                  <p className="text-xs text-gray-400">{shortId(order.name)} · {order.date}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900 text-lg">NT${orderTotal.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">{linesWithPrice.length} 品項</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs">
                      <th className="px-4 py-2 text-left">品名</th>
                      <th className="px-4 py-2 text-right w-24">數量</th>
                      <th className="px-4 py-2 text-right w-32">單價</th>
                      <th className="px-4 py-2 text-right w-32">小計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linesWithPrice.map(line => (
                      <tr key={line.id} className="border-t border-gray-50">
                        <td className="px-4 py-2 font-medium">{line.name}</td>
                        <td className="px-4 py-2 text-right text-gray-500">
                          {line.quantity} <span className="text-xs text-gray-400">{line.uom}</span>
                        </td>
                        <td className="px-4 py-2 text-right text-gray-600">
                          NT${line.effectivePrice.toLocaleString()}
                          {line.priceChanged && (
                            <span className="ml-1 text-xs text-amber-500" title="依最近歷史價格估算">*</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-bold">
                          NT${line.effectiveSubtotal.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
