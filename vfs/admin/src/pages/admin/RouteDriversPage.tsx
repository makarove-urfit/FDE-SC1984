import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';

type Tag = {
  id: string; name: string;
  defaultDriverId: string;
  _cd: Record<string, any>;
};
type Employee = { id: string; name: string; userId: string };

const EMPTY = { name: '', defaultDriverId: '' };

export default function RouteDriversPage() {
  const nav = useNavigate();
  const [tags, setTags] = useState<Tag[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const [rawTags, rawDepts, rawAllEmps] = await Promise.all([
        db.query('customer_tags'),
        db.query('hr_departments'),
        db.query('hr_employees'),
      ]);
      const deliveryDept = (rawDepts || []).find((d: any) => String(d.name || '').includes('配送'));
      const deliveryDeptId = deliveryDept ? String(deliveryDept.id) : null;

      setTags((rawTags || [])
        .filter((r: any) => {
          const cd = (r.custom_data && typeof r.custom_data === 'object') ? r.custom_data : {};
          return String(cd.category || 'region') === 'region';
        })
        .map((r: any) => {
          const cd = (r.custom_data && typeof r.custom_data === 'object') ? r.custom_data : {};
          return {
            id: String(r.id),
            name: String(r.name || ''),
            defaultDriverId: String(cd.default_driver_id || ''),
            _cd: cd,
          };
        })
      );

      const nameToUserId: Record<string, string> = {};
      for (const e of (rawAllEmps || [])) {
        if (e.user_id && e.name) nameToUserId[String(e.name)] = String(e.user_id);
      }
      setEmployees(
        (rawAllEmps || [])
          .filter((e: any) => {
            if (e.active === false) return false;
            if (!deliveryDeptId) return true;
            const did = Array.isArray(e.department_id) ? e.department_id[0] : e.department_id;
            return String(did) === deliveryDeptId;
          })
          .map((e: any) => {
            const userId = e.user_id ? String(e.user_id) : (nameToUserId[String(e.name || '')] || '');
            return { id: String(e.id), name: String(e.name || ''), userId };
          })
          .filter((e: Employee) => !!e.userId)
          .filter((e, i, arr) => arr.findIndex(x => x.userId === e.userId) === i)
          .sort((a: Employee, b: Employee) => a.name.localeCompare(b.name, 'zh-Hant'))
      );
    } catch (e: any) {
      setErr(e?.message || '載入失敗');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const empName = (userId: string) => employees.find(e => e.userId === userId)?.name || '';

  const openCreate = () => {
    setEditingId(null); setForm({ ...EMPTY });
    setFormErr(''); setShowForm(true);
  };

  const openEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setForm({ name: tag.name, defaultDriverId: tag.defaultDriverId });
    setFormErr(''); setShowForm(true);
  };

  const submit = async () => {
    if (!form.name.trim()) { setFormErr('名稱為必填'); return; }
    setSaving(true); setFormErr('');
    try {
      const existingTag = tags.find(t => t.id === editingId);
      const cd: Record<string, any> = {
        ...(existingTag?._cd || {}),
        category: 'region',
        single_select: true,
      };
      if (form.defaultDriverId) {
        cd.default_driver_id = form.defaultDriverId;
      } else {
        delete cd.default_driver_id;
      }
      const payload = { name: form.name.trim(), custom_data: cd };
      if (editingId) {
        await db.update('customer_tags', editingId, payload);
      } else {
        await db.insert('customer_tags', payload);
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      setFormErr(e?.message || (editingId ? '更新失敗' : '新增失敗'));
    } finally { setSaving(false); }
  };

  const del = async (tag: Tag) => {
    if (!confirm(`刪除路線「${tag.name}」？`)) return;
    try { await db.deleteRow('customer_tags', tag.id); await load(); }
    catch (e: any) { alert(e?.message || '刪除失敗'); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <button onClick={() => nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
          <h1 className="text-xl font-bold text-gray-900">路線預設司機</h1>
        </div>
      </header>

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {err && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{err}</div>}

        {loading ? <p className="text-gray-400 text-center py-12">載入中...</p> : (
          <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-blue-50 border-b border-blue-100">
              <div>
                <h2 className="font-bold text-blue-900">配送路線</h2>
                <p className="text-xs text-blue-500 mt-0.5">每條路線可指定預設司機（配送組員工）</p>
              </div>
              <button onClick={openCreate}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                + 新增區域
              </button>
            </div>
            {tags.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">尚無配送路線</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-4 py-2.5 text-left">路線名稱</th>
                    <th className="px-4 py-2.5 text-left">預設司機</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {tags.map(tag => (
                    <tr key={tag.id} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{tag.name}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {tag.defaultDriverId && empName(tag.defaultDriverId) ? (
                          <span className="inline-block px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                            {empName(tag.defaultDriverId)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">未指定</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right space-x-1">
                        <button onClick={() => openEdit(tag)}
                          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">編輯</button>
                        <button onClick={() => del(tag)}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">刪除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? '編輯路線' : '新增路線'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  路線名稱 <span className="text-red-500">*</span>
                </label>
                <input type="text" value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="如：北區、南區、市區路線"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">預設司機</label>
                <select value={form.defaultDriverId}
                  onChange={e => setForm(p => ({ ...p, defaultDriverId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">（不指定）</option>
                  {employees.map(e => <option key={e.userId} value={e.userId}>{e.name}</option>)}
                </select>
                {employees.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">需先指派員工至「配送」部門並建立系統帳號，才能在此指定司機</p>
                )}
                <p className="text-xs text-gray-400 mt-1">僅顯示配送部門的員工。客戶設定路線後，系統將自動指派此司機</p>
              </div>
              {formErr && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{formErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={submit} disabled={saving}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50">
                {saving ? '儲存中...' : (editingId ? '儲存' : '建立')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
