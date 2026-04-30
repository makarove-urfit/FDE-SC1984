import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';

type Employee = {
  id: string; name: string; work_email: string;
  department_id: string; department_name: string;
  job_title: string;
  user_id: string;
  user_status: string;     // ''(無 user) | 'pending' | 'active' | 'disabled'
  invitation_id: string;   // 仍可撤銷的 pending invitation id
};
type Dept = { id: string; name: string };
type RowAction = { busy?: boolean; link?: string; copied?: boolean; err?: string };

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
  const [rowAction, setRowAction] = useState<Record<string, RowAction>>({});

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [actionRes, pendingInvs] = await Promise.all([
        db.runAction('list_employees'),
        db.listPendingInvitations().catch(() => []),
      ]);
      const emps = actionRes?.employees || [];
      const depts = actionRes?.departments || [];

      // user_id → invitation_id (僅 pending)
      const userToInv: Record<string, string> = {};
      for (const inv of pendingInvs) {
        if (inv.user_id) userToInv[String(inv.user_id)] = String(inv.id);
      }

      setDepartments(depts.map((d: any) => ({ id: String(d.id), name: String(d.name || '') })));
      setEmployees(
        emps.map((e: any) => {
          const uid = String(e.user_id || '');
          const invId = uid ? (userToInv[uid] || '') : '';
          // 推斷狀態：有 user_id + 仍 pending → pending；有 user_id 無 pending → active；無 user_id → ''
          const status = !uid ? '' : (invId ? 'pending' : 'active');
          return {
            id: String(e.id),
            name: String(e.name || ''),
            work_email: String(e.work_email || ''),
            department_id: String(e.department_id || ''),
            department_name: String(e.department_name || ''),
            job_title: String(e.job_title || ''),
            user_id: uid,
            user_status: status,
            invitation_id: invId,
          };
        })
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
    setEditingId(null); setForm({ ...EMPTY_FORM }); setFormError(''); setShowForm(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setForm({ name: emp.name, work_email: emp.work_email, department_id: emp.department_id, job_title: emp.job_title });
    setFormError(''); setShowForm(true);
  };

  const submit = async () => {
    if (!form.name.trim()) { setFormError('姓名為必填'); return; }
    if (form.work_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.work_email.trim())) { setFormError('Email 格式不正確'); return; }
    setSaving(true); setFormError('');
    try {
      const data: Record<string, any> = {
        name: form.name.trim(),
        work_email: form.work_email.trim() || '',
        department_id: form.department_id || '',
        job_title: form.job_title.trim() || '',
      };
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

  const setRow = (empId: string, patch: RowAction) =>
    setRowAction(prev => ({ ...prev, [empId]: { ...prev[empId], ...patch } }));

  const createInvite = async (emp: Employee) => {
    if (!emp.work_email) return;
    setRow(emp.id, { busy: true, err: '' });
    try {
      // 1. 建 pending user
      const u = await db.createInviteUser(emp.work_email, emp.name);
      // 2. 寫回 hr_employees.user_id
      await db.update('hr_employees', emp.id, { user_id: u.user_id });
      // 3. 取邀請連結
      const inv = await db.createInvitation(u.user_id, emp.name);
      setRow(emp.id, { busy: false, link: inv.chat_invite_link });
      await load();
    } catch (e: any) {
      setRow(emp.id, { busy: false, err: e?.message || '建立邀請失敗' });
    }
  };

  const revokeInvite = async (emp: Employee) => {
    if (!emp.invitation_id) return;
    if (!confirm(`撤銷對「${emp.name}」(${emp.work_email}) 的邀請？對方將無法再用此連結註冊。`)) return;
    setRow(emp.id, { busy: true, err: '' });
    try {
      await db.revokeInvitation(emp.invitation_id);
      // 同時清除 hr_employees.user_id，回到「未邀請」狀態
      await db.update('hr_employees', emp.id, { user_id: '' });
      setRow(emp.id, { busy: false, link: undefined });
      await load();
    } catch (e: any) {
      setRow(emp.id, { busy: false, err: e?.message || '撤銷失敗' });
    }
  };

  const copyLink = async (empId: string, link: string) => {
    try { await navigator.clipboard.writeText(link); }
    catch { prompt('請手動複製：', link); }
    setRow(empId, { copied: true });
    setTimeout(() => setRow(empId, { copied: false }), 2000);
  };

  const renderAccountCell = (e: Employee) => {
    const r = rowAction[e.id] || {};
    if (e.user_status === 'active') {
      return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">已啟用</span>;
    }
    if (e.user_status === 'disabled') {
      return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">已停用</span>;
    }
    if (e.user_status === 'pending') {
      // 待接受：可複製連結（若剛建立）+ 撤銷
      return (
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">邀請中</span>
          {r.link && (
            <button onClick={() => copyLink(e.id, r.link!)}
              className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded font-medium">
              {r.copied ? '已複製！' : '複製連結'}
            </button>
          )}
          <button onClick={() => revokeInvite(e)} disabled={r.busy}
            className="px-2 py-0.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded font-medium disabled:opacity-50">
            {r.busy ? '處理中...' : '撤銷'}
          </button>
        </div>
      );
    }
    // user_status === ''：尚無 user
    if (!e.work_email) {
      return <span className="text-xs text-gray-300">需先填 Email</span>;
    }
    return (
      <div className="flex flex-col items-center gap-1">
        <button onClick={() => createInvite(e)} disabled={r.busy}
          className="px-2 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded font-medium disabled:opacity-50">
          {r.busy ? '建立中...' : '建立邀請'}
        </button>
        {r.err && <span className="text-xs text-red-500">{r.err}</span>}
      </div>
    );
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
                  {filtered.map(e => (
                    <tr key={e.id} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {e.name}
                        {e.job_title && <span className="ml-2 text-xs text-gray-400">{e.job_title}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{e.work_email || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{e.department_name || '—'}</td>
                      <td className="px-4 py-3 text-center">{renderAccountCell(e)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(e)}
                          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
                          編輯
                        </button>
                      </td>
                    </tr>
                  ))}
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
                {!editingId && <p className="text-xs text-gray-400 mt-1">填入後可在列表建立邀請；對方接受後即可登入</p>}
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
