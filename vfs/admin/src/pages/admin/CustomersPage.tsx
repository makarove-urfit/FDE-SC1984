import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';
import { planRouteChange } from '../../utils/routeChange';
import { sealedCodeHistory } from '../../utils/codeHistory';
import { vatFormatHint } from '../../utils/vat';

// LIFF URL — 點擊後 LINE SDK 處理 OAuth、平台 /liff-swap 換 token、ordering 走 redeem_invite_token 綁定
// invite=<branch.custom_data.invite_token>；不再走舊 #ct=base64({token,email}) 格式
const LIFF_INVITE_URL = 'https://liff.line.me/2009976374-VYUpM905';

type Customer = {
  id: string; name: string; short_name?: string; vat: string; email: string;
  phone: string; payment_term: string; salesperson_id: string;
  contact_address: string; custom_data: any; is_company: boolean;
  ref?: string;
};
type Employee = { id: string; name: string; user_id: string; job_title: string };
type Tag = { id: string; name: string; custom_data: any };
type AppUser = { id: string; email: string; display_name: string };
type RelEntry = { rel_id: string; user_id: string; user_email: string; user_name: string };
type EditType = 'hq' | 'branch';

const INVOICE_FORMATS = ['紙本', '電子'];
const PAYMENT_TERMS = ['半月結', '整月結'];

type BranchEntry = {
  branch_name: string; vat: string; phone: string; contact_address: string; region_tag_id: string;
  contact_name: string; contact_phone: string; contact_email: string;
};

