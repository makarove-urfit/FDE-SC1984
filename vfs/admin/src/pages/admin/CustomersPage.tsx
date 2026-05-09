import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';

const ORDERING_APP = 'https://ordering.apps.ai-go.app/ext-runtime';

type Customer = {
  id: string; name: string; vat: string; email: string;
  phone: string; payment_term: string; salesperson_id: string;
  contact_address: string; custom_data: any; is_company: boolean;
};
type Employee = { id: string; name: string; user_id: string; job_title: string };
type Tag = { id: string; name: string; custom_data: any };
type AppUser = { id: string; email: string; display_name: string };
type RelEntry = { rel_id: string; user_id: string; user_email: string; user_name: string };
type EditType = 'hq' | 'branch';

const INVOICE_FORMATS = ['紙本', '電子'];
const PAYMENT_TERMS = ['半月結', '整月結'];

type BranchEntry = {
  branch_name: string; phone: string; contact_address: string; region_tag_id: string;
  contact_name: string; contact_phone: string; contact_email: string;
};

const EMPTY_BRANCH: BranchEntry = {
  branch_name: '', phone: '', contact_address: '', region_tag_id: '',
  contact_name: '', contact_phone: '', contact_email: '',
};

const EMPTY_COMPANY = {
  headquarters_name: '', vat: '', owner_name: '',
  email: '', payment_term: '', salesperson_id: '', invoice_format: '',
};

const EMPTY_EDIT_HQ = {
  name: '', vat: '', email: '', payment_term: '', salesperson_id: '', invoice_format: '',
};
const EMPTY_EDIT_BRANCH = {
  name: '', phone: '', contact_address: '', region_tag_id: '', contact_email: '',
};

