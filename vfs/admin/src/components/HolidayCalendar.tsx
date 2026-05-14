import { useState, useMemo } from 'react';

export type Holiday = { id: string; date: string; reason: string; vip_branch_ids?: string[] };

export type BranchOption = { id: string; label: string };

interface Props {
  holidays: Holiday[];
  busy: boolean;
  branchOptions: BranchOption[];
  onAdd: (date: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onUpdateReason: (id: string, reason: string) => Promise<void>;
  onUpdateVip: (id: string, branchIds: string[]) => Promise<void>;
  onImportMondays: () => Promise<void>;
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function todayISO(): string {
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}

type Cell = {
  iso: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  holiday?: Holiday;
};

function buildCells(year: number, month: number, holidayMap: Map<string, Holiday>): Cell[] {
  const today = todayISO();
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekdayMon0 = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstWeekdayMon0);
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = toISO(d.getFullYear(), d.getMonth(), d.getDate());
    const col = i % 7;
    cells.push({
      iso,
      day: d.getDate(),
      isCurrentMonth: d.getMonth() === month,
      isToday: iso === today,
      isWeekend: col >= 5,
      holiday: holidayMap.get(iso),
    });
  }
  return cells;
}

export default function HolidayCalendar({ holidays, busy, branchOptions, onAdd, onRemove, onUpdateReason, onUpdateVip, onImportMondays }: Props) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [editReason, setEditReason] = useState('');
  const [editVip, setEditVip] = useState<string[]>([]);

  const holidayMap = useMemo(() => {
    const m = new Map<string, Holiday>();
    for (const h of holidays) m.set(h.date, h);
    return m;
  }, [holidays]);

  const cells = useMemo(
    () => buildCells(viewYear, viewMonth, holidayMap),
    [viewYear, viewMonth, holidayMap],
  );

  const goPrev = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };
  const goToday = () => {
    const d = new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const handleCellClick = async (cell: Cell) => {
    if (busy) return;
    if (!cell.isCurrentMonth) {
      const [y, m] = cell.iso.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
      return;
    }
    if (cell.holiday) {
      setEditing(cell.holiday);
      setEditReason(cell.holiday.reason);
      setEditVip([...(cell.holiday.vip_branch_ids || [])]);
    } else {
      await onAdd(cell.iso);
    }
  };

  const closeEdit = () => { setEditing(null); setEditReason(''); setEditVip([]); };
  const saveEdit = async () => {
    if (!editing) return;
    const trimmed = editReason.trim() || '公休';
    if (trimmed !== editing.reason) await onUpdateReason(editing.id, trimmed);
    const prev = (editing.vip_branch_ids || []).slice().sort();
    const curr = editVip.slice().sort();
    if (JSON.stringify(prev) !== JSON.stringify(curr)) {
      await onUpdateVip(editing.id, editVip);
    }
    closeEdit();
  };
  const removeFromEdit = async () => {
    if (!editing) return;
    await onRemove(editing.id);
    closeEdit();
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gap: '4px',
  };

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="上個月"
          >‹</button>
          <span className="font-semibold text-gray-900 min-w-[110px] text-center">
            {viewYear} 年 {viewMonth + 1} 月
          </span>
          <button
            onClick={goNext}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="下個月"
          >›</button>
          <button
            onClick={goToday}
            className="ml-1 px-3 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >今天</button>
        </div>
        <button
          onClick={onImportMondays}
          disabled={busy}
          className="px-3 py-1.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-lg hover:bg-orange-200 disabled:opacity-50"
        >匯入本月週一</button>
      </div>

      <div style={gridStyle} className="mb-1">
        {WEEK_LABELS.map((w, i) => (
          <div
            key={w}
            className="text-center text-xs font-medium py-1"
            style={{ color: i >= 5 ? '#dc2626' : '#6b7280' }}
          >{w}</div>
        ))}
      </div>

      <div style={gridStyle} className={busy ? 'opacity-50 pointer-events-none' : ''}>
        {cells.map((cell) => {
          const isHoliday = !!cell.holiday;
          const baseStyle: React.CSSProperties = {
            position: 'relative',
            aspectRatio: '1 / 1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: 500,
            transition: 'background-color 0.15s',
          };
          const showHolidayStyle = isHoliday && cell.isCurrentMonth;
          let bg = 'transparent';
          let color = '#374151';
          let border = '1px solid transparent';
          if (!cell.isCurrentMonth) color = '#d1d5db';
          else if (showHolidayStyle) { bg = '#fef2f2'; color = '#b91c1c'; border = '1px solid #fecaca'; }
          else if (cell.isWeekend) color = '#dc2626';
          if (cell.isToday) border = '2px solid #3b82f6';

          return (
            <div
              key={cell.iso}
              onClick={() => handleCellClick(cell)}
              style={{ ...baseStyle, background: bg, color, border }}
              title={cell.holiday?.reason || ''}
              onMouseEnter={(e) => {
                if (!showHolidayStyle && cell.isCurrentMonth) (e.currentTarget as HTMLDivElement).style.background = '#f9fafb';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = showHolidayStyle ? '#fef2f2' : 'transparent';
              }}
            >
              {cell.day}
              {showHolidayStyle && (
                <span
                  style={{
                    position: 'absolute',
                    top: '3px',
                    right: '4px',
                    fontSize: '10px',
                    background: '#dc2626',
                    color: 'white',
                    padding: '0 4px',
                    borderRadius: '3px',
                    lineHeight: '14px',
                    fontWeight: 600,
                  }}
                >休</span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        點空白日 → 直接新增為「公休」；點紅色日 → 開啟編輯視窗，可改原因、設定 VIP 例外名單或取消假日。
      </p>

      {editing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={closeEdit}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              padding: '20px',
              borderRadius: '12px',
              width: '320px',
              maxWidth: '90%',
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '15px', color: '#111827' }}>
              編輯假日 — {editing.date}
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>休假原因</div>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="公休"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  background: '#f9fafb',
                  color: '#111827',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                VIP 例外配送名單（這天仍要送這些分店）
              </div>
              <select
                multiple
                value={editVip}
                onChange={(e) => {
                  const opts = Array.from(e.target.selectedOptions).map(o => o.value);
                  setEditVip(opts);
                }}
                style={{
                  width: '100%',
                  minHeight: '120px',
                  padding: '6px 8px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                  background: '#f9fafb',
                  color: '#111827',
                  boxSizing: 'border-box',
                }}
              >
                {branchOptions.map(b => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                按住 Ctrl/⌘ 點選可多選；已選 {editVip.length} 家
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', marginTop: '4px' }}>
              <button
                onClick={removeFromEdit}
                disabled={busy}
                style={{
                  padding: '8px 12px',
                  background: '#fef2f2',
                  color: '#b91c1c',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >取消假日</button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={closeEdit}
                  style={{
                    padding: '8px 12px',
                    background: 'transparent',
                    color: '#6b7280',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >關閉</button>
                <button
                  onClick={saveEdit}
                  disabled={busy}
                  style={{
                    padding: '8px 14px',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >儲存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
