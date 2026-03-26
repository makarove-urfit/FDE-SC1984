/**
 * 採購加總數量表 — 列印版面
 * 使用 API 回傳的 PurchaseOrder 資料，不依賴 mockData
 */
import type { PurchaseOrder } from '../api/purchase'
import type { Product } from '../api/stock'
import { displayName } from '../utils/displayHelpers'

interface Props {
  orders: PurchaseOrder[]
  products?: Product[]
}

export default function PurchaseListPrint({ orders, products = [] }: Props) {
  const getProductName = (productId: string) => products.find(p => p.id === productId)?.name || '未知商品'

  // 按產品彙總
  const summary = new Map<string, { name: string; totalQty: number; supplier: string; orderCount: number }>()
  for (const order of orders) {
    for (const line of order.lines) {
      const key = line.product_id
      const existing = summary.get(key) || {
        name: getProductName(line.product_id),
        totalQty: 0,
        supplier: displayName(order.supplier_id, '-'),
        orderCount: 0,
      }
      existing.totalQty = Math.round((existing.totalQty + line.quantity) * 100) / 100
      existing.orderCount++
      summary.set(key, existing)
    }
  }

  const items = Array.from(summary.values())

  return (
    <div>
      <div className="print-header">
        <h1>雄泉鮮食企業股份有限公司</h1>
        <p>採購加總數量表</p>
      </div>
      <div className="print-meta">
        <div>日期: {new Date().toISOString().slice(0, 10)}</div>
        <div>品項數: {items.length} | 訂單數: {orders.length}</div>
      </div>
      <table className="print-table">
        <thead>
          <tr>
            <th style={{ width: '5%' }}>#</th>
            <th style={{ width: '30%' }}>品名規格</th>
            <th style={{ width: '15%', textAlign: 'right' }}>需求總量</th>
            <th style={{ width: '10%', textAlign: 'right' }}>訂單數</th>
            <th style={{ width: '20%' }}>供應商</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{item.name}</td>
              <td className="num bold">{item.totalQty.toFixed(2)}</td>
              <td className="num">{item.orderCount}</td>
              <td>{item.supplier}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="print-footer">
        <div>列印時間: {new Date().toLocaleString('zh-TW')}</div>
      </div>
    </div>
  )
}
