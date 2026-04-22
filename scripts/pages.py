"""Admin pages — 所有後台頁面（v5+v6 合併）"""

_ARROW = '''const Arrow = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>;'''

def dashboard() -> str:
    return r'''import { useNavigate, useLocation } from 'react-router-dom';
import { useData } from '../../data/DataProvider';
import DatePickerWithCounts from '../../components/DatePickerWithCounts';
const LeafIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 1a13 13 0 0 1 .8 13c-1 1.8-2 3.1-3.8 4.5"/><path d="M5 20c.5-1 1.4-3 2-4.5"/></svg>;
const ClipboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>;
const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
type TabKey = 'daily' | 'settings';
export default function DashboardPage() {
  const nav = useNavigate();
  const { orders, orderLines, loading, selectedDate, setSelectedDate } = useData();
  const loc = useLocation();
  const tab: TabKey = loc.pathname.startsWith('/admin/settings') ? 'settings' : 'daily';
  const setTab = (t: TabKey) => { nav(t === 'daily' ? '/admin/daily' : '/admin/settings'); };
  const isDraft = (o:any) => !o.state || o.state === 'draft';
  const isConfirmed = (o:any) => o.state === 'sale' || o.state === 'confirm';
  const dateIds = new Set(orderLines.filter((l:any) => String(l.delivery_date||'').slice(0,10) === selectedDate).map((l:any) => { const v = l.order_id; return Array.isArray(v) ? String(v[0]) : String(v||''); }));
  const cd = () => orders.filter(o => isDraft(o) && dateIds.has(String(o.id))).length;
  const cs = () => orders.filter(o => isConfirmed(o) && dateIds.has(String(o.id))).length;
  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">載入中...</p></div>;
  const steps = [
    {step:'1',label:'訂單接收',desc:`${cd()} 筆待處理`,href:'/admin/daily/purchase-list',count:cd()},
    {step:'2',label:'採購定價',desc:'管理採購',href:'/admin/daily/procurement',count:0},
    {step:'3',label:'庫存總表',desc:'查看庫存',href:'/admin/daily/stock',count:0},
    {step:'4',label:'銷貨單',desc:`${cs()} 筆已確認`,href:'/admin/daily/sales-orders',count:cs()},
    {step:'5',label:'配送管理',desc:'出貨追蹤',href:'/admin/daily/delivery',count:0},
  ];
  const settingsGroups: {title:string; items:{label:string;desc:string;href:string;disabled?:boolean}[]}[] = [
    {title:'商品設定', items:[
      {label:'產品管理', desc:'編輯產品分類', href:'/admin/settings/products'},
      {label:'產品分類管理', desc:'新增/修改分類', href:'/admin/settings/product-categories'},
      {label:'分類-買辦人對應', desc:'每個分類由誰買', href:'/admin/settings/category-buyer'},
    ]},
    {title:'關係對應', items:[
      {label:'供應商-產品對應', desc:'品項誰家供', href:'/admin/settings/supplier-mapping'},
      {label:'司機-客戶對應', desc:'誰送哪些客戶', href:'/admin/settings/driver-mapping'},
    ]},
    {title:'系統', items:[
      {label:'系統設定', desc:'假日、截止時間', href:'/admin/settings/system'},
    ]},
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
      <div className="px-6 pt-6 max-w-6xl mx-auto">
        <div style={{display:'flex', gap:4, borderBottom:'1px solid #e5e7eb'}}>
          {([['daily', '每日流程', <ClipboardIcon key="d"/>], ['settings', '基礎設定', <SettingsIcon key="s"/>]] as const).map(([k, lbl, icon]) => {
            const active = tab === k;
            const st: React.CSSProperties = {
              padding: '10px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              borderTopLeftRadius: 8, borderTopRightRadius: 8, marginBottom: -1,
              background: active ? '#ffffff' : '#f3f4f6',
              color: active ? '#111827' : '#6b7280',
              borderTop: active ? '3px solid #16a34a' : '3px solid transparent',
              borderLeft: '1px solid #e5e7eb',
              borderRight: '1px solid #e5e7eb',
              borderBottom: active ? '1px solid #ffffff' : '1px solid #e5e7eb',
            };
            return <button key={k} onClick={()=>setTab(k as TabKey)} style={st}>
              <span style={{display:'inline-flex', alignItems:'center', gap:6}}>{icon}{lbl}</span>
            </button>;
          })}
        </div>
      </div>
      {tab==='daily' && (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[{l:'全部訂單',v:orders.filter(o=>dateIds.has(String(o.id))).length,c:'text-gray-900'},{l:'待處理',v:cd(),c:'text-orange-600'},{l:'已確認',v:cs(),c:'text-blue-600'},{l:'完成',v:orders.filter(o=>o.state==='done'&&dateIds.has(String(o.id))).length,c:'text-green-600'},{l:'已取消',v:orders.filter(o=>o.state==='cancel'&&dateIds.has(String(o.id))).length,c:'text-red-600'}].map(s=>(
              <div key={s.l} className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-sm text-gray-400">{s.l}</p><p className={`text-3xl font-bold ${s.c}`}>{s.v}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h2 className="font-bold text-gray-900 mb-4">{selectedDate} 作業流程</h2>
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
      )}
      {tab==='settings' && (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
          {settingsGroups.map(g => (
            <section key={g.title}>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{g.title}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {g.items.map(it => (
                  <button key={it.href} onClick={()=>!it.disabled&&nav(it.href)} disabled={it.disabled} className={`rounded-xl border border-gray-100 bg-white p-4 text-left transition-colors ${it.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}>
                    <p className="font-semibold text-gray-800">{it.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{it.desc}</p>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
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
          <button onClick={()=>nav('/admin/daily')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"><Arrow/></button>
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
      const dateIds = new Set(lines.filter((l:any) => String(l.delivery_date||'').slice(0,10) === selectedDate).map((l:any) => { const v = l.order_id; return Array.isArray(v) ? String(v[0]) : String(v||''); }));
      setOrders(allOrders.filter((x:any)=>['sale','done'].includes(x.state) && dateIds.has(String(x.id))));
    }
  }, [allOrders, lines, loading, selectedDate]);

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
          <button onClick={()=>nav('/admin/daily')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg bg-transparent hover:bg-gray-100 transition-colors border-none"><Arrow/></button>
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
                          <select value={driverEmpId||''} onChange={e=>assignDriver(o.id,e.target.value)} disabled={isSavingThis||o.state==='done'}
                            className={`text-xs px-2 pr-8 py-1 border rounded transition-colors ${driverEmp ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-400'}`}>
                            <option value="">-- 選擇負責人 --</option>
                            {employees.map(emp=>(<option key={emp.id} value={emp.id}>{emp.name}{emp.job_title?` (${emp.job_title})`:''}</option>))}
                          </select>
                          {isSavingThis && <span className="text-xs text-gray-400">儲存中...</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                        {o.state==='sale'&&(()=>{
                          const canDone = !!driverEmpId && !!addr;
                          const tip = !driverEmpId ? '請先選擇配送負責人' : !addr ? '請先設定送貨地址' : '';
                          return (
                            <button onClick={()=>canDone?setConfirm({id:o.id,action:'done'}):null}
                              disabled={!canDone} title={tip}
                              className={`px-3 py-1 rounded text-xs transition-colors flex items-center gap-1 ${canDone?'bg-primary text-white hover:bg-green-700 cursor-pointer':'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                              <CheckCircleIcon /> 完成配送
                            </button>
                          );
                        })()}
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

''' + _ARROW + r'''
const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>;
const PricingIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const PackageIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>;

interface PricingItem {
  productId: string; productName: string; code: string;
  supplierId: string; supplierName: string;
  estimatedQty: number; actualQty: number;
  purchasePrice: number; sellingPrice: number;
  state: 'pending' | 'priced' | 'stocked';
}

export default function ProcurementPage() {
  const nav = useNavigate();
  const { orderLines, products, supplierInfos, suppliers, stockQuants, stockLocations, productProducts, loading, selectedDate, setSelectedDate } = useData();
  const [items, setItems] = useState<PricingItem[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [priceLogs, setPriceLogs] = useState<any[]>([]);

  const PRICE_LOG_UUID = '390d4f0b-9a2b-4131-a35b-67fce21286be';

  // template UUID → product_products UUID（proxy 回傳的 product_id 是 template UUID）
  const _qn = (v: any) => Array.isArray(v) ? String(v[0]) : String(v || '');
  const tmplToPp = useMemo(() => {
    const m: Record<string, string> = {};
    for (const pp of productProducts) {
      const tmplId = _qn(pp.product_tmpl_id);
      if (tmplId && pp.id) m[tmplId] = String(pp.id);
    }
    return m;
  }, [productProducts]);

  // 載入全部 price log（不篩日期），讓 logMap 拿最新一筆當預設值
  useEffect(() => {
    db.queryCustom(PRICE_LOG_UUID).then(rows => setPriceLogs(
      (Array.isArray(rows) ? rows : [])
        .map((r: any) => r.data ? { ...r.data, id: r.id, updated_at: r.data.updated_at || r.updated_at } : r)
    )).catch(() => {});
  }, []);

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

    // 最新一筆 log（跨所有日期）→ 定價預設值
    const logMap: Record<string, any> = {};
    // 選定日期的 log → qty_delivered 初始值（有日期語意，不同於 stock_quants 累計量）
    const todayLogMap: Record<string, any> = {};
    for (const rec of priceLogs) {
      const pid = String(rec.product_product_id || '');
      if (!pid) continue;
      if (!logMap[pid] || (rec.updated_at || '') > (logMap[pid].updated_at || '')) logMap[pid] = rec;
      if (String(rec.effective_date || '').slice(0, 10) === selectedDate) {
        if (!todayLogMap[pid] || (rec.updated_at || '') > (todayLogMap[pid].updated_at || '')) todayLogMap[pid] = rec;
      }
    }

    const itemMap = new Map<string, PricingItem>();
    for (const l of orderLines) {
      if (typeof l.delivery_date === 'string' && l.delivery_date.slice(0, 10) !== selectedDate) continue;
      const rawId = _qn(l.product_id) || _qn(l.product_template_id);
      if (!rawId) continue;
      // rawId 可能是 template UUID，轉為 product_products UUID 才能對應 price log 和 stock
      const pid = tmplToPp[rawId] || rawId;
      const prod = prodMap[rawId] || prodMap[pid];  // template UUID 查產品名
      const supId = prodSup[_qn(l.product_template_id) || rawId] || (supplierInfos.length === 0 ? defaultSupId : 'unknown');
      const existing = itemMap.get(pid);
      if (existing) { existing.estimatedQty += Number(l.product_uom_qty || 0); }
      else {
        const log = logMap[pid];
        const sellingPrice  = Number(log?.lst_price || 0);
        const purchasePrice = sellingPrice > 0 ? Math.round(sellingPrice / 1.3 * 100) / 100 : 0;
        // 實際量：優先取當日 price log 的 qty_delivered（有日期語意），否則用估計量
        const todayLog = todayLogMap[pid];
        const actualQty = todayLog?.qty_delivered != null ? Number(todayLog.qty_delivered) : Number(l.product_uom_qty || 0);
        itemMap.set(pid, { productId: pid, productName: prod?.name || l.name || '—', code: prod?.default_code || '', supplierId: supId, supplierName: suppliers[supId]?.name || '未指定供應商', estimatedQty: Number(l.product_uom_qty || 0), actualQty, purchasePrice, sellingPrice, state: log ? 'priced' : 'pending' });
      }
    }
    setItems(Array.from(itemMap.values()));
    setExpanded([...new Set(Array.from(itemMap.values()).map(i => i.supplierId))]);
  }, [loading, olKey, prKey, selectedDate, priceLogs, tmplToPp]);

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
      if (field === 'sellingPrice') {
        updated.purchasePrice = value > 0 ? Math.round(value / 1.3 * 100) / 100 : 0;
      }
      return updated;
    }));
  };

  // order_id 可能是 [uuid, name] 或純字串
  const _oid = (val: any): string => Array.isArray(val) ? String(val[0]) : String(val ?? '');


  // 取得內部庫位 ID：先從 state 找，找不到就 fresh fetch，再找不到就自動建立
  const _getLocId = async (): Promise<string> => {
    let locId = stockLocations.find((l:any) => l.usage === 'internal')?.id || stockLocations[0]?.id;
    if (!locId) {
      const fresh: any[] = await db.query('stock_locations').catch(() => []);
      locId = fresh.find((l:any) => l.usage === 'internal')?.id || fresh[0]?.id;
    }
    if (!locId) {
      const created = await db.insert('stock_locations', { name: 'WH/Stock', usage: 'internal', active: true });
      locId = created?.id;
    }
    return locId || '';
  };

  // 累加庫存（stock_quants 是累計量，每次進貨 ADD）
  const _upsertQuant = async (pid: string, qty: number, locId: string, _qid: (v:any)=>string): Promise<void> => {
    let sq = stockQuants.find((q:any) => _qid(q.product_id) === pid);
    if (!sq) {
      const fresh: any[] = await db.queryFiltered('stock_quants', [{column:'product_id',op:'eq',value:pid}]).catch(() => []);
      sq = fresh[0];
    }
    if (sq) {
      await db.update('stock_quants', sq.id, { quantity: Number(sq.quantity||0) + qty });
    } else {
      await db.insert('stock_quants', { product_id: pid, location_id: locId, quantity: qty });
    }
  };

  const applyPricing = async (pid: string) => {
    const item = items.find(i => i.productId === pid);
    if (!item || item.sellingPrice <= 0) return;
    setSaving(true);
    const stdPrice = Math.round(item.sellingPrice / 1.3 * 100) / 100;
    const _qid = (v: any) => Array.isArray(v) ? String(v[0]) : String(v || '');
    try {
      // 寫入價格稽核 log（含當日實際進貨量）
      await db.insertCustom(PRICE_LOG_UUID, { product_product_id: pid, lst_price: item.sellingPrice, standard_price: stdPrice, effective_date: selectedDate, qty_delivered: item.actualQty });
      // 同步選定日期配送的訂單明細售價（l.product_id 可能是 template UUID，需比對後轉換）
      const matchingLines = orderLines.filter((l: any) => {
        const lineRaw = _qid(l.product_id) || _qid(l.product_template_id);
        return (tmplToPp[lineRaw] || lineRaw) === pid &&
          typeof l.delivery_date === 'string' && l.delivery_date.slice(0, 10) === selectedDate;
      });
      await Promise.all(matchingLines.map((l: any) => db.update('sale_order_lines', l.id, { price_unit: item.sellingPrice })));
      // 重算受影響訂單的總金額
      await db.recalcOrderTotal(matchingLines.map((l: any) => _oid(l.order_id)));
      setItems(prev => prev.map(i => i.productId === pid ? {...i, state: 'priced'} : i));
    } catch(e: any) { console.error('定價失敗:', e.message); }
    // 庫存更新獨立 try/catch，不受定價寫入失敗影響
    try {
      if (item.actualQty > 0) {
        const locId = await _getLocId();
        if (locId) { await _upsertQuant(pid, item.actualQty, locId, _qid); }
        else { console.warn('[stock] 無法取得庫位，跳過庫存更新'); }
      }
    } catch(e: any) { console.error('庫存更新失敗:', e.message); }
    setSaving(false);
  };

  const applyAll = async () => {
    const priceable = items.filter(i => i.sellingPrice > 0);
    if (priceable.length === 0) return;
    setSaving(true);
    const allAffectedOrderIds: string[] = [];
    const _qid = (v: any) => Array.isArray(v) ? String(v[0]) : String(v || '');
    const locId = await _getLocId();
    for (const item of priceable) {
      const stdPrice = Math.round(item.sellingPrice / 1.3 * 100) / 100;
      try {
        // 寫入價格稽核 log（含當日實際進貨量）
        await db.insertCustom(PRICE_LOG_UUID, { product_product_id: item.productId, lst_price: item.sellingPrice, standard_price: stdPrice, effective_date: selectedDate, qty_delivered: item.actualQty });
        // 同步選定日期配送的訂單明細售價（l.product_id 可能是 template UUID）
        const matchingLines = orderLines.filter((l: any) => {
          const lineRaw = _qid(l.product_id) || _qid(l.product_template_id);
          return (tmplToPp[lineRaw] || lineRaw) === item.productId &&
            typeof l.delivery_date === 'string' && l.delivery_date.slice(0, 10) === selectedDate;
        });
        await Promise.all(matchingLines.map((l: any) => db.update('sale_order_lines', l.id, { price_unit: item.sellingPrice })));
        allAffectedOrderIds.push(...matchingLines.map((l: any) => _oid(l.order_id)));
        if (item.actualQty > 0 && locId) { await _upsertQuant(item.productId, item.actualQty, locId, _qid); }
        setItems(prev => prev.map(i => i.productId === item.productId ? {...i, state: 'priced'} : i));
      } catch(e) { console.error(e); }
    }
    // 所有品項更新完後，一次重算所有受影響訂單的總金額
    await db.recalcOrderTotal(allAffectedOrderIds);
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
          <button onClick={()=>nav('/admin/daily')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg bg-transparent hover:bg-gray-100 transition-colors border-none"><Arrow/></button>
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
            <button onClick={()=>nav('/admin/daily/purchase-list')} className="text-primary hover:underline text-sm mt-2">先去查看訂單接收 →</button>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(groups.entries()).map(([sid, groupItems]) => {
              const sup = suppliers[sid];
              const isOpen = expanded.includes(sid);
              const groupPriced = groupItems.filter(i => i.state === 'priced').length;
              const groupTotal = groupItems.reduce((s, i) => s + i.sellingPrice * i.actualQty, 0);
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
                          <th className="py-2 px-3 text-right font-medium w-24">售價</th>
                          <th className="py-2 px-3 text-right font-medium w-20">成本</th>
                          <th className="py-2 px-3 text-right font-medium w-24">小計</th>
                          <th className="py-2 px-3 text-center font-medium w-20">操作</th>
                        </tr></thead>
                        <tbody>
                          {groupItems.map(item => {
                            const subtotal = item.sellingPrice * item.actualQty;
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
                                  <input type="number" value={item.sellingPrice || ''} step="1" min="0" placeholder="$"
                                    onChange={e => updateItem(item.productId, 'sellingPrice', Number(e.target.value))}
                                    className="w-20 text-right py-1 px-1.5 border border-gray-200 rounded text-sm" />
                                </td>
                                <td className="py-2 px-3 text-right text-gray-400 text-sm">
                                  {item.purchasePrice > 0 ? `$${item.purchasePrice.toFixed(0)}` : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-medium">
                                  {subtotal > 0 ? `$${Math.round(subtotal).toLocaleString()}` : '—'}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <button onClick={() => applyPricing(item.productId)} disabled={item.sellingPrice <= 0 || saving}
                                    className={`px-2 py-1 rounded text-xs transition-colors flex items-center justify-center gap-1 ${item.sellingPrice <= 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : isPriced ? 'bg-green-50 text-green-700 border border-green-300 hover:bg-green-100' : 'bg-primary text-white hover:bg-green-700'}`}>
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
  draft:{label:'已接收',color:'#92400e',bg:'#fef3c7'},sent:{label:'已送出',color:'#1e40af',bg:'#dbeafe'},
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
        const pid = l.product_id || l.product_template_id; const req = Number(l.product_uom_qty||0);
        const avail = stockMap[pid] || 0;
        if (avail < req) { oversold = true; msg += `[${l.name||'商品'}] 庫存不足 (需 ${req}, 餘 ${avail})\n`; }
      }
      if (oversold) { alert(msg + '請先補足庫存再確認訂單。'); setConfirm(null); return; }
      
      try {
        for (const l of ol) {
          const pid = l.product_id || l.product_template_id; let req = Number(l.product_uom_qty||0);
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
      const ordLine = lines.find(l => l.id === lineId);
      if (ordLine) {
        const oid = Array.isArray(ordLine.order_id) ? String(ordLine.order_id[0]) : String(ordLine.order_id || '');
        await db.recalcOrderTotal([oid]);
      }
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
          const pid = l.product_id || l.product_template_id;
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

  const isDraft = (o:any) => !o.state || o.state === 'draft';
  const dateIds = useMemo(() =>
    new Set(lines.filter((l:any) => String(l.delivery_date||'').slice(0,10) === selectedDate).map((l:any) => { const v = l.order_id; return Array.isArray(v) ? String(v[0]) : String(v||''); })),
    [lines, selectedDate]
  );
  const filtered = orders.filter(o => {
    if (filter !== 'all') {
      if (filter === 'draft' ? !isDraft(o) : o.state !== filter) return false;
    }
    if (!dateIds.has(String(o.id))) return false;
    if (search) { const s = search.toLowerCase(); if (!(custs[o.customer_id]?.name||'').toLowerCase().includes(s) && !(o.name||'').toLowerCase().includes(s)) return false; }
    return true;
  });
  const co = confirm ? orders.find(o => o.id===confirm.id) : null;
  const draftSelected = [...selectedOrders].filter(id => orders.find(o => o.id===id)?.state === 'draft').length;

  return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column',overflow:'hidden',background:'#f9fafb'}}>
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center" style={{flexShrink:0}}>
        <div className="flex items-center gap-3">
          <button onClick={()=>nav('/admin/daily')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg bg-transparent hover:bg-gray-100 transition-colors border-none"><Arrow/></button>
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


def products_page() -> str:
    return r'''import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';
