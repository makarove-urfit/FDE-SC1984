"""Admin pages — 所有後台頁面（v5+v6 合併）"""

_ARROW = '''const Arrow = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>;'''

def dashboard() -> str:
    return r'''import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../data/DataProvider';
import DatePickerWithCounts from '../../components/DatePickerWithCounts';
const Arrow = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>;
const LeafIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 1a13 13 0 0 1 .8 13c-1 1.8-2 3.1-3.8 4.5"/><path d="M5 20c.5-1 1.4-3 2-4.5"/></svg>;
const ClipboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>;
export default function DashboardPage() {
  const nav = useNavigate();
  const { orders, loading, selectedDate, setSelectedDate } = useData();
  const dlv = (o:any) => (typeof o.note === 'string' ? o.note : '').match(/配送日期：(\d{4}-\d{2}-\d{2})/)?.[1] || (o.date_order||o.created_at||'').slice(0,10);
  const isDraft = (o:any) => !o.state || o.state === 'draft';
  const isConfirmed = (o:any) => o.state === 'sale' || o.state === 'confirm';
  const cd = () => orders.filter(o => isDraft(o) && dlv(o)===selectedDate).length;
  const cs = () => orders.filter(o => isConfirmed(o) && dlv(o)===selectedDate).length;
  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">載入中...</p></div>;
  const steps = [
    {step:'1',label:'訂單接收',desc:`${cd()} 筆待處理`,href:'/admin/purchase-list',count:cd()},
    {step:'2',label:'採購定價',desc:'管理採購',href:'/admin/procurement',count:0},
    {step:'3',label:'庫存總表',desc:'查看庫存',href:'/admin/stock',count:0},
    {step:'4',label:'銷貨單',desc:`${cs()} 筆已確認`,href:'/admin/sales-orders',count:cs()},
    {step:'5',label:'配送管理',desc:'出貨追蹤',href:'/admin/delivery',count:0},
  ];
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LeafIcon />
            <h1 className="text-2xl font-bold text-gray-900">雄泉鮮食 管理後台</h1>
          </div>
          <DatePickerWithCounts value={selectedDate} onChange={setSelectedDate} />
        </div>
        <p className="text-sm text-gray-400">{selectedDate} 總覽</p>
      </header>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[{l:'全部訂單',v:orders.filter(o=>dlv(o)===selectedDate).length,c:'text-gray-900'},{l:'待處理',v:cd(),c:'text-orange-600'},{l:'已確認',v:cs(),c:'text-blue-600'},{l:'完成',v:orders.filter(o=>o.state==='done'&&dlv(o)===selectedDate).length,c:'text-green-600'},{l:'已取消',v:orders.filter(o=>o.state==='cancel'&&dlv(o)===selectedDate).length,c:'text-red-600'}].map(s=>(
            <div key={s.l} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-sm text-gray-400">{s.l}</p><p className={`text-3xl font-bold ${s.c}`}>{s.v}</p>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardIcon />
            <h2 className="font-bold text-gray-900">{selectedDate} 作業流程</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {steps.map(s=>(
              <button key={s.label} onClick={()=>nav(s.href)} className="rounded-xl border border-gray-100 bg-white hover:bg-gray-50 p-4 text-left transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-medium bg-gray-100 rounded-full w-5 h-5 flex items-center justify-center">{s.step}</span>
                  {s.count>0&&<span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">{s.count}</span>}
                </div>
                <p className="font-medium mt-1 text-gray-900 text-sm">{s.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
'''


def purchase_list() -> str:
    return r'''import { useState, useMemo, useEffect } from 'react';
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

  useEffect(() => {
    db.queryCustom(PRICE_LOG_UUID).then(data => setPriceLogs(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const priceMap = useMemo(() => {
    const map: Record<string, number> = {};
    const sorted = [...priceLogs].sort((a: any, b: any) =>
      String(b.data?.effective_date || b.effective_date || '').localeCompare(
        String(a.data?.effective_date || a.effective_date || '')
      )
    );
    for (const entry of sorted) {
      const d = entry.data || entry;
      const pid = d.product_id; const price = Number(d.price || 0);
      const effDate = String(d.effective_date || '');
      if (pid && price > 0 && effDate <= selectedDate && !map[pid]) map[pid] = price;
    }
    return map;
  }, [priceLogs, selectedDate]);

  const dlv = (o:any) => (typeof o.note === 'string' ? o.note : '').match(/配送日期：(\d{4}-\d{2}-\d{2})/)?.[1] || (o.date_order||o.created_at||'').slice(0,10);
  const isDraft = (o:any) => !o.state || o.state === 'draft';

  const draftOrders = useMemo(() =>
    orders
      .filter(o => isDraft(o) && dlv(o) === selectedDate)
      .sort((a,b) => String(b.date_order||b.created_at||'').localeCompare(String(a.date_order||a.created_at||''))),
    [orders, selectedDate]
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
          <button onClick={()=>nav('/')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg bg-transparent hover:bg-gray-100 transition-colors border-none"><Arrow/></button>
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
'''


