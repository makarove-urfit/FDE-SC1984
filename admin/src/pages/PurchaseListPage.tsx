/**
 * A2 進貨總清單頁 — 客戶列表 + 按品項彙總 雙 Tab
 * 含列印功能：供應商採購單 + 採購加總數量表
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminStore } from '../store/useAdminStore'
import type { SalesInvoice } from '../api/sales'
import { generatePurchaseOrders } from '../api/purchase'
import { displayName, shortId } from '../utils/displayHelpers'
import { usePrint, PrintArea } from '../components/PrintProvider'
import ConfirmDialog from '../components/ConfirmDialog'
import PurchaseOrderPrint from '../templates/PurchaseOrderPrint'
import PurchaseListPrint from '../templates/PurchaseListPrint'

export default function PurchaseListPage() {
  const navigate = useNavigate()
  const [view, setView] = useState<'customer' | 'product'>('customer')
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null)
  
  const { salesOrders, products, purchaseOrders, loadAll } = useAdminStore()
  const [loading, setLoading] = useState(true)

  const { contentRef: poRef, print: printPO } = usePrint()
  const { contentRef: listRef, print: printList } = usePrint()
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set())

  // 從 store 衍生資料
  // 已確認的銷售訂單（待採購）+ 草稿訂單
  const draftOrders = salesOrders.filter(i => i.status === 'draft' || i.status === 'pending' || i.status === 'confirm' || i.status === 'confirmed')
  const confirmedOrders = salesOrders.filter(i => i.status === 'confirm' || i.status === 'confirmed')
  const procurementItems = purchaseOrders
  const [generating, setGenerating] = useState(false)
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)

  useEffect(() => {
    loadAll().then(() => setLoading(false))
  }, [])

  // 暫時代替假資料中的 customers/suppliers
  const getCustomerName = (id: string) => displayName(id, '未知客戶')
  const getSupplierName = (id: string) => displayName(id, '未知供應商')

  // 按客戶分群
  const customerGroups = new Map<string, SalesInvoice[]>()
  for (const order of draftOrders) {
    const cid = displayName(order.customer_id, '未知客戶')
    const list = customerGroups.get(cid) || []
    list.push(order)
    customerGroups.set(cid, list)
  }

  // 按品項彙總（改用 product_template_id 匹配 products store，fallback 到 line.name）
  const productSummary = new Map<string, { name: string; code: string; totalQty: number; unit: string; customerCount: number; supplierId: string }>()
  for (const order of draftOrders) {
    for (const line of order.lines) {
      const pid = line.product_template_id || line.product_id
      const p = products.find(pp => pp.id === pid)
      const pName = p?.name || line.name || '未知'
      const pSku = p?.sku || '-'
      const pUom = p?.uom_id || '單位'
      const existing = productSummary.get(pid) || { name: pName, code: pSku, totalQty: 0, unit: pUom, customerCount: 0, supplierId: (p as any)?.supplierId || '未知' }
      existing.totalQty = Math.round((existing.totalQty + line.quantity) * 100) / 100
      existing.customerCount++
      productSummary.set(pid, existing)
    }
  }

  // 供應商列表
  const supplierIds = [...new Set(Array.from(productSummary.values()).map(d => d.supplierId))]

  const toggleSupplier = (id: string) => {
    setSelectedSuppliers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleAllSuppliers = () => {
    if (selectedSuppliers.size === supplierIds.length) setSelectedSuppliers(new Set())
    else setSelectedSuppliers(new Set(supplierIds))
  }

  const toggleCustomer = (id: string) => setExpandedCustomer(expandedCustomer === id ? null : id)

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading list...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600">←</button>
          <div>
            <h1 className="text-xl font-bold">今日訂單接收</h1>
            <p className="text-sm text-gray-400">{draftOrders.length} 筆訂單 · {customerGroups.size} 位客戶 · {productSummary.size} 品項</p>
          </div>
        </div>
        <div className="flex gap-2">
          {confirmedOrders.length > 0 && (
            <button onClick={() => setShowGenerateDialog(true)} disabled={generating}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${generating ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-primary text-white hover:bg-green-700'}`}>
              {generating ? '產生中...' : `產生採購清單 (${confirmedOrders.length} 筆) → 前往定價`}
            </button>
          )}
          {procurementItems.length > 0 && (
            <button onClick={() => navigate('/procurement')}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium">
              前往採購定價 →
            </button>
          )}
        </div>
      </header>

      {/* Tab 切換 + 列印按鈕 */}
      <div className="px-6 pt-4 flex justify-between items-center">
        <div className="flex gap-2">
          <button onClick={() => setView('customer')} className={`px-4 py-1.5 rounded-full text-sm transition-colors ${view === 'customer' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
            按客戶
          </button>
          <button onClick={() => setView('product')} className={`px-4 py-1.5 rounded-full text-sm transition-colors ${view === 'product' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
            按品項彙總
          </button>
        </div>
        <div className="flex gap-2">
          {view === 'product' && draftOrders.length > 0 && (
            <button onClick={printList} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">
              🖨️ 列印採購加總表
            </button>
          )}
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto">
        {draftOrders.length === 0 ? (
          <p className="text-center text-gray-400 py-12">暫無待處理訂單</p>
        ) : view === 'customer' ? (
          /* 客戶列表視角 */
          <div className="space-y-3">
            {Array.from(customerGroups.entries()).map(([custId, custOrders]) => {
              const expanded = expandedCustomer === custId
              const totalItems = custOrders.reduce((sum, o) => sum + o.lines.length, 0)
              return (
                <div key={custId} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <button onClick={() => toggleCustomer(custId)} className="w-full px-4 py-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                    <div className="text-left">
                      <p className="font-bold text-gray-900">{getCustomerName(custId)}</p>
                      <p className="text-sm text-gray-400">{custOrders.length} 筆訂單 · {totalItems} 品項</p>
                    </div>
                    <span className="text-gray-400 text-xl">{expanded ? '▾' : '▸'}</span>
                  </button>
                  {expanded && custOrders.map(order => (
                    <div key={order.id} className="border-t border-gray-100 px-4 py-3">
                      <p className="text-xs text-gray-400 mb-2">訂單 {shortId(order.erp_id)} | {order.date} | 期望到貨: {order.metadata?.deliveryDate}</p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-400 text-xs">
                            <th className="py-1 text-left w-16">編號</th>
                            <th className="py-1 text-left">品名</th>
                            <th className="py-1 text-right">數量</th>
                            <th className="py-1 text-left pl-2">單位</th>
                            <th className="py-1 text-left">備註</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.lines.map((line, i) => {
                            const pid = line.product_template_id || line.product_id
                            const prod = products.find(pp => pp.id === pid)
                            const prodName = prod?.name || line.name || '未知商品'
                            const prodSku = prod?.sku || '-'
                            const prodUom = prod?.uom_id || '單位'
                            return (
                              <tr key={i} className="border-t border-gray-50">
                                <td className="py-1.5 text-gray-400 text-xs font-mono">{prodSku}</td>
                                <td className="py-1.5 font-medium">{prodName}</td>
                                <td className="py-1.5 text-right font-bold text-primary">{line.quantity.toFixed(2)}</td>
                                <td className="py-1.5 text-gray-400 pl-2">{prodUom}</td>
                                <td className="py-1.5 text-gray-400 text-xs">{line.metadata?.note || '-'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      {order.metadata?.note && <p className="text-xs text-gray-400 mt-1 bg-gray-50 px-2 py-1 rounded">📝 {order.metadata.note}</p>}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ) : (
          <>
            {/* 按品項彙總 */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                    <th className="py-3 px-4 text-left font-medium w-20">編號</th>
                    <th className="py-3 px-4 text-left font-medium">品名規格</th>
                    <th className="py-3 px-4 text-right font-medium">需求總量</th>
                    <th className="py-3 px-4 text-left font-medium">單位</th>
                    <th className="py-3 px-4 text-right font-medium">客戶數</th>
                    <th className="py-3 px-4 text-left font-medium">供應商</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(productSummary.entries()).map(([id, d]) => (
                    <tr key={id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-400 text-xs font-mono">{d.code}</td>
                      <td className="py-3 px-4 font-medium">{d.name}</td>
                      <td className="py-3 px-4 text-right font-bold text-primary">{d.totalQty.toFixed(2)}</td>
                      <td className="py-3 px-4 text-gray-400">{d.unit}</td>
                      <td className="py-3 px-4 text-right">{d.customerCount}</td>
                      <td className="py-3 px-4 text-gray-400">{getSupplierName(d.supplierId)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan={2} className="py-3 px-4 text-right">合計</td>
                    <td className="py-3 px-4 text-right text-primary">{Array.from(productSummary.values()).reduce((s, d) => s + d.totalQty, 0).toFixed(2)}</td>
                    <td className="py-3 px-4"></td>
                    <td className="py-3 px-4 text-right">{productSummary.size} 品項</td>
                    <td className="py-3 px-4"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* 供應商勾選列印區 */}
            <div className="mt-6 bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-gray-900">🖨️ 列印供應商採購單</h3>
                <div className="flex gap-2">
                  <button onClick={toggleAllSuppliers} className="text-sm text-primary hover:underline">
                    {selectedSuppliers.size === supplierIds.length ? '取消全選' : '全選'}
                  </button>
                  <button
                    onClick={printPO}
                    disabled={selectedSuppliers.size === 0}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium ${selectedSuppliers.size > 0 ? 'bg-primary text-white hover:bg-green-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                    列印勾選 ({selectedSuppliers.size})
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {supplierIds.map(sid => {
                  const checked = selectedSuppliers.has(sid)
                  return (
                    <label key={sid} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-transparent hover:bg-gray-100'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleSupplier(sid)} className="accent-primary" />
                      <span className="text-sm">{getSupplierName(sid)}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 列印隱藏區 */}
      <PrintArea printRef={poRef}>
        <PurchaseOrderPrint orders={procurementItems as any} products={products} />
      </PrintArea>
      <PrintArea printRef={listRef}>
        <PurchaseListPrint orders={draftOrders as any} products={products} />
      </PrintArea>

      <ConfirmDialog
        open={showGenerateDialog}
        title={`從 ${confirmedOrders.length} 筆已確認訂單產生採購清單？`}
        message="系統將彙總所有已確認訂單的品項需求，自動建立採購單。"
        confirmText="產生採購清單"
        variant="info"
        onConfirm={async () => {
          setShowGenerateDialog(false)
          setGenerating(true)
          try {
            await generatePurchaseOrders(confirmedOrders as any, products as any)
            await loadAll(true)
            navigate('/procurement')
          } catch (err) {
            console.error('產生採購清單失敗:', err)
            alert('產生採購清單失敗：' + (err instanceof Error ? err.message : '未知錯誤'))
          } finally {
            setGenerating(false)
          }
        }}
        onCancel={() => setShowGenerateDialog(false)}
      />
    </div>
  )
}
