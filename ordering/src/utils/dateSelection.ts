/**
 * 配送日期選擇工具
 * 產生明天起 30 天的可選日期（排除假日）
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1/open/proxy'
const API_KEY = import.meta.env.VITE_API_KEY || ''

/** 從 x_holiday_settings 取得假日清單，失敗時回傳空陣列 */
export async function fetchHolidays(token: string | null): Promise<string[]> {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const res = await fetch(`${API_BASE}/x_holiday_settings/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        filters: [{ column: 'date', op: 'ge', value: today }],
        select_columns: ['date'],
        limit: 200,
      }),
    })
    if (!res.ok) return []
    const rows: { date: string }[] = await res.json()
    return (rows || []).map(r => r.date).filter(Boolean)
  } catch {
    return []
  }
}

function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const LOOKAHEAD_DAYS = 7

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

/** 產生可選配送日期（明天起，排除假日） */
export function getAvailableOrderDates(today: Date, holidays: string[]): string[] {
  const holidaySet = new Set(holidays)
  const result: string[] = []

  for (let i = 1; i <= LOOKAHEAD_DAYS; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const ymd = toYMD(d)
    if (!holidaySet.has(ymd)) {
      result.push(ymd)
    }
  }

  return result
}

/** 將 YYYY-MM-DD 格式化為「YYYY-MM-DD（週幾）」的顯示文字 */
export function formatDateOption(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${ymd}（${DAY_NAMES[date.getDay()]}）`
}
