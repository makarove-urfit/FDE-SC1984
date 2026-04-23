import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';
type Holiday = { id:string; date:string; label:string };
type CutoffSetting = { id:string; value:string } | null;
const KEY_CUTOFF = 'order_cutoff_time';
export default function SettingsPage() {
  const nav = useNavigate();
  const [cutoff, setCutoff] = useState<CutoffSetting>(null);
  const [cutoffTime, setCutoffTime] = useState('14:00');
  const [cutoffBusy, setCutoffBusy] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newDate, setNewDate] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const load = async () => {
    setLoading(true); setErr('');
    try {
      const [rawSettings, rawHols] = await Promise.all([
        db.queryCustom('x_app_settings'),
        db.queryCustom('x_holiday_settings'),
      ]);
      const cu = (rawSettings||[]).find((r:any) => (r.data?.key || r.key) === KEY_CUTOFF);
      if (cu) { const d = cu.data || cu; setCutoff({id:String(cu.id||d.id), value:String(d.value||'14:00')}); setCutoffTime(String(d.value||'14:00')); }
      const today = new Date().toISOString().slice(0,10);
      const hs: Holiday[] = (rawHols||[]).map((r:any) => { const d = r.data||r; return {id:String(r.id||d.id), date:String(d.date||''), label:String(d.label||d.reason||'假日')}; })
        .filter(h => h.date && h.date >= today)
        .sort((a,b) => a.date.localeCompare(b.date));
      setHolidays(hs);
    } catch(e:any) { setErr(e?.message||'載入失敗'); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, []);
  const saveCutoff = async () => {
    setCutoffBusy(true);
    try {
      const now = new Date().toISOString();
      if (cutoff) {
        await db.updateCustom(cutoff.id, {key: KEY_CUTOFF, value: cutoffTime, updated_at: now});
      } else {
        const created = await db.insertCustom('x_app_settings', {key: KEY_CUTOFF, value: cutoffTime, updated_at: now});
        setCutoff({id: String(created?.id || ''), value: cutoffTime});
      }
      alert(`已儲存：${cutoffTime}`);
    } catch(e:any) { alert(e?.message||'儲存失敗'); } finally { setCutoffBusy(false); }
  };
  const addHoliday = async () => {
    if (!newDate) { alert('請選擇日期'); return; }
    setBusy(true);
    try {
      // x_holiday_settings 的欄位是 date / reason
      await db.insertCustom('x_holiday_settings', {date: newDate, reason: newLabel.trim()||'假日'});
      setNewDate(''); setNewLabel('');
      await load();
    } catch(e:any) { alert(e?.message||'新增失敗'); } finally { setBusy(false); }
  };
  const delHoliday = async (id:string) => {
    if (!confirm('刪除此假日？')) return;
    try { await db.deleteCustom(id); await load(); }
    catch(e:any) { alert(e?.message||'刪除失敗'); }
  };
  const importMondays = async () => {
    const now = new Date();
    const y = now.getFullYear(); const m = now.getMonth();
    const firstDay = new Date(y, m, 1);
    const daysInMonth = new Date(y, m+1, 0).getDate();
    const mondays: string[] = [];
    for (let d=1; d<=daysInMonth; d++) {
      const dt = new Date(y, m, d);
      if (dt.getDay() === 1) {
        const iso = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        mondays.push(iso);
      }
    }
    const existing = new Set(holidays.map(h => h.date));
    const toCreate = mondays.filter(d => !existing.has(d));
    if (toCreate.length === 0) { alert('本月週一已全數存在'); return; }
    setBusy(true);
    try {
      for (const d of toCreate) {
        await db.insertCustom('x_holiday_settings', {date: d, reason: '週一公休'});
      }
      await load();
      alert(`已匯入 ${toCreate.length} 個週一假日`);
    } catch(e:any) { alert(e?.message||'匯入失敗'); } finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button onClick={()=>nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
          <h1 className="text-xl font-bold text-gray-900">系統設定</h1>
        </div>
      </header>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {err && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{err}</div>}
        <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">截止時間</h2>
          <p className="text-sm text-gray-500">超過此時間後，當日訂單將無法送出。</p>
          {loading ? <p className="text-sm text-gray-400">載入中...</p> :
            <div className="flex items-center gap-3">
              <input type="time" value={cutoffTime} onChange={e=>setCutoffTime(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm font-medium text-gray-700" />
              <button onClick={saveCutoff} disabled={cutoffBusy} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">{cutoffBusy?'儲存中...':'儲存'}</button>
            </div>
          }
        </section>
        <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">假日管理</h2>
            <button onClick={importMondays} disabled={busy} className="px-3 py-1.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-lg hover:bg-orange-200 disabled:opacity-50">匯入本月週一</button>
          </div>
          <p className="text-sm text-gray-500">設定後，訂購頁面的配送日期選擇器會排除這些日期。</p>
          <div className="flex items-center gap-2 pt-1">
            <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700" />
            <input type="text" placeholder="說明（如：元旦）" value={newLabel} onChange={e=>setNewLabel(e.target.value)} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700" />
            <button onClick={addHoliday} disabled={busy||!newDate} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">新增</button>
          </div>
          {loading ? <p className="text-sm text-gray-400">載入中...</p> :
            holidays.length===0 ? <p className="text-sm text-gray-400">目前無假日</p> :
            <ul className="divide-y divide-gray-100">
              {holidays.map(h => (
                <li key={h.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <span className="font-medium text-gray-800 text-sm">{h.date}</span>
                    <span className="text-gray-400 text-xs ml-2">{h.label}</span>
                  </div>
                  <button onClick={()=>delHoliday(h.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">刪除</button>
                </li>
              ))}
            </ul>
          }
        </section>
      </div>
    </div>
  );
}