const EMPTY_BRANCH: BranchEntry = {
  branch_name: '', vat: '', phone: '', contact_address: '', region_tag_id: '',
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
  name: '', vat: '', short_name: '', phone: '', contact_address: '', region_tag_id: '', contact_email: '',
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

  const inviteLink = (token: string, _email: string) => {
    if (!token) return '';
    // email 參數已過時（LIFF 流程不需要、由 LINE OAuth 自動取得身分），保留簽名只是不破壞既有 callers
    return `${LIFF_INVITE_URL}?invite=${token}`;
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
      vat: b.vat || '',
      short_name: b.short_name || '',
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
        if (vatFormatHint(editHq.vat)) { setEditError(`統編：${vatFormatHint(editHq.vat)}`); setEditSaving(false); return; }
        if (!editHq.vat.trim()) { setEditError('統編為必填'); setEditSaving(false); return; }
        const hqRes = await db.runAction('update_customer', {
          customer_id: String(record.id),
          fields: {
            name: editHq.name.trim(),
            vat: editHq.vat.trim(),
            email: editHq.email.trim(),
            payment_term: editHq.payment_term,
            salesperson_id: editHq.salesperson_id,
            custom_data: { ...(record.custom_data || {}), invoice_format: editHq.invoice_format },
          },
        });
        if (hqRes?.error) { setEditError(hqRes.error); setEditSaving(false); return; }
      } else {
        if (!editBranch.name.trim()) { setEditError('店名為必填'); setEditSaving(false); return; }
        if (editBranch.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editBranch.contact_email.trim())) { setEditError('Email 格式不正確'); setEditSaving(false); return; }
        if (!editBranch.vat.trim()) { setEditError('統編為必填'); setEditSaving(false); return; }
        if (vatFormatHint(editBranch.vat)) { setEditError(`統編：${vatFormatHint(editBranch.vat)}`); setEditSaving(false); return; }
        const cd = record.custom_data || {};
        const newRegionTagId = String(editBranch.region_tag_id || '');
        // 判定路線變更該走「首次發碼 / 搬路線 / 不動作」哪一條
        const plan = planRouteChange({
          ref: String(record.ref || ''),
          oldRegionTagId: String(cd.region_tag_id || ''),
          newRegionTagId,
        });
        if (plan.action !== 'none' && !window.confirm(plan.confirmMessage)) {
          setEditSaving(false);
          return;
        }

        // 先更新一般欄位（custom_data 含 contact_email）。
        // region_tag_id 只在不發碼/不搬路線時於此寫入；否則交給 action，
        // 且 action 內部會 re-read 此次寫入結果，contact_email 不會掉。
        const newCustomData = { ...cd, contact_email: editBranch.contact_email.trim() || null };
        if (plan.action === 'none') {
          newCustomData.region_tag_id = newRegionTagId || null;
        }
        const brRes = await db.runAction('update_customer', {
          customer_id: String(record.id),
          fields: {
            name: editBranch.name.trim(),
            vat: editBranch.vat.trim(),
            short_name: editBranch.short_name.trim() || null,
            phone: editBranch.phone.trim(),
            contact_address: editBranch.contact_address.trim(),
            custom_data: newCustomData,
          },
        });
        if (brRes?.error) { setEditError(brRes.error); setEditSaving(false); return; }

        // 再由 server-side action 發碼／搬路線（最後一筆寫入，不會被覆蓋）
        if (plan.action === 'assign') {
          try {
            const r = await db.runAction('assign_customer_code', {
              customer_id: String(record.id),
              route_tag_id: newRegionTagId,
            });
            if (r?.error) { setEditError(`發碼失敗：${r.error}`); setEditSaving(false); return; }
            if (r?.code) { alert(`已發放客戶編碼：${r.code}`); }
          } catch (e: any) {
            setEditError(`發碼失敗：${e?.message || e}`); setEditSaving(false); return;
          }
        } else if (plan.action === 'reassign') {
          try {
            const r = await db.runAction('reassign_customer_route', {
              customer_id: String(record.id),
              new_route_tag_id: newRegionTagId,
            });
            if (r?.error) { setEditError(`搬路線失敗：${r.error}`); setEditSaving(false); return; }
            if (r?.old_code && r?.new_code) { alert(`已重新發碼：${r.old_code} → ${r.new_code}`); }
          } catch (e: any) {
            setEditError(`搬路線失敗：${e?.message || e}`); setEditSaving(false); return;
          }
        }
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

  // bundle action 已建好分店；此處依各分店路線自動發放客戶編碼（失敗不阻斷）
  const assignCodesForBranches = async (
    branches: { branch_id: string; region_tag_id: string }[],
  ) => {
    for (const br of branches) {
      if (!br.region_tag_id || !br.branch_id) continue;
      try {
        const r = await db.runAction('assign_customer_code', {
          customer_id: String(br.branch_id),
          route_tag_id: String(br.region_tag_id),
        });
        if (r?.error) {
          alert(`分店已建立，但客戶編碼自動發放失敗：${r.error}\n請至客戶頁手動補發。`);
        }
      } catch (e: any) {
        alert(`分店已建立，但客戶編碼自動發放失敗：${e?.message || e}\n請至客戶頁手動補發。`);
      }
    }
  };

  const submit = async () => {
    if (!companyForm.headquarters_name.trim()) { setFormError('公司名稱為必填'); return; }
    if (companyForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyForm.email.trim())) {
      setFormError('公司 Email 格式不正確'); return;
    }
    if (vatFormatHint(companyForm.vat)) { setFormError(`公司統編：${vatFormatHint(companyForm.vat)}`); return; }
    if (!companyForm.vat.trim()) { setFormError('公司統編為必填'); return; }
    const validBranches = branchEntries.filter(b => b.branch_name.trim());
    if (validBranches.length === 0) { setFormError('至少需要一間分店（請至少填一個店名）'); return; }
    for (const b of validBranches) {
      if (!b.vat.trim()) { setFormError(`分店「${b.branch_name}」統編為必填`); return; }
      if (vatFormatHint(b.vat)) { setFormError(`分店「${b.branch_name}」統編：${vatFormatHint(b.vat)}`); return; }
      if (b.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.contact_email.trim())) {
        setFormError(`分店「${b.branch_name}」的聯絡 Email格式不正確`); return;
      }
    }
    setSaving(true); setFormError('');
    try {
      const res = await db.runAction('create_customer_bundle', {
        headquarters_name: companyForm.headquarters_name.trim(),
        vat: companyForm.vat.trim(),
        email: companyForm.email.trim(),
        payment_term: companyForm.payment_term,
        salesperson_id: companyForm.salesperson_id,
        invoice_format: companyForm.invoice_format,
        owner_name: companyForm.owner_name.trim(),
        branches: validBranches.map(b => ({
          branch_name: b.branch_name.trim(),
          vat: b.vat.trim(),
          phone: b.phone.trim(),
          contact_address: b.contact_address.trim(),
          region_tag_id: b.region_tag_id,
          contact_name: b.contact_name.trim(),
          contact_phone: b.contact_phone.trim(),
          contact_email: b.contact_email.trim(),
        })),
      });
      if (res?.error) { setFormError(res.error); setSaving(false); return; }
      await assignCodesForBranches(res?.branches || []);
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
    if (!addBranchForm.vat.trim()) { setAddBranchError('統編為必填'); return; }
    if (vatFormatHint(addBranchForm.vat)) { setAddBranchError(`統編：${vatFormatHint(addBranchForm.vat)}`); return; }
    if (addBranchForm.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addBranchForm.contact_email.trim())) {
      setAddBranchError('聯絡 Email格式不正確'); return;
    }
    setAddBranchSaving(true); setAddBranchError('');
    try {
      const res = await db.runAction('create_customer_bundle', {
        headquarters_id: String(addBranchTarget.id),
        branches: [{
          branch_name: addBranchForm.branch_name.trim(),
          vat: addBranchForm.vat.trim(),
          phone: addBranchForm.phone.trim(),
          contact_address: addBranchForm.contact_address.trim(),
          region_tag_id: addBranchForm.region_tag_id,
          contact_name: addBranchForm.contact_name.trim(),
          contact_phone: addBranchForm.contact_phone.trim(),
          contact_email: addBranchForm.contact_email.trim(),
        }],
      });
      if (res?.error) { setAddBranchError(res.error); setAddBranchSaving(false); return; }
      await assignCodesForBranches(res?.branches || []);
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
                                <span className="text-gray-400 mr-1">└</span>
                                <span className="font-mono text-blue-700 text-xs mr-2">{b.ref || '（未發碼）'}</span>
                                {b.name}
                                {b.contact_address && <span className="text-gray-400 ml-2">{b.contact_address}</span>}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {b.phone || '—'}
                                {bEmail && <div className="text-gray-400">{bEmail}</div>}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500" colSpan={2}>
                                {b.vat ? <span>統編 {b.vat}</span> : <span className="text-gray-300">無統編</span>}
                              </td>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">統編 <span className="text-red-500">*</span></label>
                      <input type="text" value={editHq.vat} onChange={e => setEditHq(p => ({ ...p, vat: e.target.value }))} className={inputCls} />
                      {editHq.vat.trim() && vatFormatHint(editHq.vat) && (
                        <p className="text-xs text-red-500 mt-1">{vatFormatHint(editHq.vat)}</p>
                      )}
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">統編 <span className="text-red-500">*</span></label>
                    <input type="text" placeholder="8 位數字" value={editBranch.vat} onChange={e => setEditBranch(p => ({ ...p, vat: e.target.value }))} className={inputCls} />
                    {editBranch.vat.trim() && vatFormatHint(editBranch.vat) && (
                      <p className="text-xs text-red-500 mt-1">{vatFormatHint(editBranch.vat)}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">採購單顯示簡稱</label>
                    <input type="text" value={editBranch.short_name} onChange={e => setEditBranch(p => ({ ...p, short_name: e.target.value }))} placeholder="例：王品台南" className={inputCls} />
                    <p className="text-xs text-gray-400 mt-1">採購單上以「路線碼+簡稱」顯示（如 C60王品台南）；未填則取店名前 3 字。</p>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">客戶編碼</label>
                    <div className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50">
                      {String(editTarget.record.ref || '').trim()
                        ? <span className="font-mono text-blue-700">{editTarget.record.ref}</span>
                        : <span className="text-gray-400">（未發碼）</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">系統自動管理，改路線時自動發碼/封存，不可手動編輯</p>
                  </div>
                  {sealedCodeHistory(editTarget.record).length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">曾用編碼</label>
                      <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 space-y-1">
                        {sealedCodeHistory(editTarget.record).map((h, i) => (
                          <div key={i} className="text-xs text-gray-500">
                            <span className="font-mono">{h.code}</span> · {h.since} ~ {h.until} 封存
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
                    <input type="text" value={editBranch.contact_address} onChange={e => setEditBranch(p => ({ ...p, contact_address: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">聯絡 Email</label>
                    <input type="email" value={editBranch.contact_email} onChange={e => setEditBranch(p => ({ ...p, contact_email: e.target.value }))} className={inputCls} />
                    <p className="text-xs text-gray-400 mt-1">客戶聯絡用 Email；保留以供日後功能使用</p>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">統編 <span className="text-red-500">*</span></label>
                      <input type="text" value={companyForm.vat} onChange={fc('vat')} placeholder="12345678" className={inputCls} />
                      {companyForm.vat.trim() && vatFormatHint(companyForm.vat) && (
                        <p className="text-xs text-red-500 mt-1">{vatFormatHint(companyForm.vat)}</p>
                      )}
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">統編 <span className="text-red-500">*</span></label>
                        <input type="text" value={b.vat} onChange={fb(i, 'vat')}
                          placeholder="8 位數字" className={inputCls} />
                        {b.vat.trim() && vatFormatHint(b.vat) && (
                          <p className="text-xs text-red-500 mt-1">{vatFormatHint(b.vat)}</p>
                        )}
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
                          <label className="block text-sm font-medium text-gray-700 mb-1">聯絡 Email</label>
                          <input type="email" value={b.contact_email} onChange={fb(i, 'contact_email')}
                            placeholder="contact@store.com" className={inputCls} />
                          <p className="text-xs text-gray-400 mt-1">客戶聯絡用 Email；保留以供日後功能使用</p>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">統編 <span className="text-red-500">*</span></label>
                <input type="text" value={addBranchForm.vat}
                  onChange={e => setAddBranchForm(p => ({ ...p, vat: e.target.value }))}
                  placeholder="8 位數字" className={inputCls} />
                {addBranchForm.vat.trim() && vatFormatHint(addBranchForm.vat) && (
                  <p className="text-xs text-red-500 mt-1">{vatFormatHint(addBranchForm.vat)}</p>
                )}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">聯絡 Email</label>
                  <input type="email" value={addBranchForm.contact_email}
                    onChange={e => setAddBranchForm(p => ({ ...p, contact_email: e.target.value }))}
                    placeholder="contact@store.com" className={inputCls} />
                  <p className="text-xs text-gray-400 mt-1">客戶聯絡用 Email；保留以供日後功能使用</p>
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
