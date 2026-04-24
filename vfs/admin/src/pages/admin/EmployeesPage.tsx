import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';

type Employee = {
  id: string; name: string; work_email: string;
  department_id: string; department_name: string;
  has_account: boolean; job_title: string;
};
type Dept = { id: string; name: string };

const EMPTY_FORM = { name: '', work_email: '', department_id: '', job_title: '' };

export default function EmployeesPage() {
  const nav = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [inviteState, setInviteState] = useState<Record<string, { status: string; msg?: string }>>({});

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [emps, depts] = await Promise.all([
        db.query('hr_employees'),
        db.query('hr_departments'),
      ]);
      const deptMap: Record<string, string> = {};
      for (const d of (depts || [])) deptMap[String(d.id)] = String(d.name || '');
      setDepartments((depts || []).map((d: any) => ({ id: String(d.id), name: String(d.name || '') })));
      setEmployees(
        (emps || [])
          .filter((e: any) => e.active !== false)
          .map((e: any) => ({
            id: String(e.id),
            name: String(e.name || ''),
            work_email: String(e.work_email || ''),
            department_id: String(e.department_id || ''),
            department_name: deptMap[String(e.department_id || '')] || '',
            has_account: !!(e.user_id),
            job_title: String(e.job_title || ''),
          }))
      );
    } catch (e: any) {
      setError(e?.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = employees.filter(e => {
    const kw = search.trim().toLowerCase();
    if (!kw) return true;
    return e.name.toLowerCase().includes(kw)
      || e.work_email.toLowerCase().includes(kw)
      || e.department_name.toLowerCase().includes(kw);
  });

  const f = (k: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setForm({ name: emp.name, work_email: emp.work_email, department_id: emp.department_id, job_title: emp.job_title });
    setFormError('');
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.name.trim()) { setFormError('姓名為必填'); return; }
    setSaving(true); setFormError('');
    try {
      const data: Record<string, any> = { name: form.name.trim() };
      data.work_email = form.work_email.trim() || '';
      data.department_id = form.department_id || '';
      data.job_title = form.job_title.trim() || '';

      if (editingId) {
        await db.update('hr_employees', editingId, data);
      } else {
        await db.insert('hr_employees', data);
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      setFormError(e?.message || (editingId ? '更新失敗' : '新增失敗'));
    } finally {
      setSaving(false);
    }
  };

  const sendInvite = async (emp: Employee) => {
    if (!emp.work_email) return;
    setInviteState(prev => ({ ...prev, [emp.id]: { status: 'sending' } }));
    try {
      await db.sendInvitation(emp.work_email);
      setInviteState(prev => ({ ...prev, [emp.id]: { status: 'sent' } }));
      await load();
    } catch (e: any) {
      setInviteState(prev => ({ ...prev, [emp.id]: { status: 'error', msg: e?.message || '寄送失敗' } }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
            <h1 className="text-xl font-bold text-gray-900">員工管理</h1>
          </div>
          <button onClick={openCreate}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            + 新增員工
          </button>
        </div>
      </header>

      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜尋姓名、Email 或部門"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white" />

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>}

        {loading ? (
          <p className="text-gray-400 text-center py-12">載入中...</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                {employees.length === 0 ? '尚無員工資料' : '沒有符合的結果'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">姓名</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">部門</th>
                    <th className="px-4 py-3 text-center">系統帳號</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e => {
                    const inv = inviteState[e.id];
                    return (
                      <tr key={e.id} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {e.name}
                          {e.job_title && <span className="ml-2 text-xs text-gray-400">{e.job_title}</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{e.work_email || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{e.department_name || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          {e.has_account ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">已建立</span>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">未建立</span>
                              {e.work_email && (
                                inv?.status === 'sent' ? (
                                  <span className="text-xs text-blue-500">✓ 邀請已寄出</span>
                                ) : inv?.status === 'error' ? (
                                  <span className="text-xs text-red-500">{inv.msg}</span>
                                ) : (
                                  <button onClick={() => sendInvite(e)} disabled={inv?.status === 'sending'}
                                    className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50">
                                    {inv?.status === 'sending' ? '寄送中...' : '寄送邀請'}
                                  </button>
                                )
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => openEdit(e)}
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
        <p className="text-xs text-gray-400 text-right">共 {filtered.length} 位員工</p>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? '編輯員工' : '新增員工'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名 <span className="text-red-500">*</span></label>
                <input type="text" value={form.name} onChange={f('name')} placeholder="王小明"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">職稱</label>
                <input type="text" value={form.job_title} onChange={f('job_title')} placeholder="業務專員"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.work_email} onChange={f('work_email')} placeholder="name@company.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                {!editingId && <p className="text-xs text-gray-400 mt-1">填入後可在列表寄送邀請信，對方設定密碼後即可登入</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">部門</label>
                <select value={form.department_id} onChange={f('department_id')}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                  <option value="">（不指定）</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              {formError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{formError}</div>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={submit} disabled={saving}
                className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium disabled:opacity-50">
                {saving ? '儲存中...' : (editingId ? '儲存' : '建立員工')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