export default function CustomersPage() {
  const nav = useNavigate();
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [regionTags, setRegionTags] = useState<Tag[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [allRels, setAllRels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 新增表單
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [companyForm, setCompanyForm] = useState({ ...EMPTY_COMPANY });
  const [branchEntries, setBranchEntries] = useState<BranchEntry[]>([{ ...EMPTY_BRANCH }]);

  // 對既有總公司加分店
  const [addBranchTarget, setAddBranchTarget] = useState<Customer | null>(null);
  const [addBranchForm, setAddBranchForm] = useState<BranchEntry>({ ...EMPTY_BRANCH });
  const [addBranchSaving, setAddBranchSaving] = useState(false);
  const [addBranchError, setAddBranchError] = useState('');

  // 編輯 modal
  const [editTarget, setEditTarget] = useState<{ type: EditType; record: Customer } | null>(null);
  const [editHq, setEditHq] = useState({ ...EMPTY_EDIT_HQ });
  const [editBranch, setEditBranch] = useState({ ...EMPTY_EDIT_BRANCH });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  // 編輯 branch 時的「下單人員」管理
  const [branchRels, setBranchRels] = useState<RelEntry[]>([]);
  const [pickUserId, setPickUserId] = useState('');
  const [relBusy, setRelBusy] = useState(false);

  const [expandedHq, setExpandedHq] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [custs, depts, tags, users, rels] = await Promise.all([
        db.query('customers'),
        db.query('hr_departments'),
        db.query('customer_tags'),
        db.query('custom_app_users'),
        db.query('customer_custom_app_user_rel'),
      ]);

      const salesDept = (depts || []).find((d: any) => String(d.name || '').trim() === '業務');
      const salesDeptId = salesDept ? String(salesDept.id) : null;
      const allEmps = await db.query('hr_employees');
      const emps = (allEmps || [])
        .filter((e: any) => {
          if (e.active === false) return false;
          if (!salesDeptId) return true;
          const did = Array.isArray(e.department_id) ? e.department_id[0] : e.department_id;
          return String(did) === salesDeptId;
        });

      setAllCustomers(custs || []);
      setEmployees(emps.map((e: any) => ({
        id: String(e.id), name: String(e.name || ''),
        user_id: String(e.user_id || ''), job_title: String(e.job_title || ''),
      })));
      setRegionTags((tags || []).filter((t: any) => (t.custom_data || {}).category === 'region'));
      setAppUsers((users || []).map((u: any) => ({
        id: String(u.id), email: String(u.email || ''), display_name: String(u.display_name || ''),
      })));
      setAllRels(rels || []);
    } catch (e: any) {
      setError(e?.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const kind = (c: Customer) => String((c.custom_data || {}).kind || '');
  const headquarters = allCustomers.filter(c => kind(c) === 'headquarters');
  const branches = allCustomers.filter(c => kind(c) === 'branch');
  const branchesFor = (hqId: string) =>
    branches.filter(b => String((b.custom_data || {}).parent_customer_id || '') === hqId);

  const empName = (userId: string) => {
    if (!userId) return '—';
    const emp = employees.find(e => e.user_id === userId || e.id === userId);
    return emp?.name || '—';
  };

  const inviteLink = (token: string, email: string) => {
    if (!token) return '';
    const payload = btoa(JSON.stringify({ token, email: email || '' }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return `${ORDERING_APP}#ct=${payload}`;
  };

  const copyLink = async (token: string, email: string, branchId: string) => {
    const link = inviteLink(token, email);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(branchId);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      prompt('請手動複製以下連結：', link);
    }
  };

  const toggleExpand = (hqId: string) =>
    setExpandedHq(prev => {
      const next = new Set(prev);
      next.has(hqId) ? next.delete(hqId) : next.add(hqId);
      return next;
    });

  // ── 開啟編輯 ──
  const openEditHq = (c: Customer) => {
    setEditTarget({ type: 'hq', record: c });
    setEditHq({
      name: c.name || '',
      vat: c.vat || '',
      email: c.email || '',
      payment_term: c.payment_term || '',
      salesperson_id: c.salesperson_id || '',
      invoice_format: String((c.custom_data || {}).invoice_format || ''),
    });
    setEditError('');
  };

  const openEditBranch = (b: Customer) => {
    const cd = b.custom_data || {};
    setEditTarget({ type: 'branch', record: b });
    setEditBranch({
      name: b.name || '',
      phone: b.phone || '',
      contact_address: b.contact_address || '',
      region_tag_id: String(cd.region_tag_id || ''),
      contact_email: String(cd.contact_email || ''),
    });
    setEditError('');
    // 算該 branch 已綁的 user
    const userById = new Map(appUsers.map(u => [u.id, u]));
    const rels = allRels
      .filter(r => String(r.customer_id) === String(b.id))
      .map(r => {
        const u = userById.get(String(r.custom_app_user_id));
        return {
          rel_id: String(r.id),
          user_id: String(r.custom_app_user_id),
          user_email: u?.email || '(未知)',
          user_name: u?.display_name || '(未知)',
        };
      });
    setBranchRels(rels);
    setPickUserId('');
  };

  const handleAssignUser = async () => {
    if (!pickUserId || !editTarget || editTarget.type !== 'branch') return;
    setRelBusy(true);
    try {
      const created = await db.insert('customer_custom_app_user_rel', {
        customer_id: editTarget.record.id,
        custom_app_user_id: pickUserId,
      });
      const u = appUsers.find(x => x.id === pickUserId);
      const newEntry: RelEntry = {
        rel_id: String(created.id),
        user_id: pickUserId,
        user_email: u?.email || '',
        user_name: u?.display_name || '',
      };
      setBranchRels(prev => [...prev, newEntry]);
      setAllRels(prev => [...prev, { id: created.id, customer_id: editTarget.record.id, custom_app_user_id: pickUserId }]);
      setPickUserId('');
    } catch (e: any) {
      setEditError(e?.message || '指派失敗');
    } finally {
      setRelBusy(false);
    }
  };

  const handleUnassignUser = async (relId: string) => {
    setRelBusy(true);
    try {
      await db.deleteRow('customer_custom_app_user_rel', relId);
      setBranchRels(prev => prev.filter(r => r.rel_id !== relId));
      setAllRels(prev => prev.filter(r => String(r.id) !== relId));
    } catch (e: any) {
      setEditError(e?.message || '移除失敗');
    } finally {
      setRelBusy(false);
    }
  };

  // ── 儲存編輯 ──
  const saveEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true); setEditError('');
    try {
      const { type, record } = editTarget;
      if (type === 'hq') {
        if (!editHq.name.trim()) { setEditError('公司名稱為必填'); setEditSaving(false); return; }
        if (editHq.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editHq.email.trim())) { setEditError('Email 格式不正確'); setEditSaving(false); return; }
        await db.update('customers', record.id, {
          name: editHq.name.trim(),
          vat: editHq.vat.trim(),
          email: editHq.email.trim(),
          payment_term: editHq.payment_term,
          salesperson_id: editHq.salesperson_id,
          custom_data: { ...(record.custom_data || {}), invoice_format: editHq.invoice_format },
        });
      } else {
        if (!editBranch.name.trim()) { setEditError('店名為必填'); setEditSaving(false); return; }
        if (editBranch.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editBranch.contact_email.trim())) { setEditError('Email 格式不正確'); setEditSaving(false); return; }
        const cd = record.custom_data || {};
        await db.update('customers', record.id, {
          name: editBranch.name.trim(),
          phone: editBranch.phone.trim(),
          contact_address: editBranch.contact_address.trim(),
          custom_data: {
            ...cd,
            region_tag_id: editBranch.region_tag_id || null,
            contact_email: editBranch.contact_email.trim() || null,
          },
        });
      }
      setEditTarget(null);
      await load();
    } catch (e: any) {
      setEditError(e?.message || '儲存失敗');
    } finally {
      setEditSaving(false);
    }
  };

  // ── 新增表單 ──
  const fc = (k: keyof typeof EMPTY_COMPANY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setCompanyForm(prev => ({ ...prev, [k]: e.target.value }));

  const fb = (i: number, k: keyof BranchEntry) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setBranchEntries(prev => prev.map((b, idx) => idx === i ? { ...b, [k]: e.target.value } : b));

  const addBranchEntry = () => setBranchEntries(prev => [...prev, { ...EMPTY_BRANCH }]);
  const removeBranchEntry = (i: number) => setBranchEntries(prev => prev.filter((_, idx) => idx !== i));

  const insertBranchAndContact = async (parentHqId: string, b: BranchEntry) => {
    const inviteToken = crypto.randomUUID();
    const branch = await db.insert('customers', {
      name: b.branch_name.trim(),
      is_company: false,
      customer_type: 'individual',
      ...(b.phone ? { phone: b.phone } : {}),
      ...(b.contact_address ? { contact_address: b.contact_address } : {}),
      custom_data: {
        kind: 'branch',
        parent_customer_id: String(parentHqId),
        invite_token: inviteToken,
        ...(b.contact_email.trim() ? { contact_email: b.contact_email.trim() } : {}),
        ...(b.region_tag_id ? { region_tag_id: b.region_tag_id } : {}),
      },
    });
    if (b.contact_name.trim()) {
      await db.insert('customers', {
        name: b.contact_name.trim(),
        is_company: false,
        customer_type: 'individual',
        ...(b.contact_phone ? { phone: b.contact_phone } : {}),
        custom_data: { kind: 'role', role: 'contact', parent_customer_id: String(branch.id) },
      });
    }
    return branch;
  };

  const submit = async () => {
    if (!companyForm.headquarters_name.trim()) { setFormError('公司名稱為必填'); return; }
    if (companyForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyForm.email.trim())) {
      setFormError('公司 Email 格式不正確'); return;
    }
    const validBranches = branchEntries.filter(b => b.branch_name.trim());
    if (validBranches.length === 0) { setFormError('至少需要一間分店（請至少填一個店名）'); return; }
    for (const b of validBranches) {
      if (b.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.contact_email.trim())) {
        setFormError(`分店「${b.branch_name}」的下單帳號信箱格式不正確`); return;
      }
    }
    setSaving(true); setFormError('');
    try {
      const hq = await db.insert('customers', {
        name: companyForm.headquarters_name.trim(),
        is_company: true,
        customer_type: 'company',
        ...(companyForm.vat ? { vat: companyForm.vat } : {}),
        ...(companyForm.email ? { email: companyForm.email } : {}),
        ...(companyForm.payment_term ? { payment_term: companyForm.payment_term } : {}),
        ...(companyForm.salesperson_id ? { salesperson_id: companyForm.salesperson_id } : {}),
        custom_data: { kind: 'headquarters', invoice_format: companyForm.invoice_format },
      });

      for (const b of validBranches) {
        await insertBranchAndContact(String(hq.id), b);
      }

      if (companyForm.owner_name.trim()) {
        await db.insert('customers', {
          name: companyForm.owner_name.trim(),
          is_company: false,
          customer_type: 'individual',
          custom_data: { kind: 'role', role: 'owner', parent_customer_id: String(hq.id) },
        });
      }

      setShowForm(false);
      setCompanyForm({ ...EMPTY_COMPANY });
      setBranchEntries([{ ...EMPTY_BRANCH }]);
      await load();
    } catch (e: any) {
      setFormError(e?.message || '新增失敗');
    } finally {
      setSaving(false);
    }
  };

  const submitAddBranch = async () => {
    if (!addBranchTarget) return;
    if (!addBranchForm.branch_name.trim()) { setAddBranchError('店名為必填'); return; }
    if (addBranchForm.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addBranchForm.contact_email.trim())) {
      setAddBranchError('下單帳號信箱格式不正確'); return;
    }
    setAddBranchSaving(true); setAddBranchError('');
    try {
      await insertBranchAndContact(String(addBranchTarget.id), addBranchForm);
      setExpandedHq(prev => new Set([...prev, addBranchTarget.id]));
      setAddBranchTarget(null);
      setAddBranchForm({ ...EMPTY_BRANCH });
      await load();
    } catch (e: any) {
      setAddBranchError(e?.message || '新增失敗');
    } finally {
      setAddBranchSaving(false);
    }
  };

  const inputCls = "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500";
  const selectCls = inputCls + " bg-white";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
            <h1 className="text-xl font-bold text-gray-900">客戶管理</h1>
          </div>
          <button onClick={() => { setCompanyForm({ ...EMPTY_COMPANY }); setBranchEntries([{ ...EMPTY_BRANCH }]); setFormError(''); setShowForm(true); }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            + 新增客戶
          </button>
        </div>
      </header>

      <div className="p-6 max-w-6xl mx-auto space-y-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>}
        {loading ? (
          <p className="text-gray-400 text-center py-12">載入中...</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {headquarters.length === 0 ? (
              <div className="text-center text-gray-400 py-12">尚無客戶資料，點選右上角「新增客戶」開始建立</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">公司名稱</th>
                    <th className="px-4 py-3 text-left">統編</th>
                    <th className="px-4 py-3 text-left">業務員</th>
                    <th className="px-4 py-3 text-left">結帳方式</th>
                    <th className="px-4 py-3 text-center w-16">分店</th>
                    <th className="px-4 py-3 text-left">聯絡資訊</th>
                    <th className="px-4 py-3 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {headquarters.map(c => {
                    const bs = branchesFor(c.id);
                    const expanded = expandedHq.has(c.id);
                    return (
                      <>
                        <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {bs.length > 0 && (
                              <button onClick={() => toggleExpand(c.id)}
                                className="mr-2 text-gray-400 hover:text-gray-600 text-xs">
                                {expanded ? '▼' : '▶'}
                              </button>
                            )}
                            {c.name}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{c.vat || '—'}</td>
                          <td className="px-4 py-3 text-gray-700">{empName(c.salesperson_id)}</td>
                          <td className="px-4 py-3 text-gray-700">{c.payment_term || '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-center">{bs.length}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {c.email && <div>{c.email}</div>}
                            {c.phone && <div>{c.phone}</div>}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => {
                                setAddBranchForm({ ...EMPTY_BRANCH });
                                setAddBranchError('');
                                setAddBranchTarget(c);
                              }}
                              className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 mr-1"
                            >
                              + 分店
                            </button>
                            <button onClick={() => openEditHq(c)}
                              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
                              編輯
                            </button>
                          </td>
                        </tr>
                        {expanded && bs.map(b => {
                          const token = String((b.custom_data || {}).invite_token || '');
                          const bEmail = String((b.custom_data || {}).contact_email || '');
                          return (
                            <tr key={b.id} className="bg-gray-50 border-t border-gray-100">
                              <td className="pl-10 pr-4 py-2 text-gray-600 text-xs" colSpan={2}>
                                <span className="text-gray-400 mr-1">└</span>{b.name}
                                {b.contact_address && <span className="text-gray-400 ml-2">{b.contact_address}</span>}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {b.phone || '—'}
                                {bEmail && <div className="text-gray-400">{bEmail}</div>}
                              </td>
                              <td className="px-4 py-2" colSpan={2}></td>
                              <td className="px-4 py-2 text-right">
                                {token ? (
                                  <button onClick={() => copyLink(token, bEmail, b.id)}
                                    className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                                      copied === b.id ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                    }`}>
                                    {copied === b.id ? '✓ 已複製' : '複製邀請連結'}
                                  </button>
                                ) : (
                                  <span className="text-xs text-gray-300">無連結</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <button onClick={() => openEditBranch(b)}
                                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
                                  編輯
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── 編輯 Modal ── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg"
            style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100" style={{ flexShrink: 0 }}>
              <h2 className="text-lg font-bold text-gray-900">
                {editTarget.type === 'hq' ? '編輯公司資訊' : '編輯分店資訊'}
              </h2>
              <button onClick={() => setEditTarget(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4" style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0 }}>
              {editTarget.type === 'hq' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">公司名稱 <span className="text-red-500">*</span></label>
                    <input type="text" value={editHq.name} onChange={e => setEditHq(p => ({ ...p, name: e.target.value }))} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">統編</label>
                      <input type="text" value={editHq.vat} onChange={e => setEditHq(p => ({ ...p, vat: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">電子發票信箱</label>
                      <input type="email" value={editHq.email} onChange={e => setEditHq(p => ({ ...p, email: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">結帳方式</label>
                      <select value={editHq.payment_term} onChange={e => setEditHq(p => ({ ...p, payment_term: e.target.value }))} className={selectCls}>
                        <option value="">（請選擇）</option>
                        {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">貨單形式</label>
                      <select value={editHq.invoice_format} onChange={e => setEditHq(p => ({ ...p, invoice_format: e.target.value }))} className={selectCls}>
                        <option value="">（請選擇）</option>
                        {INVOICE_FORMATS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">業務員</label>
                    <select value={editHq.salesperson_id} onChange={e => setEditHq(p => ({ ...p, salesperson_id: e.target.value }))} className={selectCls}>
                      <option value="">（請選擇）</option>
                      {employees.map(e => (
                        <option key={e.id} value={e.id}>{e.name}{e.job_title ? ` · ${e.job_title}` : ''}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">店名 <span className="text-red-500">*</span></label>
                    <input type="text" value={editBranch.name} onChange={e => setEditBranch(p => ({ ...p, name: e.target.value }))} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">電話</label>
                      <input type="tel" value={editBranch.phone} onChange={e => setEditBranch(p => ({ ...p, phone: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">路線（配送區域）</label>
                      <select value={editBranch.region_tag_id} onChange={e => setEditBranch(p => ({ ...p, region_tag_id: e.target.value }))} className={selectCls}>
                        <option value="">（請選擇）</option>
                        {regionTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
                    <input type="text" value={editBranch.contact_address} onChange={e => setEditBranch(p => ({ ...p, contact_address: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">下單帳號信箱</label>
                    <input type="email" value={editBranch.contact_email} onChange={e => setEditBranch(p => ({ ...p, contact_email: e.target.value }))} className={inputCls} />
                    <p className="text-xs text-gray-400 mt-1">用於產生邀請連結時帶入 Email；LIFF 上線後將廢棄。</p>
                  </div>

                  <div className="border-t border-gray-200 pt-4 mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">下單人員</label>
                      <span className="text-xs text-gray-400">已指派 {branchRels.length} 人</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">綁定哪些下單帳號可代表這間分店下單。新人員必須先註冊（透過邀請連結或 LIFF）才能被選擇。</p>
                    <div className="space-y-2">
                      {branchRels.length === 0 ? (
                        <p className="text-xs text-gray-400 italic px-2 py-3 bg-gray-50 rounded-lg text-center">尚未指派任何下單人員</p>
                      ) : (
                        branchRels.map(r => (
                          <div key={r.rel_id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                            <div className="text-sm">
                              <span className="font-medium text-gray-800">{r.user_name || '(未填名)'}</span>
                              <span className="text-gray-400 ml-2 text-xs">{r.user_email}</span>
                            </div>
                            <button
                              type="button" disabled={relBusy}
                              onClick={() => handleUnassignUser(r.rel_id)}
                              className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
                            >
                              移除
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <select
                        value={pickUserId}
                        onChange={e => setPickUserId(e.target.value)}
                        className={selectCls + ' flex-1'}
                        disabled={relBusy}
                      >
                        <option value="">（選擇下單帳號…）</option>
                        {appUsers
                          .filter(u => !branchRels.some(r => r.user_id === u.id))
                          .map(u => (
                            <option key={u.id} value={u.id}>
                              {u.display_name || '(未填名)'}（{u.email}）
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAssignUser}
                        disabled={!pickUserId || relBusy}
                        className="px-3 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium disabled:opacity-50"
                      >
                        {relBusy ? '...' : '+ 加入'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {editError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{editError}</div>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3" style={{ flexShrink: 0 }}>
              <button onClick={() => setEditTarget(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={saveEdit} disabled={editSaving}
                className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium disabled:opacity-50">
                {editSaving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 新增表單 ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl"
            style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100" style={{ flexShrink: 0 }}>
              <h2 className="text-lg font-bold text-gray-900">新增客戶</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-6" style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0 }}>
              <section>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">公司資訊</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">公司營業登記名稱 <span className="text-red-500">*</span></label>
                    <input type="text" value={companyForm.headquarters_name} onChange={fc('headquarters_name')}
                      placeholder="如：家樂福股份有限公司" className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">統編</label>
                      <input type="text" value={companyForm.vat} onChange={fc('vat')} placeholder="12345678" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">電子發票信箱</label>
                      <input type="email" value={companyForm.email} onChange={fc('email')} placeholder="invoice@company.com" className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">結帳方式</label>
                      <select value={companyForm.payment_term} onChange={fc('payment_term')} className={selectCls}>
                        <option value="">（請選擇）</option>
                        {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">貨單形式</label>
                      <select value={companyForm.invoice_format} onChange={fc('invoice_format')} className={selectCls}>
                        <option value="">（請選擇）</option>
                        {INVOICE_FORMATS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">業務員</label>
                      <select value={companyForm.salesperson_id} onChange={fc('salesperson_id')} className={selectCls}>
                        <option value="">（請選擇）</option>
                        {employees.map(e => (
                          <option key={e.id} value={e.id}>{e.name}{e.job_title ? ` · ${e.job_title}` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">公司負責人姓名</label>
                      <input type="text" value={companyForm.owner_name} onChange={fc('owner_name')} placeholder="王大明" className={inputCls} />
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">分店資訊</h3>
                  <button type="button" onClick={addBranchEntry}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    + 新增另一間分店
                  </button>
                </div>
                <div className="space-y-4">
                  {branchEntries.map((b, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-3" style={{ background: '#fafafa' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-700">分店 {i + 1}</span>
                        {branchEntries.length > 1 && (
                          <button type="button" onClick={() => removeBranchEntry(i)}
                            className="text-xs text-red-500 hover:text-red-700">
                            移除
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">店名 <span className="text-red-500">*</span></label>
                          <input type="text" value={b.branch_name} onChange={fb(i, 'branch_name')}
                            placeholder="如：家樂福 — 內湖店" className={inputCls} />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">店內市話</label>
                          <input type="tel" value={b.phone} onChange={fb(i, 'phone')}
                            placeholder="02-12345678" className={inputCls} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
                        <input type="text" value={b.contact_address} onChange={fb(i, 'contact_address')}
                          placeholder="台北市內湖區..." className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">路線（配送區域）</label>
                        <select value={b.region_tag_id} onChange={fb(i, 'region_tag_id')} className={selectCls}>
                          <option value="">（請選擇）</option>
                          {regionTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <div className="border-t border-gray-200 pt-3 mt-3">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">店內聯絡人</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">聯絡人姓名</label>
                            <input type="text" value={b.contact_name} onChange={fb(i, 'contact_name')}
                              placeholder="陳小華" className={inputCls} />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">聯絡電話</label>
                            <input type="tel" value={b.contact_phone} onChange={fb(i, 'contact_phone')}
                              placeholder="0912-345-678" className={inputCls} />
                          </div>
                        </div>
                        <div className="mt-3">
                          <label className="block text-sm font-medium text-gray-700 mb-1">下單帳號信箱</label>
                          <input type="email" value={b.contact_email} onChange={fb(i, 'contact_email')}
                            placeholder="contact@store.com" className={inputCls} />
                          <p className="text-xs text-gray-400 mt-1">填入後邀請連結會帶入此 Email 供客戶設定密碼</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {formError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{formError}</div>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3" style={{ flexShrink: 0 }}>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={submit} disabled={saving}
                className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium disabled:opacity-50">
                {saving ? '建立中...' : '建立客戶'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 對既有總公司加分店 Modal ── */}
      {addBranchTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg"
            style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100" style={{ flexShrink: 0 }}>
              <h2 className="text-lg font-bold text-gray-900">新增分店 — {addBranchTarget.name}</h2>
              <button onClick={() => setAddBranchTarget(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4" style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0 }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">店名 <span className="text-red-500">*</span></label>
                  <input type="text" value={addBranchForm.branch_name}
                    onChange={e => setAddBranchForm(p => ({ ...p, branch_name: e.target.value }))}
                    placeholder="如：家樂福 — 內湖店" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">店內市話</label>
                  <input type="tel" value={addBranchForm.phone}
                    onChange={e => setAddBranchForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="02-12345678" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
                <input type="text" value={addBranchForm.contact_address}
                  onChange={e => setAddBranchForm(p => ({ ...p, contact_address: e.target.value }))}
                  placeholder="台北市內湖區..." className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">路線（配送區域）</label>
                <select value={addBranchForm.region_tag_id}
                  onChange={e => setAddBranchForm(p => ({ ...p, region_tag_id: e.target.value }))}
                  className={selectCls}>
                  <option value="">（請選擇）</option>
                  {regionTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="border-t border-gray-200 pt-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">店內聯絡人</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">聯絡人姓名</label>
                    <input type="text" value={addBranchForm.contact_name}
                      onChange={e => setAddBranchForm(p => ({ ...p, contact_name: e.target.value }))}
                      placeholder="陳小華" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">聯絡電話</label>
                    <input type="tel" value={addBranchForm.contact_phone}
                      onChange={e => setAddBranchForm(p => ({ ...p, contact_phone: e.target.value }))}
                      placeholder="0912-345-678" className={inputCls} />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">下單帳號信箱</label>
                  <input type="email" value={addBranchForm.contact_email}
                    onChange={e => setAddBranchForm(p => ({ ...p, contact_email: e.target.value }))}
                    placeholder="contact@store.com" className={inputCls} />
                  <p className="text-xs text-gray-400 mt-1">填入後邀請連結會帶入此 Email 供客戶設定密碼</p>
                </div>
              </div>

              {addBranchError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{addBranchError}</div>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3" style={{ flexShrink: 0 }}>
              <button onClick={() => setAddBranchTarget(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={submitAddBranch} disabled={addBranchSaving}
                className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium disabled:opacity-50">
                {addBranchSaving ? '建立中...' : '建立分店'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