def stock() -> str:
    """庫存總表 — 移除可銷售/啟用，改為顯示庫存數量"""
    return r'''import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../data/DataProvider';
import DatePickerWithCounts from '../../components/DatePickerWithCounts';
const Arrow = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>;
const BoxIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>;
export default function StockPage() {
  const nav = useNavigate();
  const { products, productProducts, stockQuants, loading, selectedDate, setSelectedDate } = useData();
  const stockMap = useMemo(() => {
    // variant_id -> template_id 映射
    const vtMap: Record<string, string> = {};
    for (const v of productProducts) { if (v.product_tmpl_id) vtMap[v.id] = v.product_tmpl_id; }
    const sm: Record<string, number> = {};
    for (const q of stockQuants) {
      if (!q.product_id) continue;
      const tmplId = vtMap[q.product_id] || q.product_id;
      sm[tmplId] = (sm[tmplId] || 0) + Number(q.quantity || 0);
    }
    return sm;
  }, [productProducts, stockQuants]);
  if(loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">載入中...</p></div>;
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={()=>nav('/')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"><Arrow/></button>
          <div><h1 className="text-xl font-bold text-gray-900">庫存總表</h1><p className="text-sm text-gray-400">{products.length} 個商品</p></div>
        </div>
        <DatePickerWithCounts value={selectedDate} onChange={setSelectedDate} />
      </header>
      <div className="p-6 max-w-5xl mx-auto">
        {products.length===0?(
          <div className="text-center py-12 space-y-3"><BoxIcon /><p className="text-gray-500 font-medium">尚無商品紀錄</p><p className="text-sm text-gray-400">商品匯入後將顯示在此</p></div>
        ):(
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
              <th className="py-3 px-4 text-left font-medium">#</th>
              <th className="py-3 px-4 text-left font-medium">編號</th>
              <th className="py-3 px-4 text-left font-medium">品名</th>
              <th className="py-3 px-4 text-right font-medium">進貨價</th>
              <th className="py-3 px-4 text-right font-medium">售價</th>
              <th className="py-3 px-4 text-right font-medium">庫存數量</th>
            </tr></thead><tbody>
              {products.map((p,i)=>{
                const qty = stockMap[p.id] || 0;
                return (<tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2.5 px-4 text-gray-400">{i+1}</td>
                <td className="py-2.5 px-4 font-mono text-xs text-gray-400">{p.default_code||'—'}</td>
                <td className="py-2.5 px-4 font-medium">{p.name}</td>
                <td className="py-2.5 px-4 text-right">{Number(p.standard_price||0)>0 ? `$${Number(p.standard_price).toLocaleString()}` : '—'}</td>
                <td className="py-2.5 px-4 text-right font-bold text-primary">{Number(p.list_price||0)>0 ? `$${Number(p.list_price).toLocaleString()}` : '—'}</td>
                <td className="py-2.5 px-4 text-right"><span className={`font-bold ${qty > 0 ? 'text-green-600' : 'text-gray-400'}`}>{qty > 0 ? qty.toFixed(1) : '0'}</span></td>
              </tr>);
              })}
            </tbody></table>
          </div>
        )}
      </div>
    </div>
  );
}
'''


