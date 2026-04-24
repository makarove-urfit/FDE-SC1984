import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';

type Tmpl = {
  id: string; name: string; default_code: string;
  categ_id: any; sale_ok: boolean;
  defaultSupplierId: string; _cd: Record<string, any>;
};
type Cat = { id: string; name: string };
type Supplier = { id: string; name: string };
type SupMap = { id: string; supplierId: string; productTmplId: string };

const ALL_TAB = '__all__';

const resolveId = (raw: any): string => {
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [maps, setMaps] = useState<SupMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editCat, setEditCat] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState(ALL_TAB);

  // 供應商 modal 狀態
  const [viewingProduct, setViewingProduct] = useState<Tmpl | null>(null);
  const [editDefaultSup, setEditDefaultSup] = useState('');
  const [addSupId, setAddSupId] = useState('');
  const [supBusy, setSupBusy] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [ts, cs, sups, rawMaps] = await Promise.all([
        db.queryFiltered('product_templates', [{ column: 'active', op: 'eq', value: true }]),
        db.query('product_categories'),
        db.queryFiltered('suppliers', [{ column: 'active', op: 'eq', value: true }]),
        db.query('product_supplierinfo'),
      ]);
      setTmpls((ts || []).map((r: any) => {
        const cd = (r.custom_data && typeof r.custom_data === 'object') ? r.custom_data : {};
        return {
          id: String(r.id), name: String(r.name || ''),
          default_code: String(r.default_code || ''), categ_id: r.categ_id,
          sale_ok: Boolean(r.sale_ok),
          defaultSupplierId: String(cd.default_supplier_id || ''),
          _cd: cd,
        };
      }));
      setCats((cs || []).map((r: any) => ({ id: String(r.id), name: String(r.name || '') })));
      setSuppliers(
        (sups || []).map((r: any) => ({ id: String(r.id), name: String(r.name || '') }))
          .sort((a: Supplier, b: Supplier) => a.name.localeCompare(b.name, 'zh-Hant'))
      );
      setMaps((rawMaps || []).map((r: any) => ({
        id: String(r.id),
        supplierId: resolveId(r.supplier_id),
        productTmplId: resolveId(r.product_tmpl_id),
      })));
    } catch (e: any) { setError(e?.message || '載入失敗'); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!editId) return;
    const p = tmpls.find(x => x.id === editId);
    setEditCat(p ? resolveId(p.categ_id) : '');
  }, [editId, tmpls]);

  const catName = (raw: any): string => {
    const id = resolveId(raw);
    if (!id) return '';
    const arrName = Array.isArray(raw) && raw.length >= 2 ? String(raw[1]) : '';
    return cats.find(c => c.id === id)?.name || arrName;
  };

  const supName = (id: string) => suppliers.find(s => s.id === id)?.name || '';

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
    let list = [...tmpls].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    if (activeTab !== ALL_TAB) list = list.filter(p => catName(p.categ_id) === activeTab);
    if (!kw) return list;
    return list.filter(p =>
      p.name.toLowerCase().includes(kw) ||
      p.default_code.toLowerCase().includes(kw) ||
      catName(p.categ_id).toLowerCase().includes(kw) ||
      supName(p.defaultSupplierId).toLowerCase().includes(kw)
    );
  }, [tmpls, search, cats, activeTab, suppliers]);

  const save = async (id: string) => {
    setSaving(true);
    try {
      await db.update('product_templates', id, { categ_id: editCat || false });
      await load();
      setEditId(null); setEditCat('');
    } catch (e: any) { alert(e?.message || '儲存失敗'); } finally { setSaving(false); }
  };

  const togglePublish = async (p: Tmpl) => {
    const next = !p.sale_ok;
    const msg = next ? `將「${p.name}」上架？上架後客戶可在訂購頁下單此商品。` : `將「${p.name}」下架？下架後客戶端將不顯示。`;
    if (!confirm(msg)) return;
    try {
      await db.update('product_templates', p.id, { sale_ok: next });
      await load();
    } catch (e: any) { alert(e?.message || '切換失敗'); }
  };

  const handleAddDone = async (catId: string) => {
    setShowAdd(false);
    await load();
    if (catId) {
      const cat = cats.find(c => c.id === catId);
      if (cat && tabs.includes(cat.name)) setActiveTab(cat.name);
      else {
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

  // 供應商 modal 操作
  const openSupModal = (p: Tmpl) => {
    setViewingProduct(p);
    setEditDefaultSup(p.defaultSupplierId);
    setAddSupId('');
  };

  const saveDefaultSup = async () => {
    if (!viewingProduct) return;
    setSupBusy(true);
    try {
      const cd = { ...viewingProduct._cd };
      if (editDefaultSup) cd.default_supplier_id = editDefaultSup;
      else delete cd.default_supplier_id;
      await db.update('product_templates', viewingProduct.id, { custom_data: cd });
      await load();
      setViewingProduct(prev => prev ? { ...prev, defaultSupplierId: editDefaultSup, _cd: cd } : null);
    } catch (e: any) { alert(e?.message || '儲存失敗'); }
    finally { setSupBusy(false); }
  };

  const productMaps = useMemo(() =>
    viewingProduct ? maps.filter(m => m.productTmplId === viewingProduct.id) : [],
    [maps, viewingProduct]
  );
  const addedSupIds = useMemo(() => new Set(productMaps.map(m => m.supplierId)), [productMaps]);

  const addSupMap = async () => {
    if (!addSupId || !viewingProduct) return;
    setSupBusy(true);
    try {
      await db.insert('product_supplierinfo', { product_tmpl_id: viewingProduct.id, supplier_id: addSupId });
      setAddSupId('');
      await load();
    } catch (e: any) { alert(e?.message || '新增失敗'); }
    finally { setSupBusy(false); }
  };

  const removeSupMap = async (mapId: string) => {
    if (!confirm('移除此供應關係？')) return;
    try {
      await db.deleteRow('product_supplierinfo', mapId);
      await load();
    } catch (e: any) { alert(e?.message || '刪除失敗'); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
            <h1 className="text-xl font-bold text-gray-900">產品管理</h1>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            ＋ 新增產品
          </button>
        </div>
      </header>

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
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋品名、編碼、分類或供應商"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white" />
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>}
        {loading ? <p className="text-gray-400 text-center py-12">載入中...</p> :
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {filtered.length === 0 ? <div className="text-center text-gray-400 py-12">無產品</div> :
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">編碼</th>
                    <th className="px-4 py-3 text-left">品名</th>
                    <th className="px-4 py-3 text-left">分類</th>
                    <th className="px-4 py-3 text-left">主供應商</th>
                    <th className="px-4 py-3 text-left">狀態</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const mapCount = maps.filter(m => m.productTmplId === p.id).length;
                    return (
                      <tr key={p.id} className={`border-t border-gray-50 hover:bg-gray-50 ${p.sale_ok ? '' : 'opacity-60'}`}>
                        <td className="px-4 py-3 text-xs text-gray-500">{p.default_code || '—'}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                        <td className="px-4 py-3">
                          {editId === p.id ?
                            <select value={editCat} onChange={e => setEditCat(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-sm bg-white">
                              <option value="">（不設定）</option>
                              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              {editCat && !cats.some(c => c.id === editCat) && (
                                <option value={editCat}>（原值 #{editCat.slice(0, 8)}：{catName(p.categ_id) || '未知分類'}）</option>
                              )}
                            </select>
                            : <span className="text-gray-700">{catName(p.categ_id) || '—'}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => openSupModal(p)}
                            className="text-left group">
                            {p.defaultSupplierId && supName(p.defaultSupplierId) ? (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-700 group-hover:text-blue-600">
                                {supName(p.defaultSupplierId)}
                                {mapCount > 1 && <span className="text-gray-300">+{mapCount - 1}</span>}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300 group-hover:text-blue-500">設定供應商</span>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.sale_ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {p.sale_ok ? '上架' : '下架'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {editId === p.id ?
                            <>
                              <button onClick={() => save(p.id)} disabled={saving} className="px-2 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50">{saving ? '儲存中' : '儲存'}</button>
                              <button onClick={() => { setEditId(null); setEditCat(''); }} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">取消</button>
                            </>
                            : <>
                              <button onClick={() => { setEditId(p.id); setEditCat(resolveId(p.categ_id)); }} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">編輯分類</button>
                              <button onClick={() => togglePublish(p)} className={`px-2 py-1 text-xs rounded ${p.sale_ok ? 'text-red-600 hover:bg-red-50' : 'text-green-700 hover:bg-green-50'}`}>
                                {p.sale_ok ? '下架' : '上架'}
                              </button>
                            </>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>}
          </div>}
      </div>

      {showAdd && (
        <AddProductModal cats={cats} onClose={() => setShowAdd(false)} onDone={handleAddDone} />
      )}

      {/* 供應商管理 modal */}
      {viewingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{viewingProduct.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">供應商設定</p>
              </div>
              <button onClick={() => setViewingProduct(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            {/* 主供應商 */}
            <div className="px-6 py-4 border-b border-gray-100 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">主供應商（SSOT）</p>
              <div className="flex gap-2">
                <select value={editDefaultSup} onChange={e => setEditDefaultSup(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                  <option value="">（不指定）</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button onClick={saveDefaultSup} disabled={supBusy || editDefaultSup === viewingProduct.defaultSupplierId}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40">
                  {supBusy ? '儲存中...' : '儲存'}
                </button>
              </div>
              <p className="text-xs text-gray-400">採購鏈 SSOT：品項 → 主供應商 → 採購員</p>
            </div>

            {/* 備用供應商 (product_supplierinfo) */}
            <div className="px-6 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">備用供應商</p>
              <div className="flex gap-2">
                <select value={addSupId} onChange={e => setAddSupId(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                  <option value="">選擇供應商…</option>
                  {suppliers
                    .filter(s => !addedSupIds.has(s.id))
                    .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button onClick={addSupMap} disabled={!addSupId || supBusy}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40">
                  加入
                </button>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto">
              {productMaps.length === 0 ? (
                <p className="text-center text-gray-400 py-6 text-sm">尚無備用供應商</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {productMaps.map(m => (
                    <li key={m.id} className="flex items-center justify-between px-6 py-2.5">
                      <span className="text-sm text-gray-800">{supName(m.supplierId) || `#${m.supplierId.slice(0, 8)}`}</span>
                      <button onClick={() => removeSupMap(m.id)}
                        className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
                        移除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setViewingProduct(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
