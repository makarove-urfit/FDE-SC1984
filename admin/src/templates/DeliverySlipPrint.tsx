/**
 * 出貨配送單 — 列印版面
 * 使用 API 回傳的 SalesInvoice 資料，不依賴 mockData
 */
import type { SalesInvoice } from '../api/sales'
import { displayName, shortId } from '../utils/displayHelpers'

interface Props {
  orders: SalesInvoice[]
}

export default function DeliverySlipPrint({ orders }: Props) {
  return (
    <>
      {orders.map((order, idx) => (
        <div key={order.id} className={idx > 0 ? 'print-page-break' : ''}>
          <div className="print-header">
            <h1>雄泉鮮食企業股份有限公司</h1>
            <p>出 貨 配 送 單</p>
          </div>
          <div className="print-meta">
            <div>
              <div>配送日期: <strong>{order.date}</strong></div>
              <div>客戶: <strong>{displayName(order.customer_id, '現場客戶')}</strong></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div>單號: <strong>{shortId(order.erp_id)}</strong></div>
              <div>品項數: {order.lines.length}</div>
            </div>
          </div>
          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: '5%' }}>#</th>
                <th style={{ width: '35%' }}>品名規格</th>
                <th style={{ width: '12%', textAlign: 'right' }}>數量</th>
                <th style={{ width: '25%' }}>備註</th>
                <th style={{ width: '8%', textAlign: 'center' }}>✓</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{line.metadata?.note || '未知商品'}</td>
                  <td className="num bold">{line.quantity.toFixed(2)}</td>
                  <td></td>
                  <td style={{ textAlign: 'center' }}><span className="print-checkbox"></span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="print-signature">
            <div>配送人員:</div>
            <div>客戶簽收:</div>
            <div>送達時間:</div>
          </div>
          <div className="print-footer">
            <div>列印時間: {new Date().toLocaleString('zh-TW')}</div>
          </div>
        </div>
      ))}
    </>
  )
}