def delivery() -> str:
    return r'''import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';
import { useData } from '../../data/DataProvider';
import ConfirmDialog from '../../components/ConfirmDialog';
import DatePickerWithCounts from '../../components/DatePickerWithCounts';
const Arrow = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>;
const TruckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>;
const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>;
const MapPinIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>;
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>;
const SaveIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>;
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const stCfg: Record<string,{label:string;color:string}> = {sale:{label:'待出貨',color:'bg-orange-100 text-orange-700'},done:{label:'已完成',color:'bg-green-100 text-green-700'}};
export default function DeliveryPage() {
  const nav = useNavigate();
  const { orders: allOrders, customers, orderLines: lines, employees, loading, refresh, selectedDate, setSelectedDate } = useData();
  const [orders, setOrders] = useState<any[]>([]);
  const [localCusts, setLocalCusts] = useState<Record<string,any>>({});
  const [expanded, setExpanded] = useState<string|null>(null);
  const [confirm, setConfirm] = useState<{id:string;action:string}|null>(null);
  const [editingAddr, setEditingAddr] = useState<string|null>(null);
  const [addrDraft, setAddrDraft] = useState('');
  const [savingAddr, setSavingAddr] = useState(false);
  const [driverFilter, setDriverFilter] = useState('all');
  const [savingDriver, setSavingDriver] = useState<string|null>(null);

  // #6 empMap 用 useMemo 避免每次 render 重建
  const empMap = useMemo(() => Object.fromEntries(employees.map(e=>[e.id, e])), [employees]);

  // #1 用 useEffect 同步 allOrders → 本地 state（修復 render body setState 無限迴圈）
  useEffect(() => {
    if (!loading) {
      const dlv = (o:any) => (typeof o.note === 'string' ? o.note : '').match(/配送日期：(\d{4}-\d{2}-\d{2})/)?.[1] || (o.date_order||o.created_at||'').slice(0,10);
      setOrders(allOrders.filter((x:any)=>['sale','done'].includes(x.state) && dlv(x)===selectedDate));
    }
  }, [allOrders, loading, selectedDate]);

  // #3 同步全域 customers → 本地 custs（用於地址寫入後更新 UI）
  const custs = useMemo(() => ({...customers, ...localCusts}), [customers, localCusts]);

  const doAction=async()=>{if(!confirm)return;try{await db.update('sale_orders',confirm.id,{state:confirm.action});setOrders(prev=>prev.map(o=>o.id===confirm.id?{...o,state:confirm.action}:o));}catch(e:any){console.error('失敗:',e.message)}setConfirm(null);};

  // 地址 — #3 修復：用 setLocalCusts 取代不存在的 setCusts
  const saveAddress=async(cid:string)=>{
    setSavingAddr(true);
    try{ await db.update('customers',cid,{contact_address:addrDraft}); setLocalCusts(prev=>({...prev,[cid]:{...(customers[cid]||prev[cid]||{}),contact_address:addrDraft}})); setEditingAddr(null); }
    catch(e:any){console.error('地址儲存失敗:',e.message)} setSavingAddr(false);
  };
  const startEditAddr=(cid:string)=>{ setEditingAddr(cid); setAddrDraft(custs[cid]?.contact_address||''); };

  // 配送負責人（存員工 ID 到 client_order_ref）
  const assignDriver=async(oid:string,empId:string)=>{
    setSavingDriver(oid);
    try{
      await db.update('sale_orders',oid,{client_order_ref:empId||null});
      setOrders(prev=>prev.map(o=>o.id===oid?{...o,client_order_ref:empId||null}:o));
    }catch(e:any){console.error('指派失敗:',e.message)} setSavingDriver(null);
  };

  // 過濾
  const filteredOrders=driverFilter==='all'?orders:driverFilter==='unassigned'?orders.filter(o=>!o.client_order_ref):orders.filter(o=>o.client_order_ref===driverFilter);
  const assignedEmpIds=[...new Set(orders.map(o=>o.client_order_ref).filter(Boolean))];

  const custGroups=new Map<string,any[]>();
  for(const o of filteredOrders){const l=custGroups.get(o.customer_id)||[];l.push(o);custGroups.set(o.customer_id,l);}
  const co=confirm?orders.find(o=>o.id===confirm.id):null;

  // 統計（按員工 ID）
  const driverStats=new Map<string,number>();
  for(const o of orders){const d=o.client_order_ref||'_unassigned';driverStats.set(d,(driverStats.get(d)||0)+1);}

  if(loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">載入中...</p></div>;
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={()=>nav('/')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg bg-transparent hover:bg-gray-100 transition-colors border-none"><Arrow/></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">配送管理</h1>
            <p className="text-sm text-gray-400">{filteredOrders.length} 筆訂單{driverFilter!=='all'?` · ${driverFilter==='unassigned'?'未指派':empMap[driverFilter]?.name||driverFilter}`:''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DatePickerWithCounts value={selectedDate} onChange={setSelectedDate} />
          <UserIcon />
          <select className="px-3 pr-8 py-2 border border-gray-200 rounded-lg bg-white text-sm" value={driverFilter} onChange={e=>setDriverFilter(e.target.value)}>
            <option value="all">全部負責人 ({orders.length})</option>
            <option value="unassigned">未指派 ({driverStats.get('_unassigned')||0})</option>
            {assignedEmpIds.map(eid=>{const emp=empMap[eid]; return(<option key={eid} value={eid}>{emp?.name||eid} ({driverStats.get(eid)||0})</option>);})}
          </select>
        </div>
      </header>

      {/* 負責人摘要卡片 */}
      {assignedEmpIds.length>0 && driverFilter==='all' && (
        <div className="px-6 pt-4 flex gap-2 flex-wrap">
          <button onClick={()=>setDriverFilter('unassigned')}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium hover:bg-gray-50 transition-colors flex items-center gap-1.5">
            <UserIcon /><span>未指派</span><span className="bg-gray-100 px-1.5 py-0.5 rounded-full text-gray-500">{driverStats.get('_unassigned')||0}</span>
          </button>
          {assignedEmpIds.map(eid=>{const emp=empMap[eid]; return(
            <button key={eid} onClick={()=>setDriverFilter(eid)}
              className="px-3 py-1.5 bg-white border border-blue-200 rounded-full text-xs font-medium hover:bg-blue-50 transition-colors flex items-center gap-1.5 text-blue-700">
              <UserIcon /><span>{emp?.name||eid}</span>{emp?.job_title&&<span className="text-blue-400">({emp.job_title})</span>}<span className="bg-blue-50 px-1.5 py-0.5 rounded-full">{driverStats.get(eid)||0}</span>
            </button>
          );})}
        </div>
      )}

      <div className="p-6 max-w-5xl mx-auto">
        {custGroups.size===0?(
          <div className="text-center py-12 space-y-3"><TruckIcon /><p className="text-gray-500 font-medium">尚無待配送訂單</p><p className="text-sm text-gray-400">確認銷貨單後訂單將出現在此</p></div>
        ):(
          <div className="space-y-3">{Array.from(custGroups.entries()).map(([cid,cos])=>{
            const cust=custs[cid]; const exp=expanded===cid;
            const addr=cust?.contact_address;
            const isEditingThis=editingAddr===cid;
            return(<div key={cid} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div role="button" onClick={()=>setExpanded(exp?null:cid)} className="w-full px-4 py-4 flex justify-between items-center bg-white hover:bg-gray-50 cursor-pointer">
                <div className="text-left">
                  <p className="font-bold text-gray-900">{cust?.name||cid}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPinIcon />
                    <p className="text-xs text-gray-400">{addr || '地址未設定'}</p>
                  </div>
                  <p className="text-sm text-gray-400 mt-0.5">{cos.length} 筆</p>
                </div>
                <span className="text-gray-400 text-xl">{exp?'▾':'▸'}</span>
              </div>
              {exp&&<div className="border-t border-gray-100">
                {/* 地址區塊 */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  {isEditingThis ? (
                    <div className="flex gap-2 items-center">
                      <MapPinIcon />
                      <input type="text" value={addrDraft} onChange={e=>setAddrDraft(e.target.value)} placeholder="請輸入送貨地址..."
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm" autoFocus
                        onKeyDown={e=>{if(e.key==='Enter')saveAddress(cid);if(e.key==='Escape')setEditingAddr(null);}} />
                      <button onClick={()=>saveAddress(cid)} disabled={savingAddr}
                        className="px-3 py-1 bg-primary text-white rounded text-xs hover:bg-green-700 transition-colors flex items-center gap-1">
                        <SaveIcon /> {savingAddr?'儲存中...':'儲存'}
                      </button>
                      <button onClick={()=>setEditingAddr(null)} className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300 transition-colors">取消</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <MapPinIcon />
                      <span className={`text-sm ${addr ? 'text-gray-700' : 'text-gray-400'}`}>{addr || '地址未設定'}</span>
                      <button onClick={e=>{e.stopPropagation();startEditAddr(cid);}}
                        className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300 transition-colors flex items-center gap-1">
                        <EditIcon /> {addr ? '編輯' : '設定地址'}
                      </button>
                    </div>
                  )}
                </div>
                {/* 訂單列表 */}
                {cos.map(o=>{const cfg=stCfg[o.state]||stCfg.sale;const ol=lines.filter(l=>l.order_id===o.id);
                  const driverEmpId=o.client_order_ref;
                  const driverEmp=driverEmpId?empMap[driverEmpId]:null;
                  const isSavingThis=savingDriver===o.id;
                  return(<div key={o.id} className="border-t border-gray-200">
                    <div className="px-4 py-3 flex justify-between items-center">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{o.name||o.id}</p>
                        <p className="text-xs text-gray-400">{ol.length} 品項</p>
                        {/* 配送負責人下拉 */}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <UserIcon />
                          <select value={driverEmpId||''} onChange={e=>assignDriver(o.id,e.target.value)} disabled={isSavingThis}
                            className={`text-xs px-2 pr-8 py-1 border rounded transition-colors ${driverEmp ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-400'}`}>
                            <option value="">-- 選擇負責人 --</option>
                            {employees.map(emp=>(<option key={emp.id} value={emp.id}>{emp.name}{emp.job_title?` (${emp.job_title})`:''}</option>))}
                          </select>
                          {isSavingThis && <span className="text-xs text-gray-400">儲存中...</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                        {o.state==='sale'&&<button onClick={()=>setConfirm({id:o.id,action:'done'})} className="px-3 py-1 bg-primary text-white rounded text-xs hover:bg-green-700 transition-colors flex items-center gap-1"><CheckCircleIcon /> 完成配送</button>}
                      </div>
                    </div>
                    <div className="px-4 py-2"><div className="flex flex-wrap gap-1.5">
                      {ol.map((l:any)=>(<span key={l.id} className="px-2 py-0.5 bg-gray-50 rounded text-xs text-gray-500">{l.name} x{Number(l.product_uom_qty||0).toFixed(1)}</span>))}
                    </div></div>
                  </div>);
                })}
              </div>}
            </div>);
          })}</div>
        )}
      </div>
      <ConfirmDialog open={!!confirm} title={`確認完成配送 ${co?.name||''}？`}
        message="標記為已完成後無法復原。" confirmText="確認完成" variant="info"
        onConfirm={doAction} onCancel={()=>setConfirm(null)} />
    </div>
  );
}
'''


