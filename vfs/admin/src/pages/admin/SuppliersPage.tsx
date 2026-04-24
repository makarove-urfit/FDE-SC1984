import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';

type Supplier = {
  id: string; name: string;
  defaultBuyerId: string;
  _cd: Record<string, any>;
};
type Employee = { id: string; name: string; userId: string };
type Template = { id: string; name: string };
type SupMap = { id: string; supplierId: string; productTmplId: string };

const resolveId = (raw: any) => Array.isArray(raw) ? String(raw[0] || '') : String(raw || '');
const EMPTY = { name: '', defaultBuyerId: '' };

export default function SuppliersPage() {
  const nav = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [maps, setMaps] = useState<SupMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');

  // 供應商 CRUD modal
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  // 供應產品 modal
  const [viewingSup, setViewingSup] = useState<Supplier | null>(null);
  const [addTmplId, setAddTmplId] = useState('');
  const [mapBusy, setMapBusy] = useState(false);

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const [rawSups, rawEmps, rawTmpls, rawMaps] = await Promise.all([
        db.queryFiltered('suppliers', [{ column: 'active', op: 'eq', value: true }]),
        db.queryFiltered('hr_employees', [{ column: 'active', op: 'eq', value: true }]),
        db.queryFiltered('product_templates', [{ column: 'active', op: 'eq', value: true }]),
        db.query('product_supplierinfo'),
      ]);
      setSuppliers(
        (rawSups || []).map((r: any) => {
          const cd = (r.custom_data && typeof r.custom_data === 'object') ? r.custom_data : {};
          return { id: String(r.id), name: String(r.name || ''), defaultBuyerId: String(cd.default_buyer_id || ''), _cd: cd };
        }).sort((a: Supplier, b: Supplier) => a.name.localeCompare(b.name, 'zh-Hant'))
      );
      setEmployees(
        (rawEmps || [])
          .filter((e: any) => e.user_id)
          .map((e: any) => ({ id: String(e.id), name: String(e.name || ''), userId: String(e.user_id) }))
          .sort((a: Employee, b: Employee) => a.name.localeCompare(b.name, 'zh-Hant'))
      );
      setTemplates(
        (rawTmpls || []).map((r: any) => ({ id: String(r.id), name: String(r.name || '') }))
          .sort((a: Template, b: Template) => a.name.localeCompare(b.name, 'zh-Hant'))
      );
      setMaps(
        (rawMaps || []).map((r: any) => ({
          id: String(r.id),
          supplierId: resolveId(r.supplier_id),
          productTmplId: resolveId(r.product_tmpl_id),
        }))
      );
    } catch (e: any) {
      setErr(e?.message || '載入失敗');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const buyerName = (userId: string) => employees.find(e => e.userId === userId)?.name || '';
  const tmplName = (id: string) => templates.find(t => t.id === id)?.name || `#${id}`;

  const openCreate = () => {
    setEditingId(null); setForm({ ...EMPTY });
    setFormErr(''); setShowForm(true);
  };
  const openEdit = (sup: Supplier) => {
    setEditingId(sup.id);
    setForm({ name: sup.name, defaultBuyerId: sup.defaultBuyerId });
    setFormErr(''); setShowForm(true);
  };

  const submit = async () => {
    if (!form.name.trim()) { setFormErr('供應商名稱為必填'); return; }
    setSaving(true); setFormErr('');
    try {
      const existing = suppliers.find(s => s.id === editingId);
      const cd: Record<string, any> = { ...(existing?._cd || {}) };
      if (form.defaultBuyerId) cd.default_buyer_id = form.defaultBuyerId;
      else delete cd.default_buyer_id;
      if (editingId) {
        await db.update('suppliers', editingId, { name: form.name.trim(), custom_data: cd });
      } else {
        await db.insert('suppliers', { name: form.name.trim(), custom_data: cd });
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      setFormErr(e?.message || (editingId ? '更新失敗' : '新增失敗'));
    } finally { setSaving(false); }
  };

  // 供應產品操作
  const supMaps = useMemo(() =>
    viewingSup ? maps.filter(m => m.supplierId === viewingSup.id) : [],
    [maps, viewingSup]
  );

  const addedTmplIds = useMemo(() => new Set(supMaps.map(m => m.productTmplId)), [supMaps]);

  const addProduct = async () => {
    if (!addTmplId || !viewingSup) return;
    setMapBusy(true);
    try {
      await db.insert('product_supplierinfo', { supplier_id: viewingSup.id, product_tmpl_id: addTmplId });
      setAddTmplId('');
      await load();
    } catch (e: any) { alert(e?.message || '新增失敗'); }
    finally { setMapBusy(false); }
  };

  const removeProduct = async (mapId: string) => {
    if (!confirm('移除此供應關係？')) return;
    try {
      await db.deleteRow('product_supplierinfo', mapId);
      await load();
    } catch (e: any) { alert(e?.message || '刪除失敗'); }
  };

  const filtered = suppliers.filter(s => {
    const kw = search.trim().toLowerCase();
    if (!kw) return true;
    return s.name.toLowerCase().includes(kw) || buyerName(s.defaultBuyerId).toLowerCase().includes(kw);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
            <h1 className="text-xl font-bold text-gray-900">供應商管理</h1>
          </div>
          <button onClick={openCreate}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            + 新增供應商
          </button>
        </div>
      </header>

      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜尋供應商名稱或採購員"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white" />

        {err && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{err}</div>}

        {loading ? (
          <p className="text-gray-400 text-center py-12">載入中...</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                {suppliers.length === 0 ? '尚無供應商資料' : '沒有符合的結果'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">供應商名稱</th>
                    <th className="px-4 py-3 text-left">預設採購員</th>
                    <th className="px-4 py-3 text-left">供應產品</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(sup => {
                    const productCount = maps.filter(m => m.supplierId === sup.id).length;
                    return (
                      <tr key={sup.id} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{sup.name}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {sup.defaultBuyerId && buyerName(sup.defaultBuyerId) ? (
                            <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                              {buyerName(sup.defaultBuyerId)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">未指定</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => { setViewingSup(sup); setAddTmplId(''); }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs hover:bg-gray-200">
                            {productCount > 0
                              ? <><span className="font-medium text-gray-800">{productCount}</span> 項產品</>
                              : '設定產品'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => openEdit(sup)}
                            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
                            編輯
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
        <p className="text-xs text-gray-400 text-right">共 {filtered.length} 家供應商</p>
      </div>

      {/* 供應商 CRUD modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? '編輯供應商' : '新增供應商'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  供應商名稱 <span className="text-red-500">*</span>
                </label>
                <input type="text" value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="如：大成食品"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">預設採購員（採購組）</label>
                <select value={form.defaultBuyerId}
                  onChange={e => setForm(p => ({ ...p, defaultBuyerId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="">（不指定）</option>
                  {employees.map(e => <option key={e.userId} value={e.userId}>{e.name}</option>)}
                </select>
                {employees.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">需先為員工建立系統帳號，才能在此指定採購員</p>
                )}
                <p className="text-xs text-gray-400 mt-1">建立採購單時，系統會自動帶入此採購員</p>
              </div>
              {formErr && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{formErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={submit} disabled={saving}
                className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium disabled:opacity-50">
                {saving ? '儲存中...' : (editingId ? '儲存' : '建立供應商')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 供應產品 modal */}
      {viewingSup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{viewingSup.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">供應產品管理</p>
              </div>
              <button onClick={() => setViewingSup(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            {/* 新增產品列 */}
            <div className="px-6 py-4 border-b border-gray-100 flex gap-2">
              <select value={addTmplId} onChange={e => setAddTmplId(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                <option value="">選擇產品…</option>
                {templates
                  .filter(t => !addedTmplIds.has(t.id))
                  .map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                }
              </select>
              <button onClick={addProduct} disabled={!addTmplId || mapBusy}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                {mapBusy ? '加入中...' : '加入'}
              </button>
            </div>

            {/* 已有產品列表 */}
            <div className="max-h-72 overflow-y-auto">
              {supMaps.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">尚未設定任何供應產品</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {supMaps.map(m => (
                    <li key={m.id} className="flex items-center justify-between px-6 py-2.5">
                      <span className="text-sm text-gray-800">{tmplName(m.productTmplId)}</span>
                      <button onClick={() => removeProduct(m.id)}
                        className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
                        移除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-400">共 {supMaps.length} 項產品</span>
              <button onClick={() => setViewingSup(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
