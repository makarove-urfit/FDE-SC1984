import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';

type Tmpl = { id:string; name:string; default_code:string; categ_id:any; sale_ok:boolean };
type Cat = { id:string; name:string };

const ALL_TAB = '__all__';

const resolveId = (raw:any): string => {
  if (raw === null || raw === undefined || raw === false) return '';
  if (Array.isArray(raw)) return String(raw[0] ?? '');
  if (typeof raw === 'object' && raw !== null && 'id' in raw) return String((raw as any).id ?? '');
  return String(raw);
};

function AddProductModal({ cats, onClose, onDone }: {
  cats: Cat[]; onClose: () => void; onDone: (catId: string) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [catId, setCatId] = useState('');
  const [saleOk, setSaleOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) { setError('品名為必填'); return; }
    setSaving(true); setError('');
    try {
      const data: Record<string, any> = { name: name.trim(), sale_ok: saleOk, active: true };
      if (code.trim()) data.default_code = code.trim();
      if (catId) data.categ_id = catId;
      await db.insert('product_templates', data);
      onDone(catId);
    } catch (e: any) {
      setError(e.message || '新增失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 mb-4">新增產品</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">品名 <span className="text-red-500">*</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="輸入品名..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">編碼</label>
            <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="選填"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">分類</label>
            <select value={catId} onChange={e => setCatId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">不設定</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">立即上架</label>
            <button type="button" onClick={() => setSaleOk(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${saleOk ? 'bg-green-500' : 'bg-gray-200'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${saleOk ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">取消</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300">
            {saving ? '新增中...' : '確認新增'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState(ALL_TAB);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [ts, cs] = await Promise.all([
        db.queryFiltered('product_templates', [{column:'active',op:'eq',value:true}]),
        db.query('product_categories'),
      ]);
      setTmpls((ts||[]).map((r:any)=>({id:String(r.id), name:String(r.name||''), default_code:String(r.default_code||''), categ_id:r.categ_id, sale_ok:Boolean(r.sale_ok)})));
      setCats((cs||[]).map((r:any)=>({id:String(r.id), name:String(r.name||'')})));
    } catch(e:any) { setError(e?.message||'載入失敗'); } finally { setLoading(false); }
  };

  useEffect(()=>{ load(); }, []);

  useEffect(() => {
    if (!editId) return;
    const p = tmpls.find(x => x.id === editId);
    setEditCat(p ? resolveId(p.categ_id) : '');
  }, [editId, tmpls]);

  const catName = (raw:any): string => {
    const id = resolveId(raw);
    if (!id) return '';
    const arrName = Array.isArray(raw) && raw.length >= 2 ? String(raw[1]) : '';
    return cats.find(c => c.id === id)?.name || arrName;
  };

  // 分類頁籤（依商品實際用到的分類）
  const tabs = useMemo(() => {
    const set = new Set<string>();
    for (const p of tmpls) {
      const name = catName(p.categ_id);
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }, [tmpls, cats]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    let list = [...tmpls].sort((a,b)=>a.name.localeCompare(b.name, 'zh-Hant'));
    if (activeTab !== ALL_TAB) list = list.filter(p => catName(p.categ_id) === activeTab);
    if (!kw) return list;
    return list.filter(p => p.name.toLowerCase().includes(kw) || p.default_code.toLowerCase().includes(kw) || catName(p.categ_id).toLowerCase().includes(kw));
  }, [tmpls, search, cats, activeTab]);

  const save = async (id:string) => {
    setSaving(true);
    try {
      await db.update('product_templates', id, {categ_id: editCat || false});
      await load();
      setEditId(null); setEditCat('');
    } catch(e:any) { alert(e?.message||'儲存失敗'); } finally { setSaving(false); }
  };

  const togglePublish = async (p:Tmpl) => {
    const next = !p.sale_ok;
    const msg = next ? `將「${p.name}」上架？上架後客戶可在訂購頁下單此商品。` : `將「${p.name}」下架？下架後客戶端將不顯示。`;
    if (!confirm(msg)) return;
    try {
      await db.update('product_templates', p.id, {sale_ok: next});
      await load();
    } catch(e:any) { alert(e?.message||'切換失敗'); }
  };

  const handleAddDone = async (catId: string) => {
    setShowAdd(false);
    await load();
    // 切換至新增商品所屬分類頁籤
    if (catId) {
      const cat = cats.find(c => c.id === catId);
      if (cat && tabs.includes(cat.name)) setActiveTab(cat.name);
      else {
        // load 後 tabs 會更新，需等一個 tick 再切
        setTimeout(() => {
          setCats(prev => {
            const found = prev.find(c => c.id === catId);
            if (found) setActiveTab(found.name);
            return prev;
          });
        }, 100);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={()=>nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
            <h1 className="text-xl font-bold text-gray-900">產品管理</h1>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            ＋ 新增產品
          </button>
        </div>
      </header>

      {/* 分類頁籤 */}
      {tabs.length > 0 && (
        <div className="bg-white border-b border-gray-200 px-6">
          <div className="flex gap-0 overflow-x-auto max-w-6xl mx-auto">
            <button onClick={() => setActiveTab(ALL_TAB)}
              className={`py-3 px-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === ALL_TAB ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              全部
            </button>
            {tabs.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`py-3 px-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {tab}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋品名、編碼或分類"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white" />
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>}
        {loading ? <p className="text-gray-400 text-center py-12">載入中...</p> :
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {filtered.length===0 ? <div className="text-center text-gray-400 py-12">無產品</div> :
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs"><tr>
              <th className="px-4 py-3 text-left">編碼</th><th className="px-4 py-3 text-left">品名</th>
              <th className="px-4 py-3 text-left">分類</th><th className="px-4 py-3 text-left">狀態</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr></thead>
            <tbody>{filtered.map(p => (
              <tr key={p.id} className={`border-t border-gray-50 hover:bg-gray-50 ${p.sale_ok ? '' : 'opacity-60'}`}>
                <td className="px-4 py-3 text-xs text-gray-500">{p.default_code || '—'}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                <td className="px-4 py-3">
                  {editId===p.id ?
                    <select value={editCat} onChange={e=>setEditCat(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-sm bg-white">
                      <option value="">（不設定）</option>
                      {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      {editCat && !cats.some(c => c.id === editCat) && (
                        <option value={editCat}>（原值 #{editCat.slice(0,8)}：{catName(p.categ_id) || '未知分類'}）</option>
                      )}
                    </select>
                  : <span className="text-gray-700">{catName(p.categ_id) || '—'}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.sale_ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {p.sale_ok ? '上架' : '下架'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  {editId===p.id ?
                    <>
                      <button onClick={()=>save(p.id)} disabled={saving} className="px-2 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50">{saving?'儲存中':'儲存'}</button>
                      <button onClick={()=>{setEditId(null); setEditCat('');}} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">取消</button>
                    </>
                  : <>
                      <button onClick={()=>{setEditId(p.id); setEditCat(resolveId(p.categ_id));}} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">編輯分類</button>
                      <button onClick={()=>togglePublish(p)} className={`px-2 py-1 text-xs rounded ${p.sale_ok ? 'text-red-600 hover:bg-red-50' : 'text-green-700 hover:bg-green-50'}`}>
                        {p.sale_ok ? '下架' : '上架'}
                      </button>
                    </>}
                </td>
              </tr>
            ))}</tbody>
          </table>}
        </div>}
      </div>

      {showAdd && (
        <AddProductModal cats={cats} onClose={() => setShowAdd(false)} onDone={handleAddDone} />
      )}
    </div>
  );
}
