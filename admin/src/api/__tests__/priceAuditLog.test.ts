import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = {
  query: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
vi.mock('../client', () => ({ db: mockDb }))

const { updateProductPrices, syncOrderLinePrices, getPriceLog, updateProductPricesWithLog } =
  await import('../priceAuditLog')

beforeEach(() => vi.clearAllMocks())

describe('updateProductPrices', () => {
  it('PATCH product_products 寫入 standard_price 與 lst_price', async () => {
    mockDb.update.mockResolvedValue({})
    await updateProductPrices('pp-1', 80, 120)
    expect(mockDb.update).toHaveBeenCalledWith(
      'product_products',
      'pp-1',
      expect.objectContaining({ standard_price: 80, lst_price: 120 }),
    )
  })
})

describe('syncOrderLinePrices', () => {
  it('查詢含此品項的所有 sale_order_lines', async () => {
    mockDb.query.mockResolvedValue([])
    await syncOrderLinePrices('pp-1', 120, '2026-04-02')
    expect(mockDb.query).toHaveBeenCalledWith(
      'sale_order_lines',
      expect.objectContaining({
        filters: expect.arrayContaining([
          expect.objectContaining({ column: 'product_id', op: 'eq', value: 'pp-1' }),
        ]),
      }),
    )
  })

  it('逐一 PATCH 配送日期符合的 line 的 price_unit', async () => {
    mockDb.query.mockResolvedValueOnce([
      { id: 'line-1', delivery_date: '2026-04-02' },
      { id: 'line-2', delivery_date: '2026-04-02' },
      { id: 'line-3', delivery_date: '2026-04-03' },
    ])
    mockDb.update.mockResolvedValue({})

    await syncOrderLinePrices('pp-1', 120, '2026-04-02')

    expect(mockDb.update).toHaveBeenCalledWith('sale_order_lines', 'line-1', { price_unit: 120 })
    expect(mockDb.update).toHaveBeenCalledWith('sale_order_lines', 'line-2', { price_unit: 120 })
    expect(mockDb.update).not.toHaveBeenCalledWith('sale_order_lines', 'line-3', expect.anything())
  })

  it('回傳更新筆數', async () => {
    mockDb.query.mockResolvedValueOnce([
      { id: 'line-1', delivery_date: '2026-04-02' },
      { id: 'line-2', delivery_date: '2026-04-02' },
    ])
    mockDb.update.mockResolvedValue({})

    const result = await syncOrderLinePrices('pp-1', 120, '2026-04-02')
    expect(result.updated).toBe(2)
  })

  it('無對應 line 時回傳 updated=0', async () => {
    mockDb.query.mockResolvedValue([])
    const result = await syncOrderLinePrices('pp-1', 120, '2026-04-02')
    expect(result.updated).toBe(0)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})

describe('updateProductPricesWithLog', () => {
  it('正確串接三個步驟，回傳 updated', async () => {
    mockDb.update.mockResolvedValue({})
    mockDb.query.mockResolvedValueOnce([
      { id: 'line-1', delivery_date: '2026-04-02' },
    ])
    mockDb.insert.mockResolvedValue({ id: 'plog-1' })

    const result = await updateProductPricesWithLog('pp-1', 80, 120, 'admin', '2026-04-02')

    expect(mockDb.update).toHaveBeenCalledWith('product_products', 'pp-1', { standard_price: 80, lst_price: 120 })
    expect(mockDb.update).toHaveBeenCalledWith('sale_order_lines', 'line-1', { price_unit: 120 })
    expect(mockDb.insert).toHaveBeenCalledWith(
      'product_product_price_log',
      expect.objectContaining({
        product_product_id: 'pp-1',
        standard_price: 80,
        lst_price: 120,
        updated_by: 'admin',
        effective_date: '2026-04-02',
      }),
    )
    expect(result.updated).toBe(1)
  })

  it('writePriceLog 失敗時不 throw，有 console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockDb.update.mockResolvedValue({})
    mockDb.query.mockResolvedValueOnce([{ id: 'line-1', delivery_date: '2026-04-02' }])
    mockDb.insert.mockRejectedValueOnce(new Error('log failed'))

    const result = await updateProductPricesWithLog('pp-1', 80, 120, 'admin', '2026-04-02')

    expect(result.updated).toBe(1)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[productProductPriceLog]'),
      expect.any(Error),
    )
    warnSpy.mockRestore()
  })
})

describe('getPriceLog', () => {
  it('查詢時帶入正確的 product_product_id filter', async () => {
    mockDb.query.mockResolvedValue([])
    await getPriceLog('pp-1')
    expect(mockDb.query).toHaveBeenCalledWith(
      'product_product_price_log',
      expect.objectContaining({
        filters: expect.arrayContaining([
          expect.objectContaining({ column: 'product_product_id', op: 'eq', value: 'pp-1' }),
        ]),
      }),
    )
  })

  it('回傳依 updated_at 降冪排列', async () => {
    mockDb.query.mockResolvedValue([
      { id: 'plog-1', product_product_id: 'pp-1', standard_price: 80, lst_price: 100, updated_by: 'admin', effective_date: '2026-04-01', updated_at: '2026-04-01T10:00:00' },
      { id: 'plog-2', product_product_id: 'pp-1', standard_price: 90, lst_price: 120, updated_by: 'admin', effective_date: '2026-04-02', updated_at: '2026-04-02T10:00:00' },
    ])
    const result = await getPriceLog('pp-1')
    expect(result[0].id).toBe('plog-2')
    expect(result[1].id).toBe('plog-1')
  })

  it('API 失敗時回傳空陣列', async () => {
    mockDb.query.mockRejectedValue(new Error('fail'))
    expect(await getPriceLog('pp-1')).toEqual([])
  })
})