type Tmpl = { id:string; name:string; default_code:string; categ_id:any };
type Cat = { id:string; name:string };
const resolveId = (raw:any): string => {
  if (raw === null || raw === undefined || raw === false) return '';
  if (Array.isArray(raw)) return String(raw[0] ?? '');
  if (typeof raw === 'object' && raw !== null && 'id' in raw) return String((raw as any).id ?? '');
  return String(raw);
};
const resolveName = (raw:any) => Array.isArray(raw) && raw.length >= 2 ? String(raw[1]) : '';
export default function ProductsPage() {
  const nav = useNavigate();
  const [tmpls, setTmpls] = useState<Tmpl[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string|null>(null);
  const [editCat, setEditCat] = useState('');
  const [saving, setSaving] = useState(false);
  const load = async () => {
    setLoading(true); setError('');
    try {
      const [ts, cs] = await Promise.all([
        db.queryFiltered('product_templates', [{column:'active',op:'eq',value:true}]),
        db.query('product_categories'),
      ]);
      setTmpls((ts||[]).map((r:any)=>({id:String(r.id), name:String(r.name||''), default_code:String(r.default_code||''), categ_id:r.categ_id})));
      setCats((cs||[]).map((r:any)=>({id:String(r.id), name:String(r.name||'')})));
    } catch(e:any) { setError(e?.message||'載入失敗'); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, []);
  // 當 editId 或 tmpls 改變時，重算 editCat，避免 stale state
  useEffect(() => {
    if (!editId) return;
    const p = tmpls.find(x => x.id === editId);
    setEditCat(p ? resolveId(p.categ_id) : '');
  }, [editId, tmpls]);
  const filtered = useMemo(()=>{
    const kw = search.trim().toLowerCase();
    const sorted = [...tmpls].sort((a,b)=>a.name.localeCompare(b.name, 'zh-Hant'));
    if (!kw) return sorted;
    return sorted.filter(p => p.name.toLowerCase().includes(kw) || p.default_code.toLowerCase().includes(kw) || resolveName(p.categ_id).toLowerCase().includes(kw));
  }, [tmpls, search]);
  const save = async (id:string) => {
    setSaving(true);
    try {
      await db.update('product_templates', id, {categ_id: editCat || false});
      await load();
      setEditId(null); setEditCat('');
    } catch(e:any) { alert(e?.message||'儲存失敗'); } finally { setSaving(false); }
  };
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3 max-w-6xl mx-auto">
          <button onClick={()=>nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
          <h1 className="text-xl font-bold text-gray-900">產品管理</h1>
        </div>
      </header>
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋品名、編碼或分類" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white" />
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>}
        {!loading && (
          <details className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-gray-700">
            <summary className="cursor-pointer font-semibold text-yellow-800">🔍 診斷資訊（debug）</summary>
            <div className="mt-2 space-y-1 font-mono">
              <p><strong>cats.length:</strong> {cats.length}</p>
              <p><strong>cats 前 5 筆:</strong> {JSON.stringify(cats.slice(0,5))}</p>
              <p><strong>tmpls 前 3 筆的 categ_id raw:</strong></p>
              <ul className="pl-4">
                {tmpls.slice(0,3).map(t => (
                  <li key={t.id}>
                    #{t.id} {t.name} → raw: <code>{JSON.stringify(t.categ_id)}</code>, resolveId = <code>"{resolveId(t.categ_id)}"</code>, in cats? <strong>{cats.some(c => c.id === resolveId(t.categ_id)) ? '✓' : '✗'}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
        {loading ? <p className="text-gray-400 text-center py-12">載入中...</p> :
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {filtered.length===0 ? <div className="text-center text-gray-400 py-12">無產品</div> :
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs"><tr>
              <th className="px-4 py-3 text-left">編碼</th><th className="px-4 py-3 text-left">品名</th>
              <th className="px-4 py-3 text-left">分類</th><th className="px-4 py-3 text-right">操作</th>
            </tr></thead>
            <tbody>{filtered.map(p => (
              <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-500">{p.default_code || '—'}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                <td className="px-4 py-3">
                  {editId===p.id ?
                    <select value={editCat} onChange={e=>setEditCat(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-sm bg-white">
                      <option value="">（不設定）</option>
                      {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      {editCat && !cats.some(c => c.id === editCat) && (
                        <option value={editCat}>（原值 #{editCat}：{resolveName(p.categ_id) || '未知分類'}）</option>
                      )}
                    </select>
                  : <span className="text-gray-700">{resolveName(p.categ_id) || '—'}</span>}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  {editId===p.id ?
                    <>
                      <button onClick={()=>save(p.id)} disabled={saving} className="px-2 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50">{saving?'儲存中':'儲存'}</button>
                      <button onClick={()=>{setEditId(null); setEditCat('');}} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">取消</button>
                    </>
                  : <button onClick={()=>{setEditId(p.id); setEditCat(resolveId(p.categ_id));}} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">編輯分類</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>}
        </div>}
      </div>
    </div>
  );
}
'''


def product_categories_page() -> str:
    return r'''import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';
type Cat = { id:string; name:string; parent_id:any };
const resolveId = (raw:any) => Array.isArray(raw) ? String(raw[0]||'') : String(raw||'');
export default function ProductCategoriesPage() {
  const nav = useNavigate();
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParent, setNewParent] = useState('');
  const [editId, setEditId] = useState<string|null>(null);
  const [editName, setEditName] = useState('');
  const [editParent, setEditParent] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true); setErr('');
    try {
      const rows = await db.query('product_categories');
      setCats((rows||[]).map((r:any)=>({id:String(r.id), name:String(r.name||''), parent_id:r.parent_id})).sort((a,b)=>a.name.localeCompare(b.name, 'zh-Hant')));
    } catch(e:any) { setErr(e?.message||'載入失敗'); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, []);
  const add = async () => {
    if (!newName.trim()) { alert('請輸入分類名稱'); return; }
    setBusy(true);
    try {
      const payload: any = {name: newName.trim()};
      if (newParent) payload.parent_id = newParent;
      await db.insert('product_categories', payload);
      setNewName(''); setNewParent(''); setShowForm(false);
      await load();
    } catch(e:any) { alert(e?.message||'新增失敗'); } finally { setBusy(false); }
  };
  const save = async (id:string) => {
    if (!editName.trim()) { alert('請輸入分類名稱'); return; }
    setBusy(true);
    try {
      await db.update('product_categories', id, {name: editName.trim(), parent_id: editParent || false});
      setEditId(null);
      await load();
    } catch(e:any) { alert(e?.message||'儲存失敗'); } finally { setBusy(false); }
  };
  const del = async (id:string) => {
    if (!confirm('確定刪除？仍有產品使用時可能失敗。')) return;
    try { await db.deleteRow('product_categories', id); await load(); }
    catch(e:any) { alert(e?.message||'刪除失敗，可能仍有產品使用此分類'); }
  };
  const pname = (pid:string) => pid ? (cats.find(c=>c.id===pid)?.name || pid) : '—';
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={()=>nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
            <h1 className="text-xl font-bold text-gray-900">產品分類管理</h1>
          </div>
          <button onClick={()=>setShowForm(v=>!v)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ 新增分類</button>
        </div>
      </header>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        {err && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{err}</div>}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <p className="font-medium text-gray-700">新增分類</p>
            <div className="flex gap-3 flex-wrap">
              <input type="text" placeholder="分類名稱" value={newName} onChange={e=>setNewName(e.target.value)} className="border border-gray-200 rounded px-3 py-1.5 text-sm flex-1 min-w-40" />
              <select value={newParent} onChange={e=>setNewParent(e.target.value)} className="border border-gray-200 rounded px-3 py-1.5 text-sm bg-white min-w-40">
                <option value="">（無上層分類）</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={add} disabled={busy} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">確認新增</button>
              <button onClick={()=>setShowForm(false)} className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">取消</button>
            </div>
          </div>
        )}
        {loading ? <p className="text-gray-400 text-center py-12">載入中...</p> :
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {cats.length===0 ? <div className="text-center text-gray-400 py-12">尚無分類資料</div> :
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs"><tr>
              <th className="px-4 py-3 text-left">ID</th><th className="px-4 py-3 text-left">分類名稱</th>
              <th className="px-4 py-3 text-left">上層分類</th><th className="px-4 py-3 text-right">操作</th>
            </tr></thead>
            <tbody>{cats.map(c => (
              <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-400">{c.id}</td>
                <td className="px-4 py-3 font-medium text-gray-800">
                  {editId===c.id ? <input type="text" value={editName} onChange={e=>setEditName(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-sm w-full" /> : c.name}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {editId===c.id ?
                    <select value={editParent} onChange={e=>setEditParent(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-sm bg-white">
                      <option value="">（無上層分類）</option>
                      {cats.filter(x=>x.id!==c.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  : pname(resolveId(c.parent_id))}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  {editId===c.id ?
                    <>
                      <button onClick={()=>save(c.id)} disabled={busy} className="px-2 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50">儲存</button>
                      <button onClick={()=>setEditId(null)} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">取消</button>
                    </>
                  : <>
                      <button onClick={()=>{setEditId(c.id); setEditName(c.name); setEditParent(resolveId(c.parent_id));}} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">編輯</button>
                      <button onClick={()=>del(c.id)} className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">刪除</button>
                    </>}
                </td>
              </tr>
            ))}</tbody>
          </table>}
        </div>}
      </div>
    </div>
  );
}
'''


def category_buyer_page() -> str:
    return r'''import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';
type Mapping = { id:string; category_id:string; employee_id:string };
type Cat = { id:string; name:string };
type Emp = { id:string; name:string };
export default function CategoryBuyerPage() {
  const nav = useNavigate();
  const [maps, setMaps] = useState<Mapping[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [catId, setCatId] = useState('');
  const [empId, setEmpId] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true); setErr('');
    try {
      const [rawMaps, rawCats, rawEmps] = await Promise.all([
        db.queryCustom('x_category_buyer'),
        db.query('product_categories'),
        db.queryFiltered('hr_employees', [{column:'active',op:'eq',value:true}]),
      ]);
      const ms: Mapping[] = (rawMaps||[]).map((r:any) => {
        const d = r.data || r;
        // AI GO 建此 table 時把底線壓掉（實際欄位 categoryid / employeeid）
        return {id:String(r.id||d.id||''), category_id:String(d.categoryid||d.category_id||''), employee_id:String(d.employeeid||d.employee_id||'')};
      });
      setMaps(ms);
      setCats((rawCats||[]).map((r:any)=>({id:String(r.id), name:String(r.name||'')})));
      setEmps((rawEmps||[]).map((r:any)=>({id:String(r.id), name:String(r.name||'')})));
    } catch(e:any) { setErr(e?.message||'載入失敗'); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, []);
  const catName = (id:string) => cats.find(c=>c.id===id)?.name || id;
  const empName = (id:string) => emps.find(e=>e.id===id)?.name || id;
  const add = async () => {
    if (!catId || !empId) { alert('請選擇分類與買辦人'); return; }
    setBusy(true);
    try {
      await db.insertCustom('x_category_buyer', {
        categoryid: catId, employeeid: empId,
        createdat: new Date().toISOString(),
      });
      setCatId(''); setEmpId(''); setShowForm(false);
      await load();
    } catch(e:any) { alert(e?.message||'新增失敗'); } finally { setBusy(false); }
  };
  const del = async (id:string) => {
    if (!confirm('確定刪除此對應？')) return;
    try { await db.deleteCustom(id); await load(); }
    catch(e:any) { alert(e?.message||'刪除失敗'); }
  };
  const grouped = useMemo(() => {
    const m = new Map<string, Mapping[]>();
    maps.forEach(x => { const arr = m.get(x.employee_id)||[]; arr.push(x); m.set(x.employee_id, arr); });
    return Array.from(m.entries()).sort(([a],[b]) => empName(a).localeCompare(empName(b), 'zh-Hant'));
  }, [maps, emps]);
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={()=>nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
            <h1 className="text-xl font-bold text-gray-900">分類-買辦人對應</h1>
          </div>
          <button onClick={()=>setShowForm(v=>!v)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ 新增對應</button>
        </div>
      </header>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        {err && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{err}</div>}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <p className="font-medium text-gray-700">新增對應</p>
            <div className="flex gap-3 flex-wrap">
              <select value={catId} onChange={e=>setCatId(e.target.value)} className="border border-gray-200 rounded px-3 py-1.5 text-sm bg-white flex-1 min-w-48">
                <option value="">選擇分類...</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={empId} onChange={e=>setEmpId(e.target.value)} className="border border-gray-200 rounded px-3 py-1.5 text-sm bg-white flex-1 min-w-48">
                <option value="">選擇買辦人（員工）...</option>
                {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <button onClick={add} disabled={busy} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">確認新增</button>
              <button onClick={()=>setShowForm(false)} className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">取消</button>
            </div>
          </div>
        )}
        {loading ? <p className="text-gray-400 text-center py-12">載入中...</p> :
          maps.length===0 ?
            <div className="bg-white rounded-xl border border-gray-100 text-center text-gray-400 py-12">尚無分類-買辦人對應資料</div>
          :
            <div className="space-y-4">
              {grouped.map(([eid, items]) => (
                <section key={eid} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <header className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
                    <p className="font-semibold text-gray-800">{empName(eid)}</p>
                    <p className="text-xs text-gray-400">負責 {items.length} 個分類</p>
                  </header>
                  <ul className="divide-y divide-gray-50">
                    {items.map(m => (
                      <li key={m.id} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-800">{catName(m.category_id)}</span>
                        <button onClick={()=>del(m.id)} className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">刪除</button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
        }
      </div>
    </div>
  );
}
'''


def settings_page() -> str:
    return r'''import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';
type Holiday = { id:string; date:string; label:string };
type CutoffSetting = { id:string; value:string } | null;
const KEY_CUTOFF = 'order_cutoff_time';
export default function SettingsPage() {
  const nav = useNavigate();
  const [cutoff, setCutoff] = useState<CutoffSetting>(null);
  const [cutoffTime, setCutoffTime] = useState('14:00');
  const [cutoffBusy, setCutoffBusy] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newDate, setNewDate] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const load = async () => {
    setLoading(true); setErr('');
    try {
      const [rawSettings, rawHols] = await Promise.all([
        db.queryCustom('x_app_settings'),
        db.queryCustom('x_holiday_settings'),
      ]);
      const cu = (rawSettings||[]).find((r:any) => (r.data?.key || r.key) === KEY_CUTOFF);
      if (cu) { const d = cu.data || cu; setCutoff({id:String(cu.id||d.id), value:String(d.value||'14:00')}); setCutoffTime(String(d.value||'14:00')); }
      const today = new Date().toISOString().slice(0,10);
      const hs: Holiday[] = (rawHols||[]).map((r:any) => { const d = r.data||r; return {id:String(r.id||d.id), date:String(d.date||''), label:String(d.label||d.reason||'假日')}; })
        .filter(h => h.date && h.date >= today)
        .sort((a,b) => a.date.localeCompare(b.date));
      setHolidays(hs);
    } catch(e:any) { setErr(e?.message||'載入失敗'); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, []);
  const saveCutoff = async () => {
    setCutoffBusy(true);
    try {
      const now = new Date().toISOString();
      if (cutoff) {
        await db.updateCustom(cutoff.id, {key: KEY_CUTOFF, value: cutoffTime, updated_at: now});
      } else {
        const created = await db.insertCustom('x_app_settings', {key: KEY_CUTOFF, value: cutoffTime, updated_at: now});
        setCutoff({id: String(created?.id || ''), value: cutoffTime});
      }
      alert(`已儲存：${cutoffTime}`);
    } catch(e:any) { alert(e?.message||'儲存失敗'); } finally { setCutoffBusy(false); }
  };
  const addHoliday = async () => {
    if (!newDate) { alert('請選擇日期'); return; }
    setBusy(true);
    try {
      // x_holiday_settings 的欄位是 date / reason
      await db.insertCustom('x_holiday_settings', {date: newDate, reason: newLabel.trim()||'假日'});
      setNewDate(''); setNewLabel('');
      await load();
    } catch(e:any) { alert(e?.message||'新增失敗'); } finally { setBusy(false); }
  };
  const delHoliday = async (id:string) => {
    if (!confirm('刪除此假日？')) return;
    try { await db.deleteCustom(id); await load(); }
    catch(e:any) { alert(e?.message||'刪除失敗'); }
  };
  const importMondays = async () => {
    const now = new Date();
    const y = now.getFullYear(); const m = now.getMonth();
    const firstDay = new Date(y, m, 1);
    const daysInMonth = new Date(y, m+1, 0).getDate();
    const mondays: string[] = [];
    for (let d=1; d<=daysInMonth; d++) {
      const dt = new Date(y, m, d);
      if (dt.getDay() === 1) {
        const iso = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        mondays.push(iso);
      }
    }
    const existing = new Set(holidays.map(h => h.date));
    const toCreate = mondays.filter(d => !existing.has(d));
    if (toCreate.length === 0) { alert('本月週一已全數存在'); return; }
    setBusy(true);
    try {
      for (const d of toCreate) {
        await db.insertCustom('x_holiday_settings', {date: d, reason: '週一公休'});
      }
      await load();
      alert(`已匯入 ${toCreate.length} 個週一假日`);
    } catch(e:any) { alert(e?.message||'匯入失敗'); } finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button onClick={()=>nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
          <h1 className="text-xl font-bold text-gray-900">系統設定</h1>
        </div>
      </header>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {err && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{err}</div>}
        <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">截止時間</h2>
          <p className="text-sm text-gray-500">超過此時間後，當日訂單將無法送出。</p>
          {loading ? <p className="text-sm text-gray-400">載入中...</p> :
            <div className="flex items-center gap-3">
              <input type="time" value={cutoffTime} onChange={e=>setCutoffTime(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm font-medium text-gray-700" />
              <button onClick={saveCutoff} disabled={cutoffBusy} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">{cutoffBusy?'儲存中...':'儲存'}</button>
            </div>
          }
        </section>
        <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">假日管理</h2>
            <button onClick={importMondays} disabled={busy} className="px-3 py-1.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-lg hover:bg-orange-200 disabled:opacity-50">匯入本月週一</button>
          </div>
          <p className="text-sm text-gray-500">設定後，訂購頁面的配送日期選擇器會排除這些日期。</p>
          <div className="flex items-center gap-2 pt-1">
            <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700" />
            <input type="text" placeholder="說明（如：元旦）" value={newLabel} onChange={e=>setNewLabel(e.target.value)} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700" />
            <button onClick={addHoliday} disabled={busy||!newDate} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">新增</button>
          </div>
          {loading ? <p className="text-sm text-gray-400">載入中...</p> :
            holidays.length===0 ? <p className="text-sm text-gray-400">目前無假日</p> :
            <ul className="divide-y divide-gray-100">
              {holidays.map(h => (
                <li key={h.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <span className="font-medium text-gray-800 text-sm">{h.date}</span>
                    <span className="text-gray-400 text-xs ml-2">{h.label}</span>
                  </div>
                  <button onClick={()=>delHoliday(h.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">刪除</button>
                </li>
              ))}
            </ul>
          }
        </section>
      </div>
    </div>
  );
}
'''


def supplier_mapping_page() -> str:
    return r'''import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';
type Mapping = { id:string; productTmplId:string; supplierId:string };
type Opt = { id:string; name:string };
const resolveId = (raw:any) => Array.isArray(raw) ? String(raw[0]||'') : String(raw||'');
export default function SupplierMappingPage() {
  const nav = useNavigate();
  const [maps, setMaps] = useState<Mapping[]>([]);
  const [tmpls, setTmpls] = useState<Opt[]>([]);
  const [sups, setSups] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [tmplId, setTmplId] = useState('');
  const [supId, setSupId] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true); setErr('');
    try {
      const [rawMaps, rawTmpls, rawSups] = await Promise.all([
        db.query('product_supplierinfo'),
        db.queryFiltered('product_templates', [{column:'active',op:'eq',value:true}]),
        db.queryFiltered('suppliers', [{column:'active',op:'eq',value:true}]),
      ]);
      setMaps((rawMaps||[]).map((r:any)=>({id:String(r.id), productTmplId:resolveId(r.product_tmpl_id), supplierId:resolveId(r.supplier_id)})));
      setTmpls((rawTmpls||[]).map((r:any)=>({id:String(r.id), name:String(r.name||'')})).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')));
      setSups((rawSups||[]).map((r:any)=>({id:String(r.id), name:String(r.name||'')})).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')));
    } catch(e:any) { setErr(e?.message||'載入失敗'); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, []);
  const tmplName = (id:string) => tmpls.find(t=>t.id===id)?.name || id;
  const supName = (id:string) => sups.find(s=>s.id===id)?.name || id;
  const add = async () => {
    if (!tmplId || !supId) { alert('請選擇產品與供應商'); return; }
    setBusy(true);
    try { await db.insert('product_supplierinfo', {product_tmpl_id: tmplId, supplier_id: supId}); setTmplId(''); setSupId(''); setShowForm(false); await load(); }
    catch(e:any) { alert(e?.message||'新增失敗'); } finally { setBusy(false); }
  };
  const del = async (id:string) => {
    if (!confirm('刪除此對應？')) return;
    try { await db.deleteRow('product_supplierinfo', id); await load(); }
    catch(e:any) { alert(e?.message||'刪除失敗'); }
  };
  const grouped = useMemo(() => {
    const m = new Map<string, Mapping[]>();
    maps.forEach(x => { const arr = m.get(x.supplierId)||[]; arr.push(x); m.set(x.supplierId, arr); });
    return Array.from(m.entries()).sort(([a],[b]) => supName(a).localeCompare(supName(b),'zh-Hant'));
  }, [maps, sups]);
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={()=>nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
            <h1 className="text-xl font-bold text-gray-900">供應商-產品對應</h1>
          </div>
          <button onClick={()=>setShowForm(v=>!v)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ 新增對應</button>
        </div>
      </header>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        {err && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{err}</div>}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <p className="font-medium text-gray-700">新增對應</p>
            <div className="flex gap-3 flex-wrap">
              <select value={tmplId} onChange={e=>setTmplId(e.target.value)} className="border border-gray-200 rounded px-3 py-1.5 text-sm bg-white flex-1 min-w-48">
                <option value="">選擇產品...</option>
                {tmpls.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={supId} onChange={e=>setSupId(e.target.value)} className="border border-gray-200 rounded px-3 py-1.5 text-sm bg-white flex-1 min-w-48">
                <option value="">選擇供應商...</option>
                {sups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button onClick={add} disabled={busy} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">確認新增</button>
              <button onClick={()=>setShowForm(false)} className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">取消</button>
            </div>
          </div>
        )}
        {loading ? <p className="text-gray-400 text-center py-12">載入中...</p> :
          maps.length===0 ?
            <div className="bg-white rounded-xl border border-gray-100 text-center text-gray-400 py-12">尚無供應商-產品對應</div>
          :
            <div className="space-y-4">
              {grouped.map(([sid, items]) => (
                <section key={sid} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <header className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
                    <p className="font-semibold text-gray-800">{supName(sid)}</p>
                    <p className="text-xs text-gray-400">供應 {items.length} 項產品</p>
                  </header>
                  <ul className="divide-y divide-gray-50">
                    {items.map(m => (
                      <li key={m.id} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-800">{tmplName(m.productTmplId)}</span>
                        <button onClick={()=>del(m.id)} className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">刪除</button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
        }
      </div>
    </div>
  );
}
'''


def driver_mapping_page() -> str:
    return r'''import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';
type Mapping = { id:string; driver_id:string; customer_id:string };
type Opt = { id:string; name:string };
export default function DriverMappingPage() {
  const nav = useNavigate();
  const [maps, setMaps] = useState<Mapping[]>([]);
  const [drivers, setDrivers] = useState<Opt[]>([]);
  const [customers, setCustomers] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [driverId, setDriverId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true); setErr('');
    try {
      const [rawMaps, rawDrvs, rawCusts] = await Promise.all([
        db.queryCustom('x_driver_customer'),
        db.queryFiltered('hr_employees', [{column:'active',op:'eq',value:true}]),
        db.queryFiltered('customers', []),
      ]);
      const ms: Mapping[] = (rawMaps||[]).map((r:any) => { const d = r.data||r; return {id:String(r.id||d.id), driver_id:String(d.driver_id||''), customer_id:String(d.customer_id||'')}; });
      setMaps(ms);
      setDrivers((rawDrvs||[]).map((r:any)=>({id:String(r.id), name:String(r.name||'')})).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')));
      setCustomers((rawCusts||[]).map((r:any)=>({id:String(r.id), name:String(r.name||`#${r.id}`)})).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')));
    } catch(e:any) { setErr(e?.message||'載入失敗'); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, []);
  const drvName = (id:string) => drivers.find(d=>d.id===id)?.name || `#${id}`;
  const custName = (id:string) => customers.find(c=>c.id===id)?.name || `#${id}`;
  const add = async () => {
    if (!driverId || !customerId) { alert('請選擇司機與客戶'); return; }
    setBusy(true);
    try {
      await db.insertCustom('x_driver_customer', {driver_id: driverId, customer_id: customerId, created_at: new Date().toISOString()});
      setDriverId(''); setCustomerId(''); setShowForm(false);
      await load();
    } catch(e:any) { alert(e?.message||'新增失敗'); } finally { setBusy(false); }
  };
  const del = async (id:string) => {
    if (!confirm('刪除此對應？')) return;
    try { await db.deleteCustom(id); await load(); }
    catch(e:any) { alert(e?.message||'刪除失敗'); }
  };
  const grouped = useMemo(() => {
    const m = new Map<string, Mapping[]>();
    maps.forEach(x => { const arr = m.get(x.driver_id)||[]; arr.push(x); m.set(x.driver_id, arr); });
    return Array.from(m.entries()).sort(([a],[b]) => drvName(a).localeCompare(drvName(b),'zh-Hant'));
  }, [maps, drivers]);
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={()=>nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
            <h1 className="text-xl font-bold text-gray-900">司機-客戶對應</h1>
          </div>
          <button onClick={()=>setShowForm(v=>!v)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ 新增對應</button>
        </div>
      </header>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        {err && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{err}</div>}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <p className="font-medium text-gray-700">新增司機-客戶對應</p>
            <div className="flex gap-3 flex-wrap">
              <select value={driverId} onChange={e=>setDriverId(e.target.value)} className="border border-gray-200 rounded px-3 py-1.5 text-sm bg-white flex-1 min-w-48">
                <option value="">選擇司機...</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={customerId} onChange={e=>setCustomerId(e.target.value)} className="border border-gray-200 rounded px-3 py-1.5 text-sm bg-white flex-1 min-w-48">
                <option value="">選擇客戶...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={add} disabled={busy} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">確認新增</button>
              <button onClick={()=>setShowForm(false)} className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">取消</button>
            </div>
          </div>
        )}
        {loading ? <p className="text-gray-400 text-center py-12">載入中...</p> :
          maps.length===0 ?
            <div className="bg-white rounded-xl border border-gray-100 text-center text-gray-400 py-12">尚無司機-客戶對應</div>
          :
            <div className="space-y-4">
              {grouped.map(([did, items]) => (
                <section key={did} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <header className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
                    <p className="font-semibold text-gray-800">{drvName(did)}</p>
                    <p className="text-xs text-gray-400">負責 {items.length} 位客戶</p>
                  </header>
                  <ul className="divide-y divide-gray-50">
                    {items.map(m => (
                      <li key={m.id} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-800">{custName(m.customer_id)}</span>
                        <button onClick={()=>del(m.id)} className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">刪除</button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
        }
      </div>
    </div>
  );
}
'''