def procurement() -> str:
    """P0-1: 採購定價 — 供應商分群 + 進貨價/加成率/售價輸入"""
    return r'''import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';
import { useData } from '../../data/DataProvider';
import DatePickerWithCounts from '../../components/DatePickerWithCounts';

const PRICE_LOG_UUID = '0838e79c-52bb-4d2a-bac8-92eaef87f691';
''' + _ARROW + r'''
const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>;
const PricingIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const PackageIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>;

interface PricingItem {
  productId: string; productName: string; code: string;
  supplierId: string; supplierName: string;
  estimatedQty: number; actualQty: number;
  purchasePrice: number; markupRate: number; sellingPrice: number;
  state: 'pending' | 'priced' | 'stocked';
}

export default function ProcurementPage() {
  const nav = useNavigate();
  const { orderLines, products, supplierInfos, suppliers, stockQuants, stockLocations, productProducts, loading, selectedDate, setSelectedDate } = useData();
  const [items, setItems] = useState<PricingItem[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [priceLogs, setPriceLogs] = useState<any[]>([]);

  // 載入 x_price_log（一次性，存 raw records）
  useEffect(() => {
    db.queryCustom(PRICE_LOG_UUID)
      .then(recs => setPriceLogs((Array.isArray(recs) ? recs : []).filter((r: any) => (r.data || {}).effective_date === selectedDate)))
      .catch(() => {});
  }, [selectedDate]);

  // 依選定配送日重建 PricingItem
  const olKey = orderLines.length;
  const prKey = products.length;
  useEffect(() => {
    if (loading) return;
    const prodMap: Record<string,any> = {};
    for (const p of products) prodMap[p.id] = p;
    const prodSup: Record<string,string> = {};
    for (const si of supplierInfos) { if (si.product_tmpl_id) prodSup[si.product_tmpl_id] = si.supplier_id; }
    const defaultSupId = Object.keys(suppliers)[0] || 'unknown';

    // 找 x_price_log 裡屬於 selectedDate 的最新一筆（per product）
    const logMap: Record<string, any> = {};
    for (const rec of priceLogs) {
      const d = rec.data || {};
      const pid = String(d.tmpl_uuid || d.product_tmpl_id || d.product_id || '');
      if (!pid) continue;
      // created_at 較新的蓋掉舊的
      if (!logMap[pid] || (rec.created_at || '') > (logMap[pid].created_at || '')) logMap[pid] = rec;
    }

    const itemMap = new Map<string, PricingItem>();
    for (const l of orderLines) {
      if (typeof l.delivery_date === 'string' && l.delivery_date.slice(0, 10) !== selectedDate) continue;
      const pid = l.product_template_id || l.product_id;
      if (!pid) continue;
      const prod = prodMap[pid];
      const supId = prodSup[pid] || (supplierInfos.length === 0 ? defaultSupId : 'unknown');
      const existing = itemMap.get(pid);
      if (existing) { existing.estimatedQty += Number(l.product_uom_qty || 0); existing.actualQty = existing.estimatedQty; }
      else {
        const log = logMap[pid]?.data;
        const purchasePrice = log ? Number(log.purchase_price || 0) : Number(prod?.standard_price || 0);
        const sellingPrice  = log ? Number(log.price || 0)          : Number(prod?.list_price || 0);
        const hasPriced = sellingPrice > 0;
        itemMap.set(pid, { productId: pid, productName: prod?.name || l.name || '—', code: prod?.default_code || '', supplierId: supId, supplierName: suppliers[supId]?.name || '未指定供應商', estimatedQty: Number(l.product_uom_qty || 0), actualQty: Number(l.product_uom_qty || 0), purchasePrice, markupRate: purchasePrice > 0 && sellingPrice > 0 ? Math.round(sellingPrice / purchasePrice * 100) : 130, sellingPrice, state: hasPriced ? 'priced' : 'pending' });
      }
    }
    setItems(Array.from(itemMap.values()));
    setExpanded([...new Set(Array.from(itemMap.values()).map(i => i.supplierId))]);
  }, [loading, olKey, prKey, selectedDate, priceLogs]);

  // 分群
  const groups = new Map<string, PricingItem[]>();
  for (const item of items) {
    const list = groups.get(item.supplierId) || [];
    list.push(item);
    groups.set(item.supplierId, list);
  }

  const updateItem = (pid: string, field: string, value: number) => {
    setItems(prev => prev.map(i => {
      if (i.productId !== pid) return i;
      const updated = {...i, [field]: value};
      if (field === 'purchasePrice' || field === 'markupRate') {
        const pp = field === 'purchasePrice' ? value : i.purchasePrice;
        const mr = field === 'markupRate' ? value : i.markupRate;
        updated.sellingPrice = pp > 0 ? Math.round(pp * mr / 100) : 0;
      }
      return updated;
    }));
  };

  // order_id 可能是 [uuid, name] 或純字串
  const _oid = (val: any): string => Array.isArray(val) ? String(val[0]) : String(val ?? '');

  // 重取指定訂單的所有明細，重算並寫回 amount_total
  const recalcOrderTotals = async (orderIds: string[]) => {
    const unique = [...new Set(orderIds)].filter(Boolean);
    await Promise.all(unique.map(async (oid) => {
      const lines = await db.queryFiltered('sale_order_lines', [{ column: 'order_id', op: 'eq', value: oid }]);
      const total = (Array.isArray(lines) ? lines : []).reduce((s: number, l: any) =>
        s + Number(l.product_uom_qty || 0) * Number(l.price_unit || 0), 0);
      await db.update('sale_orders', oid, { amount_total: Math.round(total * 100) / 100 });
    }));
  };

  const applyPricing = async (pid: string) => {
    const item = items.find(i => i.productId === pid);
    if (!item || item.purchasePrice <= 0) return;
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await db.update('product_templates', pid, { standard_price: item.purchasePrice, list_price: item.sellingPrice });
      // 寫入價格稽核 log
      await db.insertCustom(PRICE_LOG_UUID, { tmpl_uuid: pid, price: item.sellingPrice, purchase_price: item.purchasePrice, effective_date: today });
      // 同步選定日期配送的訂單明細售價
      const matchingLines = orderLines.filter((l: any) =>
        (l.product_template_id === pid || l.product_id === pid) &&
        typeof l.delivery_date === 'string' && l.delivery_date.slice(0, 10) === selectedDate
      );
      await Promise.all(matchingLines.map((l: any) => db.update('sale_order_lines', l.id, { price_unit: item.sellingPrice })));
      // 重算受影響訂單的總金額
      await recalcOrderTotals(matchingLines.map((l: any) => _oid(l.order_id)));
      if (item.actualQty > 0) {
        // 確保有 product_products 變體紀錄（FK 約束）
        let variantId = productProducts.find((v:any) => v.product_tmpl_id === pid)?.id;
        if (!variantId) {
          const created = await db.insert('product_products', { tmpl_uuid: pid, active: true });
          if (created?.id) variantId = created.id;
        }
        if (variantId) {
          const locId = stockLocations.find((l:any) => l.usage === 'internal')?.id || stockLocations[0]?.id;
          const sq = stockQuants.find(q => q.product_id === variantId);
          if (sq) { await db.update('stock_quants', sq.id, { quantity: Number(sq.quantity||0) + item.actualQty }); }
          else if (locId) { await db.insert('stock_quants', { product_id: variantId, location_id: locId, quantity: item.actualQty }); }
        }
      }
      setItems(prev => prev.map(i => i.productId === pid ? {...i, state: 'priced'} : i));
    } catch(e: any) { console.error('定價失敗:', e.message); }
    setSaving(false);
  };

  const applyAll = async () => {
    const priceable = items.filter(i => i.purchasePrice > 0);
    if (priceable.length === 0) return;
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const allAffectedOrderIds: string[] = [];
    for (const item of priceable) {
      try {
        await db.update('product_templates', item.productId, { standard_price: item.purchasePrice, list_price: item.sellingPrice });
        // 寫入價格稽核 log
        await db.insertCustom(PRICE_LOG_UUID, { tmpl_uuid: item.productId, price: item.sellingPrice, purchase_price: item.purchasePrice, effective_date: today });
        // 同步選定日期配送的訂單明細售價
        const matchingLines = orderLines.filter((l: any) =>
          (l.product_template_id === item.productId || l.product_id === item.productId) &&
          typeof l.delivery_date === 'string' && l.delivery_date.slice(0, 10) === selectedDate
        );
        await Promise.all(matchingLines.map((l: any) => db.update('sale_order_lines', l.id, { price_unit: item.sellingPrice })));
        allAffectedOrderIds.push(...matchingLines.map((l: any) => _oid(l.order_id)));
        if (item.actualQty > 0) {
          let variantId = productProducts.find((v:any) => v.product_tmpl_id === item.productId)?.id;
          if (!variantId) {
            const created = await db.insert('product_products', { product_tmpl_id: item.productId, active: true });
            if (created?.id) variantId = created.id;
          }
          if (variantId) {
            const locId = stockLocations.find((l:any) => l.usage === 'internal')?.id || stockLocations[0]?.id;
            const sq = stockQuants.find(q => q.product_id === variantId);
            if (sq) { await db.update('stock_quants', sq.id, { quantity: Number(sq.quantity||0) + item.actualQty }); }
            else if (locId) { await db.insert('stock_quants', { product_id: variantId, location_id: locId, quantity: item.actualQty }); }
          }
        }
        setItems(prev => prev.map(i => i.productId === item.productId ? {...i, state: 'priced'} : i));
      } catch(e) { console.error(e); }
    }
    // 所有品項更新完後，一次重算所有受影響訂單的總金額
    await recalcOrderTotals(allAffectedOrderIds);
    setSaving(false);
  };

  const toggleGroup = (sid: string) => {
    setExpanded(prev => prev.includes(sid) ? prev.filter(id => id !== sid) : [...prev, sid]);
  };

  const pendingCount = items.filter(i => i.state === 'pending').length;
  const pricedCount = items.filter(i => i.state === 'priced').length;

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">載入中...</p></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={()=>nav('/')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg bg-transparent hover:bg-gray-100 transition-colors border-none"><Arrow/></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">採購定價</h1>
            <p className="text-sm text-gray-400">{items.length} 品項 · {pendingCount} 待定價 · {pricedCount} 已定價</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DatePickerWithCounts value={selectedDate} onChange={setSelectedDate} />
          {pendingCount > 0 && (
            <button onClick={applyAll} disabled={saving}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${saving ? 'bg-gray-200 text-gray-400' : 'bg-primary text-white hover:bg-green-700'}`}>
              <PricingIcon />
              {saving ? '處理中...' : `一鍵全部定價 (${pendingCount})`}
            </button>
          )}
        </div>
      </header>

      <div className="p-6 max-w-6xl mx-auto">
        {items.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <PackageIcon />
            <p className="text-gray-500 font-medium">尚無採購品項</p>
            <p className="text-sm text-gray-400">訂單明細將在此彙總顯示</p>
            <button onClick={()=>nav('/admin/purchase-list')} className="text-primary hover:underline text-sm mt-2">先去查看訂單接收 →</button>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(groups.entries()).map(([sid, groupItems]) => {
              const sup = suppliers[sid];
              const isOpen = expanded.includes(sid);
              const groupPriced = groupItems.filter(i => i.state === 'priced').length;
              const groupTotal = groupItems.reduce((s, i) => s + i.purchasePrice * i.actualQty, 0);
              return (
                <div key={sid} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div role="button" onClick={() => toggleGroup(sid)} className="w-full px-4 py-4 flex justify-between items-center bg-white hover:bg-gray-50 cursor-pointer">
                    <div className="text-left">
                      <p className="font-bold text-gray-900">{sup?.name || sid}</p>
                      <p className="text-sm text-gray-400">{sup?.ref ? `${sup.ref} · ` : ''}{groupItems.length} 品項 · {groupPriced}/{groupItems.length} 已定價</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {groupTotal > 0 && <span className="text-sm font-bold text-primary">${Math.round(groupTotal).toLocaleString()}</span>}
                      <span className="text-gray-400 text-xl">{isOpen ? '▾' : '▸'}</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-gray-100">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-gray-50 text-gray-500 text-xs">
                          <th className="py-2 px-3 text-left font-medium">品名</th>
                          <th className="py-2 px-3 text-right font-medium w-20">預估量</th>
                          <th className="py-2 px-3 text-right font-medium w-20">實際量</th>
                          <th className="py-2 px-3 text-right font-medium w-24">進貨價</th>
                          <th className="py-2 px-3 text-center font-medium w-16">加成%</th>
                          <th className="py-2 px-3 text-right font-medium w-20">售價</th>
                          <th className="py-2 px-3 text-right font-medium w-24">小計</th>
                          <th className="py-2 px-3 text-center font-medium w-20">操作</th>
                        </tr></thead>
                        <tbody>
                          {groupItems.map(item => {
                            const subtotal = item.purchasePrice * item.actualQty;
                            const isPriced = item.state === 'priced';
                            return (
                              <tr key={item.productId} className={`border-b border-gray-50 ${isPriced ? 'bg-green-50' : ''}`}>
                                <td className="py-2 px-3">
                                  <p className="font-medium">{item.productName}</p>
                                  {item.code && <p className="text-xs text-gray-400 font-mono">{item.code}</p>}
                                </td>
                                <td className="py-2 px-3 text-right text-gray-400">{item.estimatedQty.toFixed(1)}</td>
                                <td className="py-2 px-3 text-right">
                                  <input type="number" value={item.actualQty} step="0.5" min="0"
                                    onChange={e => updateItem(item.productId, 'actualQty', Number(e.target.value))}
                                    className="w-16 text-right py-1 px-1.5 border border-gray-200 rounded text-sm" />
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <input type="number" value={item.purchasePrice || ''} step="1" min="0" placeholder="$"
                                    onChange={e => updateItem(item.productId, 'purchasePrice', Number(e.target.value))}
                                    className="w-20 text-right py-1 px-1.5 border border-gray-200 rounded text-sm" />
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <input type="number" value={item.markupRate} step="5" min="100"
                                    onChange={e => updateItem(item.productId, 'markupRate', Number(e.target.value))}
                                    className="w-14 text-center py-1 px-1 border border-gray-200 rounded text-sm" />
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-primary">
                                  {item.sellingPrice > 0 ? `$${item.sellingPrice}` : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-medium">
                                  {subtotal > 0 ? `$${Math.round(subtotal).toLocaleString()}` : '—'}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <button onClick={() => applyPricing(item.productId)} disabled={item.purchasePrice <= 0 || saving}
                                    className={`px-2 py-1 rounded text-xs transition-colors flex items-center justify-center gap-1 ${item.purchasePrice <= 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : isPriced ? 'bg-green-50 text-green-700 border border-green-300 hover:bg-green-100' : 'bg-primary text-white hover:bg-green-700'}`}>
                                    {isPriced ? <><CheckIcon /> 更新</> : '確認'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot><tr className="bg-gray-50 font-bold border-t border-gray-200">
                          <td className="py-2 px-3 text-right" colSpan={6}>小計</td>
                          <td className="py-2 px-3 text-right text-primary">${Math.round(groupTotal).toLocaleString()}</td>
                          <td></td>
                        </tr></tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
'''


