import { useState, useMemo } from 'react';

export type Holiday = { id: string; date: string; reason: string };

interface Props {
  holidays: Holiday[];
  busy: boolean;
  onAdd: (date: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
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

export default function HolidayCalendar({ holidays, busy, onAdd, onRemove, onImportMondays }: Props) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

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
    if (cell.holiday) await onRemove(cell.holiday.id);
    else await onAdd(cell.iso);
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
          let bg = 'transparent';
          let color = '#374151';
          let border = '1px solid transparent';
          if (!cell.isCurrentMonth) color = '#d1d5db';
          else if (isHoliday) { bg = '#fef2f2'; color = '#b91c1c'; border = '1px solid #fecaca'; }
          else if (cell.isWeekend) color = '#dc2626';
          if (cell.isToday) border = '2px solid #3b82f6';

          return (
            <div
              key={cell.iso}
              onClick={() => handleCellClick(cell)}
              style={{ ...baseStyle, background: bg, color, border }}
              title={cell.holiday?.reason || ''}
              onMouseEnter={(e) => {
                if (!isHoliday && cell.isCurrentMonth) (e.currentTarget as HTMLDivElement).style.background = '#f9fafb';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = isHoliday ? '#fef2f2' : 'transparent';
              }}
            >
              {cell.day}
              {isHoliday && (
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
        點空白日新增為公休；點紅色日取消。週末顯示紅色只是樣式，未列為假日。
      </p>
    </div>
  );
}
