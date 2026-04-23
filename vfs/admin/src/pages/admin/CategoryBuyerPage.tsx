import { useState, useEffect, useMemo } from 'react';
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
