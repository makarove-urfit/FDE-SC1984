import { getOrderDateBounds, shiftDate } from './dateHelpers'
import { describe, it, expect } from 'vitest'

describe('getOrderDateBounds', () => {
  it('targetDate "3/20" → 台灣 3/20 02:00 ~ 3/21 02:00 = UTC 3/19 18:00 ~ 3/20 18:00', () => {
    const { start, end } = getOrderDateBounds('2026-03-20')
    expect(start).toBe('2026-03-19 18:00:00')
    expect(end).toBe('2026-03-20 18:00:00')
  })

  it('跨月測試：targetDate "3/01" → 台灣 3/1 02:00 ~ 3/2 02:00 = UTC 2/28 18:00 ~ 3/1 18:00', () => {
    const { start, end } = getOrderDateBounds('2026-03-01')
    expect(start).toBe('2026-02-28 18:00:00')
    expect(end).toBe('2026-03-01 18:00:00')
  })

  it('用戶 3/31 19:16 下單應落在 targetDate "3/31" 範圍內', () => {
    // 3/31 19:16 UTC+8 = 3/31 11:16 UTC
    // targetDate "3/31" 的範圍 = UTC 3/30 18:00 ~ 3/31 18:00
    const { start, end } = getOrderDateBounds('2026-03-31')
    expect(start).toBe('2026-03-30 18:00:00')
    expect(end).toBe('2026-03-31 18:00:00')
    // 3/31 11:16 UTC 落在 [3/30 18:00, 3/31 18:00) 中 ✓
    expect('2026-03-31 11:16:00' >= start).toBe(true)
    expect('2026-03-31 11:16:00' < end).toBe(true)
  })
})

describe('shiftDate', () => {
  it('能正確切換回上一天', () => {
    expect(shiftDate('2026-03-20', -1)).toBe('2026-03-19')
  })

  it('能正確跨月向後', () => {
    expect(shiftDate('2026-02-28', 1)).toBe('2026-03-01') // 2026非閏年
  })
})
