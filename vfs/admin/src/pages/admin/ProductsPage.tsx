import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';

type Tmpl = {
  id: string; name: string; default_code: string;
  categ_id: any; uom_id: any; sale_ok: boolean;
  defaultSupplierId: string; _cd: Record<string, any>;
};
type Cat = { id: string; name: string };
type Uom = { id: string; name: string };
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
    if (!catId) { setError('分類為必填'); return; }
    setSaving(true); setError('');
    try {
      const data: Record<string, any> = { name: name.trim(), sale_ok: saleOk, active: true, categ_id: catId };
      if (code.trim()) data.default_code = code.trim();
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
            <label className="block text-sm font-medium text-gray-700 mb-1">分類 <span className="text-red-500">*</span></label>
            <select value={catId} onChange={e => setCatId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">請選擇分類...</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={saleOk} onChange={e => setSaleOk(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-green-600 cursor-pointer" />
            <span className="text-sm font-medium text-gray-700">立即上架</span>
          </label>
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

function EditProductModal({ p, cats, uoms, suppliers, maps, onClose, onReload }: {
  p: Tmpl;
  cats: Cat[];
  uoms: Uom[];
  suppliers: Supplier[];
  maps: SupMap[];
  onClose: () => void;
  onReload: () => Promise<void>;
}) {
  const [name, setName] = useState(p.name);
  const [code, setCode] = useState(p.default_code);
  const [catId, setCatId] = useState(() => resolveId(p.categ_id));
  const [uomId, setUomId] = useState(() => resolveId(p.uom_id));
  const [saleOk, setSaleOk] = useState(p.sale_ok);
  const [defaultSup, setDefaultSup] = useState(p.defaultSupplierId);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [step, setStep] = useState('');
  const [minQty, setMinQty] = useState('');
  const [maxQty, setMaxQty] = useState('');
  const [addSupId, setAddSupId] = useState('');
  const [saving, setSaving] = useState(false);
  const [supBusy, setSupBusy] = useState(false);

  const productMaps = useMemo(() => maps.filter(m => m.productTmplId === p.id), [maps, p.id]);
  const addedSupIds = useMemo(() => new Set(productMaps.map(m => m.supplierId)), [productMaps]);

  useEffect(() => {
    db.queryFiltered('product_products', [{ column: 'product_tmpl_id', op: 'eq', value: p.id }], 1)
      .then((variants: any) => {
        const v = Array.isArray(variants) ? variants[0] : null;
        if (v) {
          setVariantId(String(v.id));
          const cd = (v.custom_data && typeof v.custom_data === 'object') ? v.custom_data as Record<string, any> : {};
          setStep(String(cd.order_step || ''));
          setMinQty(String(cd.min_qty || ''));
          setMaxQty(String(cd.max_qty || ''));
        }
      }).catch(() => {});
  }, [p.id]);

  const handleSave = async () => {
    if (!name.trim()) { alert('品名為必填'); return; }
    setSaving(true);
    try {
      const cd = { ...p._cd };
      if (defaultSup) cd.default_supplier_id = defaultSup;
      else delete cd.default_supplier_id;
      await db.update('product_templates', p.id, {
        name: name.trim(),
        default_code: code.trim() || false,
        categ_id: catId || false,
        uom_id: uomId || false,
        sale_ok: saleOk,
        custom_data: cd,
      });
      if (variantId) {
        const orderCd: Record<string, any> = {};
        const s = parseFloat(step); if (s > 0) orderCd.order_step = s;
        const mn = parseFloat(minQty); if (mn > 0) orderCd.min_qty = mn;
        const mx = parseFloat(maxQty); if (mx > 0) orderCd.max_qty = mx;
        await db.update('product_products', variantId, { custom_data: orderCd });
      }
      await onReload();
      onClose();
    } catch (e: any) {
      alert(e?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSup = async () => {
    if (!addSupId) return;
    setSupBusy(true);
    try {
      await db.insert('product_supplierinfo', { product_tmpl_id: p.id, supplier_id: addSupId });
      setAddSupId('');
      await onReload();
    } catch (e: any) { alert(e?.message || '新增失敗'); }
    finally { setSupBusy(false); }
  };

  const handleRemoveSup = async (mapId: string) => {
    if (!confirm('移除此供應關係？')) return;
    try {
      await db.deleteRow('product_supplierinfo', mapId);
      await onReload();
    } catch (e: any) { alert(e?.message || '刪除失敗'); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">編輯產品</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* 基本資料 */}
          <div className="px-6 py-4 border-b border-gray-100 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">基本資料</p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">品名 <span className="text-red-500">*</span></label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">編碼</label>
              <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="選填"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">分類</label>
              <select value={catId} onChange={e => setCatId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">（不設定）</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">單位</label>
              <select value={uomId} onChange={e => setUomId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">（不設定）</option>
                {uoms.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={saleOk} onChange={e => setSaleOk(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-green-600 cursor-pointer" />
              <span className="text-sm font-medium text-gray-700">上架</span>
            </label>
          </div>

          {/* 供應商 */}
          <div className="px-6 py-4 border-b border-gray-100 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">供應商</p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">主供應商</label>
              <select value={defaultSup} onChange={e => setDefaultSup(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">（不指定）</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">採購鏈 SSOT：品項 → 主供應商 → 採購員</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">備用供應商</label>
              <div className="flex gap-2 mb-2">
                <select value={addSupId} onChange={e => setAddSupId(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">選擇供應商…</option>
                  {suppliers.filter(s => !addedSupIds.has(s.id)).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button onClick={handleAddSup} disabled={!addSupId || supBusy}
                  className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40">
                  加入
                </button>
              </div>
              {productMaps.length > 0 && (
                <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
                  {productMaps.map(m => (
                    <li key={m.id} className="flex items-center justify-between px-3 py-2">
                      <span className="text-sm text-gray-700">{suppliers.find(s => s.id === m.supplierId)?.name || `#${m.supplierId.slice(0, 8)}`}</span>
                      <button onClick={() => handleRemoveSup(m.id)}
                        className="text-xs text-red-500 hover:text-red-700 px-2 py-0.5 rounded hover:bg-red-50">
                        移除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 訂購規則 */}
          <div className="px-6 py-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">訂購規則</p>
            {variantId ? (
              <>
                <div className="flex gap-3">
                  {([
                    { label: '步進', val: step, set: setStep, placeholder: '例：5' },
                    { label: '最小', val: minQty, set: setMinQty, placeholder: '例：10' },
                    { label: '最大', val: maxQty, set: setMaxQty, placeholder: '0=不限' },
                  ] as const).map(({ label, val, set, placeholder }) => (
                    <div key={label} className="flex-1">
                      <label className="block text-xs text-gray-400 mb-1">{label}</label>
                      <input type="number" min="0" value={val} onChange={e => set(e.target.value)} placeholder={placeholder}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400">留空或 0 代表不限制</p>
              </>
            ) : (
              <p className="text-xs text-gray-400">無對應規格記錄</p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">取消</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300">
            {saving ? '儲存中...' : '儲存'}
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
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [maps, setMaps] = useState<SupMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState(ALL_TAB);
  const [editingProduct, setEditingProduct] = useState<Tmpl | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [ts, cs, uomRaw, sups, rawMaps] = await Promise.all([
        db.queryFiltered('product_templates', [{ column: 'active', op: 'eq', value: true }]),
        db.query('product_categories'),
        db.query('uom_uom'),
        db.queryFiltered('suppliers', [{ column: 'active', op: 'eq', value: true }]),
        db.query('product_supplierinfo'),
      ]);
      const seenIds = new Set<string>();
      setTmpls((ts || []).reduce((acc: Tmpl[], r: any) => {
        const rid = String(r.id);
        if (seenIds.has(rid)) return acc;
        seenIds.add(rid);
        const cd = (r.custom_data && typeof r.custom_data === 'object') ? r.custom_data : {};
        acc.push({
          id: rid, name: String(r.name || ''),
          default_code: String(r.default_code || ''), categ_id: r.categ_id,
          uom_id: r.uom_id,
          sale_ok: Boolean(r.sale_ok),
          defaultSupplierId: String(cd.default_supplier_id || ''),
          _cd: cd,
        });
        return acc;
      }, []));
      setCats((cs || []).map((r: any) => ({ id: String(r.id), name: String(r.name || '') })));
      const seenNames = new Set<string>();
      setUoms((uomRaw || []).filter((r: any) => r.active !== false).map((r: any) => ({ id: String(r.id), name: String(r.name || '') })).filter((u: Uom) => {
        if (seenNames.has(u.name)) return false;
        seenNames.add(u.name);
        return true;
      }));
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

  const catName = (raw: any): string => {
    const id = resolveId(raw);
    if (!id) return '';
    const arrName = Array.isArray(raw) && raw.length >= 2 ? String(raw[1]) : '';
    return cats.find(c => c.id === id)?.name || arrName;
  };

  const supName = (id: string) => suppliers.find(s => s.id === id)?.name || '';

  const tabs = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of tmpls) {
      const id = resolveId(p.categ_id);
      if (!id) continue;
      const name = catName(p.categ_id);
      if (name) map.set(id, name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  }, [tmpls, cats]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    let list = [...tmpls].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    if (activeTab !== ALL_TAB) list = list.filter(p => resolveId(p.categ_id) === activeTab);
    if (!kw) return list;
    return list.filter(p =>
      p.name.toLowerCase().includes(kw) ||
      p.default_code.toLowerCase().includes(kw) ||
      catName(p.categ_id).toLowerCase().includes(kw) ||
      supName(p.defaultSupplierId).toLowerCase().includes(kw)
    );
  }, [tmpls, search, cats, activeTab, suppliers]);

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
    if (catId) setActiveTab(catId);
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
          <div className="flex gap-2 overflow-x-auto scrollbar-none py-3 max-w-6xl mx-auto">
            <button onClick={() => setActiveTab(ALL_TAB)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${activeTab === ALL_TAB ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              全部
            </button>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${activeTab === tab.id ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {tab.name}
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
                    <th className="px-4 py-3 text-left">單位</th>
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
                        <td className="px-4 py-3 text-gray-700">{catName(p.categ_id) || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">{uoms.find(u => u.id === resolveId(p.uom_id))?.name || '—'}</td>
                        <td className="px-4 py-3">
                          {p.defaultSupplierId && supName(p.defaultSupplierId) ? (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-700">
                              {supName(p.defaultSupplierId)}
                              {mapCount > 1 && <span className="text-gray-300">+{mapCount - 1}</span>}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.sale_ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {p.sale_ok ? '上架' : '下架'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button onClick={() => setEditingProduct(p)}
                            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">
                            編輯
                          </button>
                          <button onClick={() => togglePublish(p)}
                            className={`px-2 py-1 text-xs rounded ${p.sale_ok ? 'text-red-600 hover:bg-red-50' : 'text-green-700 hover:bg-green-50'}`}>
                            {p.sale_ok ? '下架' : '上架'}
                          </button>
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

      {editingProduct && (
        <EditProductModal
          p={editingProduct}
          cats={cats}
          uoms={uoms}
          suppliers={suppliers}
          maps={maps}
          onClose={() => setEditingProduct(null)}
          onReload={load}
        />
      )}
    </div>
  );
}
