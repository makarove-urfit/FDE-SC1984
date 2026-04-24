import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';

type Customer = {
  id: string; name: string; vat: string; email: string;
  phone: string; payment_term: string; salesperson_id: string; kind: string;
};
type Branch = {
  id: string; name: string; contact_address: string;
  phone: string; parent_customer_id: string; invite_token: string;
};
type Employee = { id: string; name: string; user_id: string; job_title: string };
type Tag = { id: string; name: string; custom_data: any };

const INVOICE_FORMATS = ['二聯式', '三聯式', '電子發票'];
const PAYMENT_TERMS = ['月結30天', '月結60天', '現金', '匯款'];

const EMPTY_FORM = {
  headquarters_name: '', vat: '', owner_name: '',
  branch_name: '', contact_address: '', phone: '',
  contact_name: '', contact_phone: '',
  email: '', payment_term: '', salesperson_id: '',
  invoice_format: '', region_tag_id: '',
};

export default function CustomersPage() {
  const nav = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [regionTags, setRegionTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [liffUrl, setLiffUrl] = useState('');
  const [expandedHq, setExpandedHq] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [custRes, empRes, tagRes, cfgRes] = await Promise.all([
        db.runAction('list_customers_for_me', {}),
        db.runAction('list_employees', {}),
        db.query('customer_tags'),
        db.runAction('system_config_get', { key: 'ordering.liff_url' }).catch(() => null),
      ]);
      setCustomers(custRes?.customers || []);
      setBranches(custRes?.branches || []);
      setEmployees(empRes?.employees || []);
      setLiffUrl(cfgRes?.value || '');
      setRegionTags((tagRes || []).filter((t: any) =>
        (t.custom_data || {}).category === 'region'
      ));
    } catch (e: any) {
      setError(e?.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const empName = (userId: string) => {
    if (!userId) return '—';
    const emp = employees.find(e => e.user_id === userId || e.id === userId);
    return emp?.name || '—';
  };

  const branchesFor = (hqId: string) => branches.filter(b => b.parent_customer_id === hqId);

  const inviteLink = (token: string) =>
    token ? `${liffUrl || window.location.origin}?token=${token}` : '';

  const copyLink = async (token: string, branchId: string) => {
    const link = inviteLink(token);
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

  const f = (k: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));

  const openForm = () => {
    setForm({ ...EMPTY_FORM });
    setFormError('');
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.headquarters_name.trim()) { setFormError('公司名稱為必填'); return; }
    if (!form.branch_name.trim()) { setFormError('店名為必填'); return; }
    setSaving(true); setFormError('');
    try {
      await db.runAction('create_customer_bundle', form);
      setShowForm(false);
      await load();
    } catch (e: any) {
      setFormError(e?.message || '新增失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
            <h1 className="text-xl font-bold text-gray-900">客戶管理</h1>
          </div>
          <button onClick={openForm}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            + 新增客戶
          </button>
        </div>
      </header>

      <div className="p-6 max-w-6xl mx-auto space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>
        )}
        {loading ? (
          <p className="text-gray-400 text-center py-12">載入中...</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {customers.length === 0 ? (
              <div className="text-center text-gray-400 py-12">尚無客戶資料，點選右上角「新增客戶」開始建立</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">公司名稱</th>
                    <th className="px-4 py-3 text-left">統編</th>
                    <th className="px-4 py-3 text-left">業務員</th>
                    <th className="px-4 py-3 text-left">結帳方式</th>
                    <th className="px-4 py-3 text-left w-16">分店</th>
                    <th className="px-4 py-3 text-left">聯絡資訊</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map(c => {
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
                        </tr>
                        {expanded && bs.map(b => (
                          <tr key={b.id} className="bg-gray-50 border-t border-gray-100">
                            <td className="pl-10 pr-4 py-2 text-gray-600 text-xs" colSpan={2}>
                              <span className="text-gray-400 mr-1">└</span>{b.name}
                              {b.contact_address && <span className="text-gray-400 ml-2">{b.contact_address}</span>}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-500">{b.phone || '—'}</td>
                            <td className="px-4 py-2" colSpan={2}></td>
                            <td className="px-4 py-2 text-right">
                              {b.invite_token ? (
                                <button
                                  onClick={() => copyLink(b.invite_token, b.id)}
                                  className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                                    copied === b.id
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                  }`}>
                                  {copied === b.id ? '✓ 已複製' : '複製邀請連結'}
                                </button>
                              ) : (
                                <span className="text-xs text-gray-300">無連結</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">新增客戶</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* 公司資訊 */}
              <section>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">公司資訊</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      公司營業登記名稱 <span className="text-red-500">*</span>
                    </label>
                    <input type="text" value={form.headquarters_name} onChange={f('headquarters_name')}
                      placeholder="如：家樂福股份有限公司"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">統編</label>
                      <input type="text" value={form.vat} onChange={f('vat')} placeholder="12345678"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">電子發票信箱</label>
                      <input type="email" value={form.email} onChange={f('email')} placeholder="invoice@company.com"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">結帳方式</label>
                      <select value={form.payment_term} onChange={f('payment_term')}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                        <option value="">（請選擇）</option>
                        {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">貨單形式</label>
                      <select value={form.invoice_format} onChange={f('invoice_format')}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                        <option value="">（請選擇）</option>
                        {INVOICE_FORMATS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">業務員</label>
                      <select value={form.salesperson_id} onChange={f('salesperson_id')}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                        <option value="">（請選擇）</option>
                        {employees.map(e => (
                          <option key={e.id} value={e.user_id}>{e.name}{e.job_title ? ` · ${e.job_title}` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">公司負責人姓名</label>
                      <input type="text" value={form.owner_name} onChange={f('owner_name')} placeholder="王大明"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                    </div>
                  </div>
                </div>
              </section>

              {/* 分店資訊 */}
              <section>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">分店資訊</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        店名 <span className="text-red-500">*</span>
                      </label>
                      <input type="text" value={form.branch_name} onChange={f('branch_name')}
                        placeholder="如：家樂福 — 內湖店"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">店內市話</label>
                      <input type="tel" value={form.phone} onChange={f('phone')} placeholder="02-12345678"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
                    <input type="text" value={form.contact_address} onChange={f('contact_address')}
                      placeholder="台北市內湖區..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">路線（配送區域）</label>
                    <select value={form.region_tag_id} onChange={f('region_tag_id')}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                      <option value="">（請選擇）</option>
                      {regionTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    {regionTags.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">尚未建立區域標籤，可在「客戶標籤管理」中新增</p>
                    )}
                  </div>
                </div>
              </section>

              {/* 店內聯絡人 */}
              <section>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">店內聯絡人</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">聯絡人姓名</label>
                    <input type="text" value={form.contact_name} onChange={f('contact_name')} placeholder="陳小華"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">聯絡電話</label>
                    <input type="tel" value={form.contact_phone} onChange={f('contact_phone')} placeholder="0912-345-678"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  </div>
                </div>
              </section>

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{formError}</div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                取消
              </button>
              <button onClick={submit} disabled={saving}
                className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium disabled:opacity-50">
                {saving ? '建立中...' : '建立客戶'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
