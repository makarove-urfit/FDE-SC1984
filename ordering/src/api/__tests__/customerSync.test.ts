/**
 * customerSync.ts 自動化測試
 *
 * 覆蓋計畫中定義的 7 個核心路徑 + 6 個邊界案例。
 * 使用 vitest + mock fetch 模擬 Proxy API 回應。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock useAuthStore ---
const mockSetCustomerId = vi.fn()
let mockAuthState: Record<string, unknown> = {}

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: {
    getState: () => ({
      token: 'mock-token',
      setCustomerId: mockSetCustomerId,
      ...mockAuthState,
    }),
  },
}))



// --- Mock fetch ---
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// --- 動態 import 測試模組（必須在 mock 設定後） ---
const { ensureCustomerForCurrentUser } = await import('../customerSync')

// --- 工具函式 ---

/** 建立模擬 fetch 回應 */
function mockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers({ 'content-length': '1' }),
  } as Response
}

/** 取得第 N 次 fetch 的 endpoint 和 body */
function getFetchCall(n: number): { url: string; body: Record<string, unknown> | null } {
  const call = mockFetch.mock.calls[n]
  const url = call[0] as string
  const options = call[1] as RequestInit | undefined
  const body = options?.body ? JSON.parse(options.body as string) : null
  return { url, body }
}

// === 測試 ===

