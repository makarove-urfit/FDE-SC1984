import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';
type Mapping = { id:string; productTmplId:string; supplierId:string };
type Opt = { id:string; name:string };
const resolveId = (raw:any) => Array.isArray(raw) ? String(raw[0]||'') : String(raw||'');

function SearchSelect({ options, value, onChange, placeholder }: {
  options: Opt[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const internalRef = useRef(false);

  useEffect(() => {
    if (internalRef.current) { internalRef.current = false; return; }
    if (!value) { setQ(''); return; }
    const opt = options.find(o => o.id === value);
    if (opt) setQ(opt.name);
  }, [value, options]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        const opt = options.find(o => o.id === value);
        setQ(opt?.name || '');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [options, value]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return options;
    return options.filter(o => o.name.toLowerCase().includes(qq));
  }, [options, q]);

  useEffect(() => { setHi(0); }, [q]);

  const commit = (opt: Opt) => {
    internalRef.current = true;
    onChange(opt.id);
    setQ(opt.name);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: '12rem' }}>
      <input
        type="text"
        value={q}
        onChange={e => {
          setQ(e.target.value);
          setOpen(true);
          if (value) { internalRef.current = true; onChange(''); }
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(i+1, filtered.length-1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(i => Math.max(i-1, 0)); }
          else if (e.key === 'Enter' && filtered[hi]) { e.preventDefault(); commit(filtered[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm bg-white"
      />
      {open && (
        <ul style={{
          position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)',
          maxHeight: '15rem', overflowY: 'auto',
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
          listStyle: 'none', margin: 0, padding: '4px 0', zIndex: 50,
        }}>
          {filtered.length === 0 ? (
            <li style={{ padding: '6px 12px', fontSize: 13, color: '#9ca3af' }}>無符合項目</li>
          ) : filtered.map((o, i) => (
            <li
              key={o.id}
              onMouseDown={e => { e.preventDefault(); commit(o); }}
              onMouseEnter={() => setHi(i)}
              style={{
                padding: '6px 12px', fontSize: 13, cursor: 'pointer',
                background: i === hi ? '#eff6ff' : 'transparent',
                color: o.id === value ? '#1d4ed8' : '#1f2937',
                fontWeight: o.id === value ? 600 : 400,
              }}
            >
              {o.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
export default function SupplierMappingPage() {
  const nav = useNavigate();
  const [maps, setMaps] = useState<Mapping[]>([]);
  const [tmpls, setTmpls] = useState<Opt[]>([]);
  const [sups, setSups] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [tmplId, setTmplId] = useState('');
  const [supId, setSupId] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true); setErr('');
    try {
      const [rawMaps, rawTmpls, rawSups] = await Promise.all([
        db.query('product_supplierinfo'),
        db.queryFiltered('product_templates', [{column:'active',op:'eq',value:true}]),
        db.queryFiltered('suppliers', [{column:'active',op:'eq',value:true}]),
      ]);
      setMaps((rawMaps||[]).map((r:any)=>({id:String(r.id), productTmplId:resolveId(r.product_tmpl_id), supplierId:resolveId(r.supplier_id)})));
      setTmpls((rawTmpls||[]).map((r:any)=>({id:String(r.id), name:String(r.name||'')})).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')));
      setSups((rawSups||[]).map((r:any)=>({id:String(r.id), name:String(r.name||'')})).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')));
    } catch(e:any) { setErr(e?.message||'載入失敗'); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, []);
  const tmplName = (id:string) => tmpls.find(t=>t.id===id)?.name || id;
  const supName = (id:string) => sups.find(s=>s.id===id)?.name || id;
  const add = async () => {
    if (!tmplId || !supId) { alert('請選擇產品與供應商'); return; }
    setBusy(true);
    try { await db.insert('product_supplierinfo', {product_tmpl_id: tmplId, supplier_id: supId}); setTmplId(''); setSupId(''); setShowForm(false); await load(); }
    catch(e:any) { alert(e?.message||'新增失敗'); } finally { setBusy(false); }
  };
  const del = async (id:string) => {
    if (!confirm('刪除此對應？')) return;
    try { await db.deleteRow('product_supplierinfo', id); await load(); }
    catch(e:any) { alert(e?.message||'刪除失敗'); }
  };
  const grouped = useMemo(() => {
    const m = new Map<string, Mapping[]>();
    maps.forEach(x => { const arr = m.get(x.supplierId)||[]; arr.push(x); m.set(x.supplierId, arr); });
    return Array.from(m.entries()).sort(([a],[b]) => supName(a).localeCompare(supName(b),'zh-Hant'));
  }, [maps, sups]);
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={()=>nav('/admin/settings')} className="text-gray-500 hover:text-gray-700 text-sm">← 返回</button>
            <h1 className="text-xl font-bold text-gray-900">供應商-產品對應</h1>
          </div>
          <button onClick={()=>setShowForm(v=>!v)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ 新增對應</button>
        </div>
      </header>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        {err && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{err}</div>}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <p className="font-medium text-gray-700">新增對應</p>
            <div className="flex gap-3 flex-wrap">
              <SearchSelect options={tmpls} value={tmplId} onChange={setTmplId} placeholder="搜尋產品..." />
              <SearchSelect options={sups} value={supId} onChange={setSupId} placeholder="搜尋供應商..." />
              <button onClick={add} disabled={busy} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">確認新增</button>
              <button onClick={()=>setShowForm(false)} className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">取消</button>
            </div>
          </div>
        )}
        {loading ? <p className="text-gray-400 text-center py-12">載入中...</p> :
          maps.length===0 ?
            <div className="bg-white rounded-xl border border-gray-100 text-center text-gray-400 py-12">尚無供應商-產品對應</div>
          :
            <div className="space-y-4">
              {grouped.map(([sid, items]) => (
                <section key={sid} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <header className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
                    <p className="font-semibold text-gray-800">{supName(sid)}</p>
                    <p className="text-xs text-gray-400">供應 {items.length} 項產品</p>
                  </header>
                  <ul className="divide-y divide-gray-50">
                    {items.map(m => (
                      <li key={m.id} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-800">{tmplName(m.productTmplId)}</span>
                        <button onClick={()=>del(m.id)} className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">刪除</button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
        }
      </div>
    </div>
  );
}