def sales_orders() -> str:
    """P0-2: 銷貨單管理 — 含配貨數量調整"""
    return r'''import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';
import { useData } from '../../data/DataProvider';
import ConfirmDialog from '../../components/ConfirmDialog';
import DatePickerWithCounts from '../../components/DatePickerWithCounts';
''' + _ARROW + r'''
const RefreshIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
const EmptySearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
const CheckAllIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>;
const ST: Record<string,{label:string;color:string;bg:string}> = {
  draft:{label:'草稿',color:'#92400e',bg:'#fef3c7'},sent:{label:'已送出',color:'#1e40af',bg:'#dbeafe'},
  sale:{label:'已確認',color:'#065f46',bg:'#d1fae5'},confirm:{label:'已確認',color:'#065f46',bg:'#d1fae5'},
  done:{label:'完成',color:'#374151',bg:'#f3f4f6'},cancel:{label:'已取消',color:'#991b1b',bg:'#fee2e2'},
};
export default function SalesOrdersPage() {
  const nav = useNavigate();
  const { orders: allOrders, customers: custs, orderLines, stockQuants, productProducts, loading, refresh, selectedDate, setSelectedDate } = useData();
  const [orders, setOrders] = useState<any[]>([]);
  const [localLines, setLocalLines] = useState<Record<string,any>>({});
  // #3 合併全域 orderLines 與本地修改
  const lines = orderLines.map(l => localLines[l.id] ? {...l, ...localLines[l.id]} : l);
  const [search,setSearch]=useState(''); const [filter,setFilter]=useState('all');
  const [expanded,setExpanded]=useState<string|null>(null);
  const [selectedOrders,setSelectedOrders]=useState<Set<string>>(new Set());
  const [confirm,setConfirm]=useState<{id:string;action:string}|null>(null);
  const [editingLine,setEditingLine]=useState<string|null>(null);

  // 同步 allOrders 到本地 state
  useEffect(() => {
    if (!loading && allOrders.length > 0) {
      const sorted = [...allOrders].sort((a:any,b:any) => new Date(b.date_order||b.created_at||0).getTime() - new Date(a.date_order||a.created_at||0).getTime());
      setOrders(sorted);
    }
  }, [allOrders, loading]);


  // stockMap: template_id -> total quantity (支援 variant 間接映射)
  const stockMap = useMemo(() => {
    // variant_id -> template_id 映射
    const vtMap: Record<string, string> = {};
    for (const v of productProducts) { if (v.product_tmpl_id) vtMap[v.id] = v.product_tmpl_id; }
    const sm: Record<string, number> = {};
    for (const q of stockQuants) {
      if (!q.product_id) continue;
      const tmplId = vtMap[q.product_id] || q.product_id; // fallback: 直接用 product_id
      sm[tmplId] = (sm[tmplId]||0) + Number(q.quantity||0);
    }
    return sm;
  }, [stockQuants, productProducts]);

  const doAction = async () => {
    if (!confirm) return;
    const oldState = orders.find(o => o.id === confirm.id)?.state;
    if (confirm.action === 'sale' && oldState === 'draft') {
      const ol = lines.filter(l => l.order_id === confirm.id);
      let oversold = false; let msg = '';
      for (const l of ol) {
        const pid = l.product_template_id || l.product_id; const req = Number(l.product_uom_qty||0);
        const avail = stockMap[pid] || 0;
        if (avail < req) { oversold = true; msg += `[${l.name||'商品'}] 庫存不足 (需 ${req}, 餘 ${avail})\n`; }
      }
      if (oversold) { alert(msg + '請先補足庫存再確認訂單。'); setConfirm(null); return; }
      
      try {
        for (const l of ol) {
          const pid = l.product_template_id || l.product_id; let req = Number(l.product_uom_qty||0);
          const quants = stockQuants.filter(q => q.product_id === pid);
          for (const q of quants) {
            if (req <= 0) break;
            const qqty = Number(q.quantity||0);
            if (qqty > 0) {
              const deduct = Math.min(qqty, req);
              await db.update('stock_quants', q.id, { quantity: qqty - deduct });
              req -= deduct; q.quantity = qqty - deduct;
            }
          }
        }
      } catch(e:any) { console.error(e); alert('扣除庫存失敗，查無紀錄或網路異常'); return; }
    }

    try {
      await db.update('sale_orders', confirm.id, {state: confirm.action});
      setOrders(prev => prev.map(o => o.id===confirm.id ? {...o, state: confirm.action} : o));
    } catch(e:any) {
      console.error('狀態更新失敗:', e.message);
      alert(`狀態更新失敗：${e.message}\n(Odoo state 欄位可能需要透過後台操作)`);
    }
    setConfirm(null);
  };

  const updateLineQty = async (lineId: string, qty: number) => {
    try {
      await db.update('sale_order_lines', lineId, {qty_delivered: qty});
      setLocalLines(prev => ({...prev, [lineId]: {qty_delivered: qty}}));
      setEditingLine(null);
    } catch(e:any) { console.error('更新失敗:', e.message); }
  };

  const toggleSelect = (id: string) => {
    setSelectedOrders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => {
    if (selectedOrders.size === filtered.length) setSelectedOrders(new Set());
    else setSelectedOrders(new Set(filtered.map(o => o.id)));
  };

  const batchAction = async (action: string) => {
    const targetOrders = orders.filter(o => selectedOrders.has(o.id));
    if (action === 'sale') {
      const draftOrders = targetOrders.filter(o => !o.state || o.state === 'draft');
      const demand: Record<string, number> = {};
      const demandNames: Record<string, string> = {};
      for (const o of draftOrders) {
        for (const l of lines.filter(x => x.order_id === o.id)) {
          const pid = l.product_template_id || l.product_id;
          if (pid) { demand[pid] = (demand[pid]||0) + Number(l.product_uom_qty||0); demandNames[pid] = l.name||'商品'; }
        }
      }
      let oversold = false; let msg = '';
      for (const [pid, req] of Object.entries(demand)) {
        const avail = stockMap[pid] || 0;
        if (avail < req) { oversold = true; msg += `[${demandNames[pid]}] 總需 ${req}, 僅餘 ${avail}\n`; }
      }
      if (oversold) { alert(msg + '庫存不足，無法批次確認訂單！\n(尚未扣除任何庫存)'); return; }

      try {
        for (const [pid, totalReq] of Object.entries(demand)) {
          let req = totalReq;
          const quants = stockQuants.filter(q => q.product_id === pid);
          for (const q of quants) {
            if (req <= 0) break;
            const qqty = Number(q.quantity||0);
            if (qqty > 0) { const deduct = Math.min(qqty, req); await db.update('stock_quants', q.id, { quantity: qqty - deduct }); req -= deduct; q.quantity = qqty - deduct; }
          }
        }
      } catch(e:any) { console.error(e); alert('批次扣除庫存失敗'); return; }
    }

    for (const id of selectedOrders) {
      const o = targetOrders.find(x => x.id === id);
      if (action === 'sale' && o?.state !== 'draft') continue; // only process draft ones
      try { await db.update('sale_orders', id, {state: action}); } catch(e) {}
    }
    setOrders(prev => prev.map(o => selectedOrders.has(o.id) && (action !== 'sale' || isDraft(o)) ? {...o, state: action} : o));
    setSelectedOrders(new Set());
  };

  const dlv = (o:any) => (typeof o.note === 'string' ? o.note : '').match(/配送日期：(\d{4}-\d{2}-\d{2})/)?.[1] || (o.date_order||o.created_at||'').slice(0,10);
  const isDraft = (o:any) => !o.state || o.state === 'draft';
  const filtered = orders.filter(o => {
    if (filter !== 'all') {
      if (filter === 'draft' ? !isDraft(o) : o.state !== filter) return false;
    }
    if (dlv(o) !== selectedDate) return false;
    if (search) { const s = search.toLowerCase(); if (!(custs[o.customer_id]?.name||'').toLowerCase().includes(s) && !(o.name||'').toLowerCase().includes(s)) return false; }
    return true;
  });
  const co = confirm ? orders.find(o => o.id===confirm.id) : null;
  const draftSelected = [...selectedOrders].filter(id => orders.find(o => o.id===id)?.state === 'draft').length;

  return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column',overflow:'hidden',background:'#f9fafb'}}>
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center" style={{flexShrink:0}}>
        <div className="flex items-center gap-3">
          <button onClick={()=>nav('/')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg bg-transparent hover:bg-gray-100 transition-colors border-none"><Arrow/></button>
          <div><h1 className="text-xl font-bold text-gray-900">銷貨單管理</h1><p className="text-sm text-gray-400">{orders.length} 筆訂單</p></div>
        </div>
        <div className="flex items-center gap-2">
          <DatePickerWithCounts value={selectedDate} onChange={setSelectedDate} />
          {draftSelected > 0 && (
            <button onClick={()=>batchAction('sale')} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-1.5">
              <CheckAllIcon /> 批次確認 ({draftSelected})
            </button>
          )}
          <button onClick={()=>refresh(true)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors flex items-center gap-1.5"><RefreshIcon /> 重新整理</button>
        </div>
      </header>
      <div style={{flexShrink:0}} className="px-6 pt-4 flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-[200px]">
          <SearchIcon />
          <input type="text" placeholder="搜尋訂單編號或客戶..." value={search} onChange={e=>setSearch(e.target.value)} className="border-none outline-none bg-transparent flex-1 text-sm" />
        </div>
        <select className="px-3 pr-8 py-2 border border-gray-200 rounded-lg bg-white text-sm" value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="all">全部狀態</option>
          <option value="draft">待處理（草稿）</option>
          <option value="sent">已送出</option>
          <option value="sale">已確認</option>
          <option value="done">完成</option>
          <option value="cancel">已取消</option>
        </select>
      </div>
      {filtered.length > 0 && (
        <div style={{flexShrink:0}} className="px-6 pt-3 flex items-center gap-2">
          <button onClick={selectAll} className="text-sm text-primary hover:bg-green-50 px-3 py-1.5 rounded-md transition-colors border border-transparent hover:border-green-200 focus:outline-none">{selectedOrders.size === filtered.length ? '取消全選' : '全選'}</button>
          {selectedOrders.size > 0 && <span className="text-sm text-gray-400">{selectedOrders.size} 已選</span>}
        </div>
      )}
      <div style={{flex:1,overflowY:'auto'}}>
      <div className="p-6 pb-6 max-w-6xl mx-auto">
        {loading ? <div className="text-center text-gray-400 py-12">載入中...</div>
        : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-3"><EmptySearchIcon /><p className="text-gray-500 font-medium">沒有符合的訂單</p></div>
        ) : <div className="space-y-3">{filtered.map(o => {
          const st = ST[o.state as string] || ST.draft; const cust = custs[o.customer_id]; const ol = lines.filter(l => l.order_id===o.id); const exp = expanded===o.id;
          return (<div key={o.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div role="button" className="px-4 py-4 flex justify-between items-center bg-white hover:bg-gray-50 cursor-pointer" onClick={()=>setExpanded(exp?null:o.id)}>
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={selectedOrders.has(o.id)} onChange={e=>{e.stopPropagation();toggleSelect(o.id);}} className="accent-primary" onClick={e=>e.stopPropagation()} />
                <div className="text-left"><p className="font-bold text-gray-900">{o.name||`SO-${(o.id||'').slice(0,8)}`}</p>
                <p className="text-sm text-gray-400">{cust?.name||'—'} · {o.date_order?new Date(o.date_order).toLocaleDateString('zh-TW'):'—'}</p></div>
              </div>
              <div className="flex items-center gap-3">
                <span style={{color:st.color,background:st.bg,padding:'3px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:600}}>{st.label}</span>
                <span className="font-bold text-gray-900">{o.amount_total!=null?`$${Number(o.amount_total).toLocaleString()}`:'—'}</span>
                <span className="text-gray-400">{exp?'▾':'▸'}</span>
              </div>
            </div>
            {exp && <div className="border-t border-gray-200 px-4 py-3">
              {ol.length===0?<p className="text-sm text-gray-400">無明細行</p>:(
                <table className="w-full text-sm"><thead><tr className="text-gray-400 text-xs border-b border-gray-100">
                  <th className="py-2 text-left">品名</th><th className="py-2 text-right">需求量</th><th className="py-2 text-right">配貨量</th><th className="py-2 text-right">單價</th><th className="py-2 text-right">金額</th>
                </tr></thead><tbody>{ol.map(l => {
                  const qty = Number(l.product_uom_qty||0);
                  const allocated = l.qty_delivered != null ? Number(l.qty_delivered) : qty;
                  const price = Number(l.price_unit||0);
                  const amount = allocated * price;
                  const isEditing = editingLine === l.id;
                  return (<tr key={l.id} className="border-b border-gray-50">
                    <td className="py-2 font-medium">{l.name||'—'}</td>
                    <td className="py-2 text-right text-gray-400">{qty.toFixed(1)}</td>
                    <td className="py-2 text-right">
                      {isEditing ? (
                        <input type="number" defaultValue={allocated} step="0.5" min="0" autoFocus className="w-16 text-right py-0.5 px-1 border border-gray-300 rounded text-sm"
                          onBlur={e => updateLineQty(l.id, Number(e.target.value))} onKeyDown={e => { if(e.key==='Enter') updateLineQty(l.id, Number((e.target as HTMLInputElement).value)); if(e.key==='Escape') setEditingLine(null); }} />
                      ) : (
                        <span className={`cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded ${allocated !== qty ? 'text-orange-600 font-bold' : ''}`}
                          onClick={e => { e.stopPropagation(); setEditingLine(l.id); }}>{allocated.toFixed(1)}</span>
                      )}
                    </td>
                    <td className="py-2 text-right">${price.toLocaleString()}</td>
                    <td className="py-2 text-right font-bold text-primary">{amount > 0 ? `$${Math.round(amount).toLocaleString()}` : '—'}</td>
                  </tr>);
                })}</tbody></table>
              )}
              {(isDraft(o) || o.state === 'sent') && <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                <button onClick={()=>setConfirm({id:o.id,action:'sale'})} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">確認訂單</button>
                <button onClick={()=>setConfirm({id:o.id,action:'cancel'})} className="px-4 py-2 bg-gray-100 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">取消訂單</button>
              </div>}
            </div>}
          </div>);
        })}</div>}
      </div>
      </div>
      <ConfirmDialog open={!!confirm} title={confirm?.action==='sale'?`確認訂單 ${co?.name||''}？`:`取消訂單 ${co?.name||''}？`}
        message={confirm?.action==='sale'?'確認後訂單將進入已確認狀態。':'取消後訂單將被標記為已取消。'}
        confirmText={confirm?.action==='sale'?'確認':'取消訂單'} variant={confirm?.action==='cancel'?'danger':'info'}
        onConfirm={doAction} onCancel={()=>setConfirm(null)} />
    </div>
  );
}
'''