describe('ensureCustomerForCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthState = {}
  })

  // ─────────────────────────
  // 核心路徑
  // ─────────────────────────

  describe('核心路徑', () => {
    it('#1 Email 新註冊（DB 無此 email 的 Customer）→ 建立新 Customer + Rel', async () => {
      mockAuthState = { user: { id: 'user-1', email: 'new@example.com', display_name: '新用戶' } }

      mockFetch
        .mockResolvedValueOnce(mockResponse([]))         // 1. 查 rel → 空
        .mockResolvedValueOnce(mockResponse([]))         // 2. 查 customer → 空
        .mockResolvedValueOnce(mockResponse({ id: 'cust-new', data: {} }))  // 3. 建立 customer
        .mockResolvedValueOnce(mockResponse({ id: 'rel-1', data: {} }))     // 4. 建立 rel

      const result = await ensureCustomerForCurrentUser()

      expect(result).toBe('cust-new')
      expect(mockFetch).toHaveBeenCalledTimes(4)

      // 驗證建立 Customer 的 payload
      const createCustomer = getFetchCall(2)
      expect(createCustomer.url).toContain('customers')
      expect(createCustomer.body).toEqual({
        name: '新用戶',
        email: 'new@example.com',
        customer_type: 'individual',
        status: 'active',
      })

      // 驗證建立 Rel 的 payload
      const createRel = getFetchCall(3)
      expect(createRel.url).toContain('customer_custom_app_user_rel')
      expect(createRel.body).toEqual({
        customer_id: 'cust-new',
        custom_app_user_id: 'user-1',
      })

      // 驗證 setCustomerId 被呼叫
      expect(mockSetCustomerId).toHaveBeenCalledWith('cust-new')
    })

    it('#2 Email 登入（已有 Customer + Rel）→ 不重複建立，回傳同一 customer_id', async () => {
      mockAuthState = { user: { id: 'user-1', email: 'existing@example.com', display_name: '舊用戶' } }

      mockFetch.mockResolvedValueOnce(
        mockResponse([{ id: 'rel-1', customer_id: 'cust-existing', custom_app_user_id: 'user-1' }])
      ) // 1. 查 rel → 找到

      const result = await ensureCustomerForCurrentUser()

      expect(result).toBe('cust-existing')
      expect(mockFetch).toHaveBeenCalledTimes(1) // 只查了 rel，不建立任何東西
      expect(mockSetCustomerId).toHaveBeenCalledWith('cust-existing')
    })

    it('#3 Email 登入（已有 Customer 但無 Rel）→ 建立 Rel 綁定', async () => {
      mockAuthState = { user: { id: 'user-1', email: 'norelbind@example.com', display_name: '無Rel用戶' } }

      mockFetch
        .mockResolvedValueOnce(mockResponse([]))         // 1. 查 rel → 空
        .mockResolvedValueOnce(mockResponse([            // 2. 查 customer → 找到
          { id: 'cust-found', name: '無Rel用戶', email: 'norelbind@example.com', customer_type: 'individual' }
        ]))
        .mockResolvedValueOnce(mockResponse({ id: 'rel-new', data: {} })) // 3. 建立 rel

      const result = await ensureCustomerForCurrentUser()

      expect(result).toBe('cust-found')
      expect(mockFetch).toHaveBeenCalledTimes(3)
      // 不應建立 Customer（只有 3 次呼叫：查rel、查customer、建rel）

      const createRel = getFetchCall(2)
      expect(createRel.body).toEqual({
        customer_id: 'cust-found',
        custom_app_user_id: 'user-1',
      })
      expect(mockSetCustomerId).toHaveBeenCalledWith('cust-found')
    })

    it('#4 LINE 登入（有 email，DB 無此 email 的 Customer）→ 建立新 Customer + Rel', async () => {
      // LINE 用戶有 email — 行為與 #1 相同
      mockAuthState = { user: { id: 'line-user-1', email: 'line-user@example.com', display_name: 'LINE用戶' } }

      mockFetch
        .mockResolvedValueOnce(mockResponse([]))
        .mockResolvedValueOnce(mockResponse([]))
        .mockResolvedValueOnce(mockResponse({ id: 'cust-line', data: {} }))
        .mockResolvedValueOnce(mockResponse({ id: 'rel-line', data: {} }))

      const result = await ensureCustomerForCurrentUser()

      expect(result).toBe('cust-line')
      expect(mockFetch).toHaveBeenCalledTimes(4)
      expect(mockSetCustomerId).toHaveBeenCalledWith('cust-line')
    })

    it('#5 LINE 登入（有 email，DB 已有同 email Customer）→ 綁定現有 Customer', async () => {
      mockAuthState = { user: { id: 'line-user-2', email: 'existing-line@example.com', display_name: 'LINE舊用戶' } }

      mockFetch
        .mockResolvedValueOnce(mockResponse([]))
        .mockResolvedValueOnce(mockResponse([
          { id: 'cust-existing-line', name: '現有', email: 'existing-line@example.com', customer_type: 'individual' }
        ]))
        .mockResolvedValueOnce(mockResponse({ id: 'rel-2', data: {} }))

      const result = await ensureCustomerForCurrentUser()

      expect(result).toBe('cust-existing-line')
      expect(mockFetch).toHaveBeenCalledTimes(3)
      expect(mockSetCustomerId).toHaveBeenCalledWith('cust-existing-line')
    })

    it('#6 LINE 登入（無 email → 補填後）→ 基於補填的 email 判斷 Customer', async () => {
      // 補填後 user.email 已有值，與 #1 流程相同
      mockAuthState = { user: { id: 'line-noemail', email: 'filled-later@example.com', display_name: '補填用戶' } }

      mockFetch
        .mockResolvedValueOnce(mockResponse([]))
        .mockResolvedValueOnce(mockResponse([]))
        .mockResolvedValueOnce(mockResponse({ id: 'cust-filled', data: {} }))
        .mockResolvedValueOnce(mockResponse({ id: 'rel-filled', data: {} }))

      const result = await ensureCustomerForCurrentUser()

      expect(result).toBe('cust-filled')
      expect(mockSetCustomerId).toHaveBeenCalledWith('cust-filled')
    })

    it('#7 下單時使用正確的 customer_id（驗證 store 寫入）', async () => {
      mockAuthState = { user: { id: 'user-order', email: 'order@example.com', display_name: '下單用戶' } }

      mockFetch
        .mockResolvedValueOnce(mockResponse([{ id: 'rel', customer_id: 'cust-order', custom_app_user_id: 'user-order' }]))

      await ensureCustomerForCurrentUser()

      expect(mockSetCustomerId).toHaveBeenCalledWith('cust-order')
      // 驗證 setCustomerId 被呼叫的值不是 user.id（CustomAppUser ID）
      expect(mockSetCustomerId).not.toHaveBeenCalledWith('user-order')
    })
  })

  // ─────────────────────────
  // 邊界案例
  // ─────────────────────────

  describe('邊界案例', () => {
    it('#8 同一 CustomAppUser 重複呼叫 10 次 → 只查 rel（已綁定不重複建立）', async () => {
      mockAuthState = { user: { id: 'user-repeat', email: 'repeat@example.com', display_name: '重複' } }

      // 每次都返回已綁定的 rel
      for (let i = 0; i < 10; i++) {
        mockFetch.mockResolvedValueOnce(
          mockResponse([{ id: 'rel-r', customer_id: 'cust-r', custom_app_user_id: 'user-repeat' }])
        )
      }

      for (let i = 0; i < 10; i++) {
        const result = await ensureCustomerForCurrentUser()
        expect(result).toBe('cust-r')
      }

      // 每次只呼叫 1 次 fetch（查 rel）
      expect(mockFetch).toHaveBeenCalledTimes(10)
      // setCustomerId 被呼叫 10 次，每次都是同一個值
      expect(mockSetCustomerId).toHaveBeenCalledTimes(10)
      for (const call of mockSetCustomerId.mock.calls) {
        expect(call[0]).toBe('cust-r')
      }
    })

    it('#9 兩個 CustomAppUser 使用不同 email → 各自建立獨立 Customer', async () => {
      // 用戶 A
      mockAuthState = { user: { id: 'user-a', email: 'a@example.com', display_name: 'A' } }
      mockFetch
        .mockResolvedValueOnce(mockResponse([]))
        .mockResolvedValueOnce(mockResponse([]))
        .mockResolvedValueOnce(mockResponse({ id: 'cust-a', data: {} }))
        .mockResolvedValueOnce(mockResponse({ id: 'rel-a', data: {} }))

      const resultA = await ensureCustomerForCurrentUser()
      expect(resultA).toBe('cust-a')

      vi.clearAllMocks()

      // 用戶 B
      mockAuthState = { user: { id: 'user-b', email: 'b@example.com', display_name: 'B' } }
      mockFetch
        .mockResolvedValueOnce(mockResponse([]))
        .mockResolvedValueOnce(mockResponse([]))
        .mockResolvedValueOnce(mockResponse({ id: 'cust-b', data: {} }))
        .mockResolvedValueOnce(mockResponse({ id: 'rel-b', data: {} }))

      const resultB = await ensureCustomerForCurrentUser()
      expect(resultB).toBe('cust-b')

      // 各自建立不同的 Customer
      expect(resultA).not.toBe(resultB)
    })

    it('#11 CustomAppUser 無 email（LINE 未補填）→ 不呼叫任何 API', async () => {
      mockAuthState = { user: { id: 'line-noemail', email: '', display_name: 'NoEmail' } }

      const result = await ensureCustomerForCurrentUser()

      expect(result).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
      expect(mockSetCustomerId).not.toHaveBeenCalled()
    })

    it('#11b user 為 null → 直接回傳 null', async () => {
      mockAuthState = { user: null }

      const result = await ensureCustomerForCurrentUser()

      expect(result).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('#12 Customer 被刪除後重新登入 → rel 不存在，以 email 重新建立 Customer + Rel', async () => {
      mockAuthState = { user: { id: 'user-deleted-cust', email: 'deleted@example.com', display_name: '被刪客戶' } }

      mockFetch
        .mockResolvedValueOnce(mockResponse([]))  // 查 rel → 空（Customer 被刪後 cascade 刪 rel）
        .mockResolvedValueOnce(mockResponse([]))  // 查 customer → 空
        .mockResolvedValueOnce(mockResponse({ id: 'cust-recreated', data: {} })) // 建新 customer
        .mockResolvedValueOnce(mockResponse({ id: 'rel-recreated', data: {} }))  // 建新 rel

      const result = await ensureCustomerForCurrentUser()

      expect(result).toBe('cust-recreated')
      expect(mockFetch).toHaveBeenCalledTimes(4)
      expect(mockSetCustomerId).toHaveBeenCalledWith('cust-recreated')
    })

    it('#13 API 錯誤 → 不拋出異常，回傳 null', async () => {
      mockAuthState = { user: { id: 'user-err', email: 'error@example.com', display_name: 'Error' } }

      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Internal Error' }, 500))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await ensureCustomerForCurrentUser()

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalledWith(
        '[CustomerSync] 同步失敗，不影響正常使用:',
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })

    it('#13b 網路斷線 → 不拋出異常，回傳 null', async () => {
      mockAuthState = { user: { id: 'user-offline', email: 'offline@example.com', display_name: 'Offline' } }

      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await ensureCustomerForCurrentUser()

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('email 大小寫與空格正規化 → 以 lowercase trim 後查詢', async () => {
      mockAuthState = { user: { id: 'user-case', email: '  MiXeD@Example.COM  ', display_name: 'Case' } }

      mockFetch
        .mockResolvedValueOnce(mockResponse([]))
        .mockResolvedValueOnce(mockResponse([]))
        .mockResolvedValueOnce(mockResponse({ id: 'cust-case', data: {} }))
        .mockResolvedValueOnce(mockResponse({ id: 'rel-case', data: {} }))

      await ensureCustomerForCurrentUser()

      // 驗證查詢 customer 時使用了正規化的 email
      const queryCustomer = getFetchCall(1)
      expect(queryCustomer.body?.filters).toEqual([
        { column: 'email', op: 'eq', value: 'mixed@example.com' }
      ])

      // 驗證建立 customer 時使用了正規化的 email
      const createCustomer = getFetchCall(2)
      expect(createCustomer.body?.email).toBe('mixed@example.com')
    })
  })
})
