import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../data/DataProvider';
import DatePickerWithCounts from '../../components/DatePickerWithCounts';
import * as db from '../../db';

const Arrow = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>;
const InboxIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>;

function LineTable({ rows }: { rows: { id:string; name:string; qty:number; price:number; subtotal:number; fromLog:boolean }[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-gray-400 text-xs">
        <th className="py-1 text-left">品名</th>
        <th className="py-1 text-right w-20">數量</th>
        <th className="py-1 text-right w-28">單價</th>
        <th className="py-1 text-right w-28">小計</th>
      </tr></thead>
      <tbody>
        {rows.map(l=>(
          <tr key={l.id} className="border-t border-gray-50">
            <td className="py-1.5 font-medium">{l.name}</td>
            <td className="py-1.5 text-right text-gray-500">{l.qty.toFixed(1)}</td>
            <td className="py-1.5 text-right text-gray-600">
              ${l.price.toLocaleString()}
              {l.fromLog&&<span className="text-amber-500 text-xs ml-1" title="依最近歷史售價估算">*</span>}
            </td>
            <td className="py-1.5 text-right font-bold text-primary">${l.subtotal.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PurchaseListPage() {
  const nav = useNavigate();
  const { orders, customers, orderLines: lines, products, uomMap, loading, selectedDate, setSelectedDate } = useData();
  const tmplUom = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of products) if (p.uom_id) m[p.id] = uomMap[p.uom_id] || '';
    return m;
  }, [products, uomMap]);
  const [view, setView] = useState<'raw'|'customer'|'product'>('raw');
  const [priceLogs, setPriceLogs] = useState<any[]>([]);

  const PRICE_LOG_UUID = '390d4f0b-9a2b-4131-a35b-67fce21286be';
  useEffect(() => {
    db.queryCustom(PRICE_LOG_UUID).then(rows => setPriceLogs(
      (Array.isArray(rows) ? rows : []).map((r: any) => r.data ? { ...r.data, id: r.id, updated_at: r.data.updated_at || r.updated_at } : r)
    )).catch(() => {});
  }, []);

  const priceMap = useMemo(() => {
    const map: Record<string, number> = {};
    const sorted = [...priceLogs].sort((a: any, b: any) =>
      String(b.effective_date || '').localeCompare(String(a.effective_date || ''))
    );
    for (const entry of sorted) {
      const pid = String(entry.product_product_id || ''); const price = Number(entry.lst_price || 0);
      const effDate = String(entry.effective_date || '');
      if (pid && price > 0 && effDate <= selectedDate && !map[pid]) map[pid] = price;
    }
    return map;
  }, [priceLogs, selectedDate]);

  const isDraft = (o:any) => !o.state || o.state === 'draft';

  const dateIds = useMemo(() =>
    new Set(lines.filter((l:any) => String(l.delivery_date||'').slice(0,10) === selectedDate).map((l:any) => { const v = l.order_id; return Array.isArray(v) ? String(v[0]) : String(v||''); })),
    [lines, selectedDate]
  );

  const draftOrders = useMemo(() =>
    orders
      .filter(o => isDraft(o) && dateIds.has(String(o.id)))
      .sort((a,b) => String(b.date_order||b.created_at||'').localeCompare(String(a.date_order||a.created_at||''))),
    [orders, dateIds]
  );

  const getLineRows = (orderList: any[]) =>
    lines
      .filter(l => orderList.some(o => o.id === l.order_id))
      .map(l => {
        const pid = l.product_template_id||l.product_id;
        const price = priceMap[pid] ?? Number(l.price_unit||0);
        const qty = Number(l.product_uom_qty||0);
        return { id: l.id, name: l.name||'—', qty, price, subtotal: Math.round(qty*price), fromLog: pid != null && priceMap[pid] != null && priceMap[pid] !== Number(l.price_unit||0) };
      });

  const grandTotal = useMemo(() =>
    getLineRows(draftOrders).reduce((s,l) => s+l.subtotal, 0),
    [draftOrders, lines, priceMap]
  );

  // 按客戶匯總：同客戶跨訂單彙總各品項數量
  const customerGroups = useMemo(() => {
    const map = new Map<string, { orders: any[]; prodMap: Map<string,{name:string;qty:number;price:number;fromLog:boolean}> }>();
    for (const o of draftOrders) {
      const cid = o.customer_id;
      if (!map.has(cid)) map.set(cid, { orders: [], prodMap: new Map() });
      const g = map.get(cid)!;
      g.orders.push(o);
      for (const l of lines.filter(l => l.order_id === o.id)) {
        const pid = l.product_template_id||l.product_id||l.id;
        const price = priceMap[pid] ?? Number(l.price_unit||0);
        const qty = Number(l.product_uom_qty||0);
        const ex = g.prodMap.get(pid) || { name: l.name||'—', qty: 0, price, fromLog: pid != null && priceMap[pid] != null && priceMap[pid] !== Number(l.price_unit||0) };
        ex.qty += qty;
        g.prodMap.set(pid, ex);
      }
    }
    return map;
  }, [draftOrders, lines, priceMap]);

  // 按品項匯總：跨客戶跨訂單
  const prodSummary = useMemo(() => {
    const map = new Map<string,{name:string;totalQty:number;uom:string}>();
    for (const l of lines.filter(l => draftOrders.some(o => o.id === l.order_id))) {
      const key = l.product_template_id||l.product_id;
      const uom = tmplUom[l.product_template_id] || tmplUom[l.product_id] || '';
      const ex = map.get(key) || { name: l.name||'—', totalQty: 0, uom };
      ex.totalQty += Number(l.product_uom_qty||0);
      map.set(key, ex);
    }
    return Array.from(map.entries()).sort((a,b) => b[1].totalQty - a[1].totalQty);
  }, [lines, draftOrders]);

  const tabs: {key:'raw'|'customer'|'product'; label:string}[] = [
    { key: 'raw', label: '原始訂單' },
    { key: 'customer', label: '按客戶匯總' },
    { key: 'product', label: '按品項匯總' },
  ];

  if(loading) return <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'#f9fafb'}}><p className="text-gray-400">載入中...</p></div>;
  return (
    <div style={{height:'100%',display:'flex',flexDirection:'column',background:'#f9fafb'}}>
      <header style={{flexShrink:0}} className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={()=>nav('/admin/daily')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg bg-transparent hover:bg-gray-100 transition-colors border-none"><Arrow/></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">訂單接收</h1>
            <p className="text-sm text-gray-400">{draftOrders.length} 筆訂單 · 合計 ${grandTotal.toLocaleString()}</p>
          </div>
        </div>
        <DatePickerWithCounts value={selectedDate} onChange={setSelectedDate} />
      </header>
      <div style={{flexShrink:0}} className="px-6 pt-4 flex gap-2">
        {tabs.map(t=>(
          <button key={t.key} onClick={()=>setView(t.key)} className={`px-4 py-1.5 rounded-full text-sm transition-colors ${view===t.key?'bg-primary text-white':'bg-gray-100 text-gray-600'}`}>{t.label}</button>
        ))}
      </div>
      <div style={{flex:1,overflowY:'auto'}}>
        <div className="p-6 max-w-5xl mx-auto">
          {draftOrders.length===0?(
            <div className="text-center py-12 space-y-3">
              <InboxIcon />
              <p className="text-gray-500 font-medium">暫無待處理訂單</p>
              <p className="text-sm text-gray-400">當客戶提交新訂單後，將會出現在這裡</p>
            </div>
          ):view==='raw'?(
            /* ── 原始訂單：按下單時間排序，全部展開 ── */
            <div className="space-y-4">
              {draftOrders.map(o=>{
                const cust = customers[o.customer_id];
                const rows = getLineRows([o]);
                const total = rows.reduce((s,l)=>s+l.subtotal,0);
                return (
                  <div key={o.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-gray-900">{cust?.name||'—'}</p>
                        <p className="text-xs text-gray-400">{o.name||o.id.slice(0,8)} · {String(o.date_order||o.created_at||'').slice(0,16).replace('T',' ')}</p>
                      </div>
                      <span className="font-bold text-primary">${total.toLocaleString()}</span>
                    </div>
                    <div className="px-4 py-3"><LineTable rows={rows} /></div>
                  </div>
                );
              })}
            </div>
          ):view==='customer'?(
            /* ── 按客戶匯總：跨訂單合併同品項數量 ── */
            <div className="space-y-4">
              {Array.from(customerGroups.entries()).map(([cid, g])=>{
                const cust = customers[cid];
                const rows = Array.from(g.prodMap.entries()).map(([pid,p])=>({
                  id: pid, name: p.name, qty: p.qty, price: p.price,
                  subtotal: Math.round(p.qty*p.price), fromLog: p.fromLog
                }));
                const custTotal = rows.reduce((s,r)=>s+r.subtotal,0);
                return (
                  <div key={cid} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-gray-900">{cust?.name||cid}</p>
                        <p className="text-xs text-gray-400">{g.orders.length} 筆訂單 · {rows.length} 品項</p>
                      </div>
                      <span className="font-bold text-primary">${custTotal.toLocaleString()}</span>
                    </div>
                    <div className="px-4 py-3"><LineTable rows={rows} /></div>
                  </div>
                );
              })}
            </div>
          ):(
            /* ── 按品項匯總：跨客戶跨訂單統計數量 ── */
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                  <th className="py-3 px-4 text-left font-medium">#</th>
                  <th className="py-3 px-4 text-left font-medium">品名</th>
                  <th className="py-3 px-4 text-right font-medium">需求總量</th>
                  <th className="py-3 px-4 text-right font-medium">單位</th>
                </tr></thead>
                <tbody>
                  {prodSummary.map(([id,d],i)=>(
                    <tr key={id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-400">{i+1}</td>
                      <td className="py-3 px-4 font-medium">{d.name}</td>
                      <td className="py-3 px-4 text-right font-bold text-primary">{d.totalQty.toFixed(1)}</td>
                      <td className="py-3 px-4 text-right text-gray-500">{d.uom||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
