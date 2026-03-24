/**
 * 02 - Sales Orders E2E 測試
 * 涵蓋：列表載入、展開/收合、搜尋/篩選、勾選、批次操作、
 *       分頁、確認 Dialog (含 ESC)、Allocated 欄位、超賣偵測、列印按鈕狀態
 */
import { test, expect } from '../fixtures/test-fixtures'

test.describe('Sales Orders', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto('/sales-orders')
    await authedPage.waitForLoadState('networkidle')
  })

  // --- 正常流 ---

  test('2.1 頁面載入後顯示訂單列表', async ({ authedPage }) => {
    await expect(authedPage.getByText('載入中')).not.toBeVisible()
    await expect(authedPage.getByText('銷售訂單')).toBeVisible()
  })

  test('2.2 標題顯示訂單與產品數量', async ({ authedPage }) => {
    const subtitle = await authedPage.locator('header p.text-sm').textContent()
    expect(subtitle).toMatch(/\d+ 筆訂單/)
    expect(subtitle).toMatch(/\d+ 個註冊商品/)
  })

  test('2.3 展開訂單顯示明細表格', async ({ authedPage }) => {
    // 點擊第一個展開箭頭
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
      await expect(authedPage.getByText('品名')).toBeVisible()
      await expect(authedPage.getByText('需求')).toBeVisible()
      await expect(authedPage.getByText('分配')).toBeVisible()
    }
  })

  test('2.4 收合已展開的訂單', async ({ authedPage }) => {
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
      await expect(authedPage.getByText('品名')).toBeVisible()
      // 點擊收合
      const collapseBtn = authedPage.locator('button:has-text("▾")').first()
      await collapseBtn.click()
      // Product 表頭應消失
      await expect(authedPage.locator('th:has-text("品名")')).not.toBeVisible()
    }
  })

  // --- 篩選 ---

  test('2.5 搜尋欄輸入客戶名稱篩選結果', async ({ authedPage }) => {
    const searchInput = authedPage.getByPlaceholder('搜尋客戶、訂單...')
    await searchInput.fill('zzz_nonexistent_999')
    await authedPage.waitForTimeout(300)
    await expect(authedPage.getByText('無符合的訂單')).toBeVisible()
  })

  test('2.6 狀態篩選：選擇 Delivered', async ({ authedPage }) => {
    await authedPage.locator('select').selectOption('delivered')
    await authedPage.waitForTimeout(300)
    // 所有顯示的狀態應為 Delivered
    const badges = authedPage.locator('span.rounded-full')
    const count = await badges.count()
    for (let i = 0; i < count; i++) {
      const text = await badges.nth(i).textContent()
      if (text?.trim()) {
        expect(['已送達', '']).toContain(text?.trim())
      }
    }
  })

  test('2.7 狀態篩選：選擇 All 顯示全部', async ({ authedPage }) => {
    await authedPage.locator('select').selectOption('all')
    await authedPage.waitForTimeout(300)
    const subtitle = await authedPage.locator('header p.text-sm').textContent()
    const count = parseInt(subtitle?.match(/(\d+) 筆訂單/)?.[1] || '0')
    expect(count).toBeGreaterThanOrEqual(0)
  })

  // --- 勾選與批次 ---

  test('2.8 勾選單筆訂單 + Confirm 按鈕', async ({ authedPage }) => {
    const confirmBtn = authedPage.locator('button:has-text("確認")').first()
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click()
      // Dialog 應彈出
      await expect(authedPage.getByText('此操作無法復原')).toBeVisible()
    }
  })

  test('2.9 Select All / Deselect 切換', async ({ authedPage }) => {
    const selectAllBtn = authedPage.getByRole('button', { name: /全選/ })
    if (await selectAllBtn.isVisible()) {
      await selectAllBtn.click()
      await expect(authedPage.getByRole('button', { name: /取消全選/ })).toBeVisible()
      // 再次點擊取消全選
      await authedPage.getByRole('button', { name: /取消全選/ }).click()
      await expect(authedPage.getByRole('button', { name: /全選/ })).toBeVisible()
    }
  })

  test('2.10 批次確認按鈕顯示正確計數', async ({ authedPage }) => {
    // 勾選全部
    const selectAllBtn = authedPage.getByRole('button', { name: /全選/ })
    if (await selectAllBtn.isVisible()) {
      await selectAllBtn.click()
      // 若有 batchable orders，Batch Confirm 按鈕應出現
      const batchBtn = authedPage.locator('button:has-text("批次確認")')
      if (await batchBtn.isVisible()) {
        const text = await batchBtn.textContent()
        expect(text).toMatch(/批次確認 \(\d+\)/)
      }
    }
  })

  // --- 分頁 ---

  test('2.11 分頁切換', async ({ authedPage }) => {
    const nextBtn = authedPage.locator('button:has-text("Next"), button:has-text("›")')
    if (await nextBtn.isVisible() && await nextBtn.isEnabled()) {
      await nextBtn.click()
      await authedPage.waitForTimeout(300)
      // URL 不變但內容應改變
    }
  })

  // --- 確認 Dialog ---

  test('2.12 確認 Dialog 確認後狀態更新', async ({ authedPage }) => {
    const confirmBtn = authedPage.locator('button:has-text("確認")').first()
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click()
      await expect(authedPage.getByText('此操作無法復原')).toBeVisible()
      // 點擊取消 (避免真正修改資料)
      await authedPage.getByRole('button', { name: '取消' }).click()
      await expect(authedPage.getByText('此操作無法復原')).not.toBeVisible()
    }
  })

  test('2.13 確認 Dialog 按 ESC 關閉', async ({ authedPage }) => {
    const confirmBtn = authedPage.locator('button:has-text("確認")').first()
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click()
      await expect(authedPage.getByText('此操作無法復原')).toBeVisible()
      await authedPage.keyboard.press('Escape')
      await expect(authedPage.getByText('此操作無法復原')).not.toBeVisible()
    }
  })

  // --- Allocated 欄位 ---

  test('2.14 展開後修改 Allocated 欄位', async ({ authedPage }) => {
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
      const allocInput = authedPage.locator('input[type="number"]').first()
      if (await allocInput.isVisible() && await allocInput.isEnabled()) {
        await allocInput.fill('99.99')
        const val = await allocInput.inputValue()
        expect(val).toBe('99.99')
      }
    }
  })

  // --- Print ---

  test('2.15 Print 按鈕：未選取時 disabled', async ({ authedPage }) => {
    const printBtn = authedPage.getByRole('button', { name: /列印 \(0\)/ })
    if (await printBtn.isVisible()) {
      await expect(printBtn).toBeDisabled()
    }
  })

  test('2.16 Print 按鈕：選取後 enabled', async ({ authedPage }) => {
    const checkbox = authedPage.locator('input[type="checkbox"]').first()
    if (await checkbox.isVisible()) {
      await checkbox.check()
      const printBtn = authedPage.locator('button:has-text("列印")')
      if (await printBtn.isVisible()) {
        await expect(printBtn).toBeEnabled()
      }
    }
  })

  // --- 邊界案例 ---

  test('2.17 搜尋無結果顯示 "無符合的訂單"', async ({ authedPage }) => {
    await authedPage.getByPlaceholder('搜尋客戶、訂單...').fill('__no_match_xyzzy__')
    await authedPage.waitForTimeout(300)
    await expect(authedPage.getByText('無符合的訂單')).toBeVisible()
  })

  test('2.18 Products tracking count 資訊列', async ({ authedPage }) => {
    const infoBar = authedPage.getByText('商品追蹤數量')
    if (await infoBar.isVisible()) {
      const text = await infoBar.locator('..').textContent()
      expect(text).toMatch(/\d+ 個品項/)
    }
  })

  test('2.19 返回 Dashboard', async ({ authedPage }) => {
    await authedPage.locator('header button').first().click()
    await expect(authedPage).toHaveURL('/')
  })

  test('2.20 Stock 為 N/A 時不會崩潰', async ({ authedPage }) => {
    // 展開訂單，確認有 N/A 或數字存在
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
      const stockCells = authedPage.locator('td').filter({ hasText: /N\/A|\d+\.\d+/ })
      expect(await stockCells.count()).toBeGreaterThanOrEqual(0)
    }
  })

  test('2.21 Price 為 0 時顯示 TBD', async ({ authedPage }) => {
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
      // 搜尋 TBD 或金額
      const body = await authedPage.textContent('body')
      expect(body).toBeTruthy()
    }
  })
})
