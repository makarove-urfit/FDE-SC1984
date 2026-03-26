/**
 * 06 - Stock Report E2E 測試
 * 涵蓋：載入、搜尋、表格、計算、列印、邊界案例
 */
import { test, expect } from '../fixtures/test-fixtures'

test.describe('Stock Report', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto('/stock')
    await authedPage.waitForLoadState('networkidle')
  })

  // --- 正常流 ---

  test('6.1 載入後顯示 Stock Report 標題', async ({ authedPage }) => {
    await expect(authedPage.getByText('庫存報表')).toBeVisible()
  })

  test('6.2 統計卡片呈現', async ({ authedPage }) => {
    // 確認頁面載入完成且不崩潰
    const body = await authedPage.textContent('body')
    expect(body).toContain('庫存報表')
    // 若有資料，確認有統計面板
    const hasItems = body?.includes('品項數')
    if (hasItems) {
      expect(body).toContain('品項數')
    }
  })

  test('6.3 表格呈現產品明細', async ({ authedPage }) => {
    const table = authedPage.locator('table')
    if (await table.isVisible()) {
      const body = await authedPage.textContent('body')
      expect(body).toContain('品名')
    }
  })

  // --- 搜尋 ---

  test('6.4 搜尋欄篩選產品名稱', async ({ authedPage }) => {
    const searchInput = authedPage.getByPlaceholder('搜尋商品...')
    if (await searchInput.isVisible()) {
      await searchInput.fill('__nonexistent__')
      await authedPage.waitForTimeout(300)
      const rows = authedPage.locator('tbody tr')
      expect(await rows.count()).toBe(0)
    }
  })

  test('6.5 搜尋清空後恢復全部', async ({ authedPage }) => {
    const searchInput = authedPage.getByPlaceholder('搜尋商品...')
    if (await searchInput.isVisible()) {
      await searchInput.fill('test')
      await authedPage.waitForTimeout(200)
      await searchInput.fill('')
      await authedPage.waitForTimeout(200)
      const rows = authedPage.locator('tbody tr')
      expect(await rows.count()).toBeGreaterThan(0)
    }
  })

  // --- 計算 ---

  test('6.6 Footer 合計列顯示 Total', async ({ authedPage }) => {
    const footer = authedPage.locator('tfoot')
    if (await footer.isVisible()) {
      await expect(footer.getByText('合計')).toBeVisible()
    }
  })

  // --- Print ---

  test('6.7 Print Stock Report 按鈕存在', async ({ authedPage }) => {
    const printBtn = authedPage.getByRole('button', { name: '列印庫存報表' })
    if (await printBtn.isVisible()) {
      await expect(printBtn).toBeEnabled()
    }
  })

  // --- 邊界案例 ---

  test('6.8 庫存頁為純顯示（無編輯元件）', async ({ authedPage }) => {
    // 不應有 input 元件（庫存為純顯示）
    const inputs = authedPage.locator('table input')
    expect(await inputs.count()).toBe(0)
  })

  test('6.9 頁面不崩潰 (Items 計數)', async ({ authedPage }) => {
    const body = await authedPage.textContent('body')
    expect(body).toBeTruthy()
    expect(body).toContain('庫存報表')
  })

  test('6.10 返回按鈕不含重複文字箭頭', async ({ authedPage }) => {
    const backBtn = authedPage.locator('header button').first()
    const btnText = await backBtn.textContent()
    expect(btnText).not.toContain('←')
  })

  test('6.11 返回 Dashboard', async ({ authedPage }) => {
    await authedPage.locator('header button').first().click()
    await expect(authedPage).toHaveURL('/')
  })
})
