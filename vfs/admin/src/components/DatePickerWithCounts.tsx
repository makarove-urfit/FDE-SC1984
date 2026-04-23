import { useState, useMemo } from 'react';
import { useData } from '../data/DataProvider';

interface Props {
  value: string;
  onChange: (d: string) => void;
}

const WD = ['日', '一', '二', '三', '四', '五', '六'];

export default function DatePickerWithCounts({ value, onChange }: Props) {
  const { orders, holidays } = useData();
  const [open, setOpen] = useState(false);
  const [vy, setVy] = useState(() => Number(value.slice(0, 4)));
  const [vm, setVm] = useState(() => Number(value.slice(5, 7)) - 1);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of orders) {
      const d = (typeof o.note === 'string' ? o.note : '').match(/配送日期：(\d{4}-\d{2}-\d{2})/)?.[1]
        || (o.date_order || o.created_at || '').slice(0, 10);
      if (d) c[d] = (c[d] || 0) + 1;
    }
    return c;
  }, [orders]);

  const prevM = () => {
    if (vm === 0) { setVy(y => y - 1); setVm(11); }
    else setVm(m => m - 1);
  };
  const nextM = () => {
    if (vm === 11) { setVy(y => y + 1); setVm(0); }
    else setVm(m => m + 1);
  };

  const firstDow = new Date(vy, vm, 1).getDay();
  const days = new Date(vy, vm + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const today = new Date().toISOString().slice(0, 10);
  const sy = Number(value.slice(0, 4));
  const sm = Number(value.slice(5, 7));
  const sd = Number(value.slice(8, 10));

  const pick = (day: number) => {
    const d = `${vy}-${String(vm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(d);
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-sm hover:border-gray-300 transition-colors"
        style={{ cursor: 'pointer' }}
      >
        {value}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)',
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '14px', zIndex: 100,
            width: '252px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <button onClick={prevM} style={{ padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', border: 'none', fontSize: '18px', color: '#6b7280', lineHeight: 1 }} className="hover:bg-gray-100">‹</button>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{vy} 年 {vm + 1} 月</span>
              <button onClick={nextM} style={{ padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', border: 'none', fontSize: '18px', color: '#6b7280', lineHeight: 1 }} className="hover:bg-gray-100">›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px', marginBottom: '4px' }}>
              {WD.map(w => <div key={w} style={{ textAlign: 'center', fontSize: '11px', color: '#9ca3af', padding: '2px 0' }}>{w}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px' }}>
              {cells.map((day, i) => {
                if (!day) return <div key={i} style={{ height: '40px' }} />;
                const ds = `${vy}-${String(vm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const cnt = counts[ds] || 0;
                const isSel = sy === vy && sm === vm + 1 && sd === day;
                const isTdy = ds === today;
                const isHol = holidays.has(ds);
                const bg = isSel ? '#16a34a' : isTdy ? '#bbf7d0' : isHol ? '#fef08a' : 'transparent';
                return (
                  <button key={i} onClick={() => pick(day)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'flex-start', paddingTop: '5px',
                    height: '40px', borderRadius: '8px', cursor: 'pointer', border: 'none',
                    background: bg,
                    color: isSel ? '#fff' : '#111827',
                  }}>
                    <span style={{ display: 'block', fontSize: '13px', height: '16px', lineHeight: '16px' }}>{day}</span>
                    <span style={{
                      display: 'block', fontSize: '10px', height: '12px', lineHeight: '12px', fontWeight: 600,
                      visibility: cnt > 0 ? 'visible' : 'hidden',
                      color: isSel ? 'rgba(255,255,255,0.85)' : '#16a34a',
                    }}>{cnt}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
