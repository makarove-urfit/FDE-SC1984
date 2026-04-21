import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = {
  query: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}
vi.mock('../client', () => ({ db: mockDb }))
vi.mock('../refCache', () => ({
  getCachedProductTemplates: vi.fn().mockResolvedValue([
    { id: 'tmpl-10', name: '商品甲' },
    { id: 'tmpl-11', name: '商品乙' },
  ]),
}))

const { listProducts } = await import('../products')

beforeEach(() => vi.clearAllMocks())

describe('listProducts', () => {
  it('查詢 product_products 表', async () => {
    mockDb.query.mockResolvedValue([])
    await listProducts()
    expect(mockDb.query).toHaveBeenCalledWith(
      'product_products',
      expect.anything(),
    )
  })

  it('正常時回傳含 id, name, standardPrice, lstPrice 的陣列', async () => {
    mockDb.query.mockResolvedValue([
      { id: 'pp-10', product_tmpl_id: 'tmpl-10', standard_price: 200, lst_price: 250 },
      { id: 'pp-11', product_tmpl_id: 'tmpl-11', standard_price: 380, lst_price: 480 },
    ])
    const result = await listProducts()
    expect(result).toEqual([
      { id: 'pp-10', templateId: 'tmpl-10', name: '商品甲', standardPrice: 200, lstPrice: 250 },
      { id: 'pp-11', templateId: 'tmpl-11', name: '商品乙', standardPrice: 380, lstPrice: 480 },
    ])
  })

  it('無結果時回傳空陣列', async () => {
    mockDb.query.mockResolvedValue([])
    const result = await listProducts()
    expect(result).toEqual([])
  })

  it('API 失敗時回傳空陣列（fail-silent）', async () => {
    mockDb.query.mockRejectedValue(new Error('network error'))
    const result = await listProducts()
    expect(result).toEqual([])
  })
})
