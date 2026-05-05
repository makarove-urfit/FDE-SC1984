import { useNavigate, useLocation } from 'react-router-dom';
import { useData } from '../../data/DataProvider';
import DatePickerWithCounts from '../../components/DatePickerWithCounts';
const LeafIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 1a13 13 0 0 1 .8 13c-1 1.8-2 3.1-3.8 4.5"/><path d="M5 20c.5-1 1.4-3 2-4.5"/></svg>;
const ClipboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>;
const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
type TabKey = 'daily' | 'settings';
export default function DashboardPage() {
  const nav = useNavigate();
  const { orders, orderLines, loading, selectedDate, setSelectedDate } = useData();
  const loc = useLocation();
  const tab: TabKey = loc.pathname.startsWith('/admin/settings') ? 'settings' : 'daily';
  const setTab = (t: TabKey) => { nav(t === 'daily' ? '/admin/daily' : '/admin/settings'); };
  const isDraft = (o:any) => !o.state || o.state === 'draft';
  const isConfirmed = (o:any) => o.state === 'sale' || o.state === 'confirm';
  const dateIds = new Set(orderLines.filter((l:any) => String(l.delivery_date||'').slice(0,10) === selectedDate).map((l:any) => { const v = l.order_id; return Array.isArray(v) ? String(v[0]) : String(v||''); }));
  const cd = () => orders.filter(o => isDraft(o) && dateIds.has(String(o.id))).length;
  const cs = () => orders.filter(o => isConfirmed(o) && dateIds.has(String(o.id))).length;
  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">載入中...</p></div>;
  const steps = [
    {step:'1',label:'訂單接收',desc:`${cd()} 筆待處理`,href:'/admin/daily/purchase-list',count:cd()},
    {step:'2',label:'採購定價',desc:'管理採購',href:'/admin/daily/procurement',count:0},
    {step:'3',label:'採購單',desc:'按供應商查看採購明細',href:'/admin/daily/stock',count:0},
    {step:'4',label:'銷貨單',desc:`${cs()} 筆已確認`,href:'/admin/daily/sales-orders',count:cs()},
    {step:'5',label:'配送管理',desc:'出貨追蹤',href:'/admin/daily/delivery',count:0},
  ];
  const settingsGroups: {title:string; items:{label:string;desc:string;href:string;disabled?:boolean}[]}[] = [
    {title:'人員', items:[
      {label:'客戶管理', desc:'新增客戶、分店、聯絡人', href:'/admin/settings/customers'},
      {label:'員工管理', desc:'查看員工、部門、帳號狀態', href:'/admin/settings/employees'},
    ]},
    {title:'配送組', items:[
      {label:'路線預設司機', desc:'配送路線與預設司機指派', href:'/admin/settings/route-drivers'},
    ]},
    {title:'採購組', items:[
      {label:'供應商管理', desc:'供應商資料與預設採購員指派', href:'/admin/settings/suppliers'},
    ]},
    {title:'商品設定', items:[
      {label:'產品管理', desc:'編輯產品、上下架、分類', href:'/admin/settings/products'},
      {label:'產品分類管理', desc:'新增/修改分類', href:'/admin/settings/product-categories'},
    ]},
    {title:'系統', items:[
      {label:'系統設定', desc:'假日、截止時間', href:'/admin/settings/system'},
    ]},
  ];
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LeafIcon />
            <h1 className="text-2xl font-bold text-gray-900">雄泉鮮食 管理後台</h1>
          </div>
          <DatePickerWithCounts value={selectedDate} onChange={setSelectedDate} />
        </div>
        <p className="text-sm text-gray-400">{selectedDate} 總覽</p>
      </header>
      <div className="px-6 pt-6 max-w-6xl mx-auto">
        <div style={{display:'flex', gap:4, borderBottom:'1px solid #e5e7eb'}}>
          {([['daily', '每日流程', <ClipboardIcon key="d"/>], ['settings', '基礎設定', <SettingsIcon key="s"/>]] as const).map(([k, lbl, icon]) => {
            const active = tab === k;
            const st: React.CSSProperties = {
              padding: '10px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              borderTopLeftRadius: 8, borderTopRightRadius: 8, marginBottom: -1,
              background: active ? '#ffffff' : '#f3f4f6',
              color: active ? '#111827' : '#6b7280',
              borderTop: active ? '3px solid #16a34a' : '3px solid transparent',
              borderLeft: '1px solid #e5e7eb',
              borderRight: '1px solid #e5e7eb',
              borderBottom: active ? '1px solid #ffffff' : '1px solid #e5e7eb',
            };
            return <button key={k} onClick={()=>setTab(k as TabKey)} style={st}>
              <span style={{display:'inline-flex', alignItems:'center', gap:6}}>{icon}{lbl}</span>
            </button>;
          })}
        </div>
      </div>
      {tab==='daily' && (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[{l:'全部訂單',v:orders.filter(o=>dateIds.has(String(o.id))).length,c:'text-gray-900'},{l:'待處理',v:cd(),c:'text-orange-600'},{l:'已確認',v:cs(),c:'text-blue-600'},{l:'完成',v:orders.filter(o=>o.state==='done'&&dateIds.has(String(o.id))).length,c:'text-green-600'},{l:'已取消',v:orders.filter(o=>o.state==='cancel'&&dateIds.has(String(o.id))).length,c:'text-red-600'}].map(s=>(
              <div key={s.l} className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-sm text-gray-400">{s.l}</p><p className={`text-3xl font-bold ${s.c}`}>{s.v}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h2 className="font-bold text-gray-900 mb-4">{selectedDate} 作業流程</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {steps.map(s=>(
                <button key={s.label} onClick={()=>nav(s.href)} className="rounded-xl border border-gray-100 bg-white hover:bg-gray-50 p-4 text-left transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-medium bg-gray-100 rounded-full w-5 h-5 flex items-center justify-center">{s.step}</span>
                    {s.count>0&&<span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">{s.count}</span>}
                  </div>
                  <p className="font-medium mt-1 text-gray-900 text-sm">{s.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {tab==='settings' && (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
          {settingsGroups.map(g => (
            <section key={g.title}>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{g.title}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {g.items.map(it => (
                  <button key={it.href} onClick={()=>!it.disabled&&nav(it.href)} disabled={it.disabled} className={`rounded-xl border border-gray-100 bg-white p-4 text-left transition-colors ${it.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}>
                    <p className="font-semibold text-gray-800">{it.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{it.desc}</p>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
