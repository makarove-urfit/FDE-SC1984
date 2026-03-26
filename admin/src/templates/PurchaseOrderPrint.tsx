/**
 * 供應商採購單 — 列印版面
 * 使用 API 回傳的 PurchaseOrder 資料，不依賴 mockData
 */
import type { PurchaseOrder } from '../api/purchase'
import type { Product } from '../api/stock'
import { displayName, shortId } from '../utils/displayHelpers'

interface Props {
  orders: PurchaseOrder[]
  products?: Product[]
}

export default function PurchaseOrderPrint({ orders, products = [] }: Props) {
  const getProductName = (productId: string) => products.find(p => p.id === productId)?.name || '未知商品'
  // 按供應商分群
  const bySupplier = new Map<string, PurchaseOrder[]>()
  for (const o of orders) {
    const key = displayName(o.supplier_id, '未指定供應商')
    if (!bySupplier.has(key)) bySupplier.set(key, [])
    bySupplier.get(key)!.push(o)
  }

  return (
    <>
      {Array.from(bySupplier.entries()).map(([supplier, supplierOrders], idx) => {
        const allLines = supplierOrders.flatMap(o => o.lines)
        const totalAmount = supplierOrders.reduce((sum, o) => sum + o.total_amount, 0)

        return (
          <div key={supplier} className={idx > 0 ? 'print-page-break' : ''}>
            <div className="print-header">
              <h1>雄泉鮮食企業股份有限公司</h1>
              <p>供應商採購單</p>
            </div>
            <div className="print-meta">
              <div>
                <div>供應商: <strong>{supplier}</strong></div>
                <div>訂單數: {supplierOrders.length}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>日期: {new Date().toISOString().slice(0, 10)}</div>
                <div>品項數: {allLines.length}</div>
              </div>
            </div>
            <table className="print-table">
              <thead>
                <tr>
                  <th style={{ width: '5%' }}>#</th>
                  <th style={{ width: '15%' }}>採購單號</th>
                  <th style={{ width: '30%' }}>品名</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>數量</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>單價</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>小計</th>
                </tr>
              </thead>
              <tbody>
                {supplierOrders.flatMap((o, oi) =>
                  o.lines.map((l, li) => (
                    <tr key={`${oi}-${li}`}>
                      <td>{oi * 100 + li + 1}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '9pt' }}>{shortId(o.erp_id)}</td>
                      <td>{getProductName(l.product_id)}</td>
                      <td className="num">{l.quantity.toFixed(2)}</td>
                      <td className="num">{l.unit_price > 0 ? l.unit_price.toFixed(1) : '-'}</td>
                      <td className="num">{l.subtotal > 0 ? `$${Math.round(l.subtotal).toLocaleString()}` : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 'bold', borderTop: '2px solid #333' }}>
                  <td colSpan={5} style={{ textAlign: 'right' }}>合計</td>
                  <td className="num">${Math.round(totalAmount).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
            <div className="print-footer">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>採購人員:________</span>
                <span>列印時間: {new Date().toLocaleString('zh-TW')}</span>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
