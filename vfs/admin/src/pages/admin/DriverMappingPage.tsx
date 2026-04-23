import { useState, useEffect, useMemo } from 'react';
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
      // AI GO 建此 table 時把底線壓掉（實際欄位 driverid / customerid）
      const ms: Mapping[] = (rawMaps||[]).map((r:any) => { const d = r.data||r; return {id:String(r.id||d.id), driver_id:String(d.driverid||d.driver_id||''), customer_id:String(d.customerid||d.customer_id||'')}; });
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
      await db.insertCustom('x_driver_customer', {driverid: driverId, customerid: customerId, createdat: new Date().toISOString()});
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
