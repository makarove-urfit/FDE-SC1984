/**
 * 計算指定目標日期的營業日 UTC 範圍
 * 
 * 營業日定義：台灣時間 targetDate 02:00 ~ targetDate+1 02:00
 * 例：targetDate "2026-03-31" → 台灣 3/31 02:00 ~ 4/01 02:00
 *                             → UTC  3/30 18:00 ~ 3/31 18:00
 * 
 * @param dateStr 目標日期字串 'YYYY-MM-DD'
 * @returns { start: string, end: string } UTC 格式 'YYYY-MM-DD HH:mm:ss'
 */
export function getOrderDateBounds(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  
  // 目標日 00:00 UTC
  const targetMidnight = new Date(Date.UTC(y, m - 1, d))
  // 台灣時間 02:00 = UTC 18:00 (前一天) = targetMidnight - 6h
  const startUTC = new Date(targetMidnight.getTime() - 6 * 60 * 60 * 1000)
  // 台灣時間隔天 02:00 = UTC 18:00 (當天) = targetMidnight + 18h
  const endUTC = new Date(targetMidnight.getTime() + 18 * 60 * 60 * 1000)
  
  return {
    start: startUTC.toISOString().replace('T', ' ').substring(0, 19),
    end: endUTC.toISOString().replace('T', ' ').substring(0, 19)
  }
}

/**
 * 取得下一個或上一個日期的字串
 */
export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  
  // 修正時區偏移以確保 toISOString 回傳預期的地方日期字串 (或者手動 format)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().split('T')[0]
}

/**
 * 取得今天的當地日期字串 YYYY-MM-DD
 */
export function getTodayDateStr(): string {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return localDate.toISOString().split('T')[0]
}
