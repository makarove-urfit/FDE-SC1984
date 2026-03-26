/**
 * 客戶銷貨憑單 — 列印版面
 * 使用 API 回傳的 SalesInvoice 資料，不依賴 mockData
 */
import type { SalesInvoice } from '../api/sales'
import { displayName, shortId } from '../utils/displayHelpers'

const statusLabel: Record<string, string> = {
  draft: '待處理', pending: '待處理', confirm: '已確認',
  allocated: '已分配', shipped: '已出貨', delivered: '已送達', done: '已送達',
}

interface Props {
  orders: SalesInvoice[]
}

export default function SalesInvoicePrint({ orders }: Props) {
  return (
    <>
      {orders.map((order, idx) => {
        const total = order.total_amount || order.lines.reduce((sum, l) => sum + l.subtotal, 0)
        const totalQty = order.lines.reduce((sum, l) => sum + l.quantity, 0)

        return (
          <div key={order.id} className={idx > 0 ? 'print-page-break' : ''}>
            <div className="print-header">
              <h1>雄泉鮮食企業股份有限公司</h1>
              <p>銷 貨 憑 單</p>
            </div>
            <div className="print-meta">
              <div>
                <div>銷貨日期: <strong>{order.date}</strong></div>
                <div>客戶名稱: <strong>{displayName(order.customer_id, '現場客戶')}</strong></div>
                <div>單號: <strong>{shortId(order.erp_id)}</strong></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>狀態: {statusLabel[order.status] || order.status}</div>
                <div style={{ marginTop: '4pt', color: '#999', fontSize: '9pt' }}>
                  第 {idx + 1} 頁 / 共 {orders.length} 頁
                </div>
              </div>
            </div>
            <table className="print-table">
              <thead>
                <tr>
                  <th style={{ width: '5%' }}>#</th>
                  <th style={{ width: '30%' }}>品名規格</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>數量</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>單價</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>金額</th>
                  <th style={{ width: '26%' }}>備註</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{line.metadata?.note || '未知商品'}</td>
                    <td className="num">{line.quantity.toFixed(2)}</td>
                    <td className="num">{line.unit_price > 0 ? line.unit_price.toFixed(1) : '-'}</td>
                    <td className="num bold">{line.subtotal > 0 ? `$${Math.round(line.subtotal).toLocaleString()}` : '-'}</td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 'bold', borderTop: '2px solid #333' }}>
                  <td colSpan={2} style={{ textAlign: 'right' }}>合計</td>
                  <td className="num">{totalQty.toFixed(2)}</td>
                  <td></td>
                  <td className="num">${Math.round(total).toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            <div style={{ textAlign: 'right', marginTop: '8pt', fontSize: '11pt' }}>
              <div>未稅合計: <strong>${Math.round(total).toLocaleString()}</strong></div>
              <div style={{ color: '#666' }}>稅金: $0</div>
              <div style={{ fontSize: '14pt', marginTop: '4pt' }}>
                總計: <strong>${Math.round(total).toLocaleString()}</strong>
              </div>
            </div>
            <div className="print-footer">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>製單:________　覆核:________</span>
                <span>列印時間: {new Date().toLocaleString('zh-TW')}</span>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
