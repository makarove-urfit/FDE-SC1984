import { useState, useEffect } from 'react';
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
