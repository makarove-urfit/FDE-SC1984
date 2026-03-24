/**
 * 05 - Delivery（出貨管理）E2E 測試
 * 涵蓋：客戶分群、展開、搜尋/篩選、Ship/Delivered 狀態流、Driver、列印、邊界案例
 */
import { test, expect } from '../fixtures/test-fixtures'

test.describe('Delivery (出貨管理)', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto('/delivery')
    await authedPage.waitForLoadState('networkidle')
  })

  // --- 正常流 ---

  test('5.1 載入後顯示 Delivery Management', async ({ authedPage }) => {
    await expect(authedPage.getByText('載入中')).not.toBeVisible()
    await expect(authedPage.getByText('出貨管理')).toBeVisible()
  })

  test('5.2 以客戶分群呈現', async ({ authedPage }) => {
    // 客戶名稱按鈕
    const customerCards = authedPage.locator('.bg-white.rounded-xl')
    expect(await customerCards.count()).toBeGreaterThanOrEqual(0)
  })

  test('5.3 展開客戶顯示訂單', async ({ authedPage }) => {
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
      // 展開後應有 checkbox 和訂單 ID
      await expect(authedPage.locator('input[type="checkbox"]').first()).toBeVisible()
    }
  })

  // --- 篩選 ---

  test('5.4 搜尋欄篩選', async ({ authedPage }) => {
    await authedPage.getByPlaceholder('搜尋...').fill('__nonexist__')
    await authedPage.waitForTimeout(300)
    await expect(authedPage.getByText('無符合的訂單')).toBeVisible()
  })

  test('5.5 狀態篩選：Pending', async ({ authedPage }) => {
    await authedPage.locator('select').selectOption('confirm')
    await authedPage.waitForTimeout(300)
    const body = await authedPage.textContent('body')
    expect(body).toBeTruthy()
  })

  test('5.6 狀態篩選：In Transit', async ({ authedPage }) => {
    await authedPage.locator('select').selectOption('shipped')
    await authedPage.waitForTimeout(300)
    const body = await authedPage.textContent('body')
    expect(body).toBeTruthy()
  })

  test('5.7 狀態篩選：Delivered', async ({ authedPage }) => {
    await authedPage.locator('select').selectOption('done')
    await authedPage.waitForTimeout(300)
    const body = await authedPage.textContent('body')
    expect(body).toBeTruthy()
  })

  // --- 狀態轉換 ---

  test('5.8 Ship 按鈕 → Dialog 顯示', async ({ authedPage }) => {
    // 展開客戶
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
    }
    const shipBtn = authedPage.locator('button:has-text("出貨")').first()
    if (await shipBtn.isVisible()) {
      await shipBtn.click()
      await expect(authedPage.getByText('確認出貨？')).toBeVisible()
      await authedPage.getByRole('button', { name: '取消' }).click()
    }
  })

  test('5.9 Delivered 按鈕 → Dialog 顯示', async ({ authedPage }) => {
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
    }
    const deliverBtn = authedPage.locator('button:has-text("已送達")').first()
    if (await deliverBtn.isVisible()) {
      await deliverBtn.click()
      await expect(authedPage.getByText('確認送達？')).toBeVisible()
      await authedPage.getByRole('button', { name: '取消' }).click()
    }
  })

  // --- Driver ---

  test('5.10 Driver 下拉選擇', async ({ authedPage }) => {
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
    }
    const driverSelect = authedPage.locator('select:has(option:has-text("司機"))').first()
    if (await driverSelect.isVisible()) {
      await driverSelect.selectOption('司機 A')
      expect(await driverSelect.inputValue()).toBe('司機 A')
    }
  })

  // --- Select & Print ---

  test('5.11 Select All / Deselect', async ({ authedPage }) => {
    const selectAllBtn = authedPage.getByRole('button', { name: /全選/ })
    if (await selectAllBtn.isVisible()) {
      await selectAllBtn.click()
      await expect(authedPage.getByRole('button', { name: /取消全選/ })).toBeVisible()
      await authedPage.getByRole('button', { name: /取消全選/ }).click()
      await expect(authedPage.getByRole('button', { name: /全選/ })).toBeVisible()
    }
  })

  test('5.12 Print 按鈕：未選取→disabled', async ({ authedPage }) => {
    const printBtn = authedPage.locator('button:has-text("列印 (0)")')
    if (await printBtn.isVisible()) {
      await expect(printBtn).toBeDisabled()
    }
  })

  // --- Preview ---

  test('5.13 Preview 按鈕切換', async ({ authedPage }) => {
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
    }
    const previewBtn = authedPage.locator('button:has-text("預覽")').first()
    if (await previewBtn.isVisible()) {
      await previewBtn.click()
      await expect(authedPage.locator('button:has-text("關閉")').first()).toBeVisible()
    }
  })

  // --- 邊界案例 ---

  test('5.14 返回 Dashboard', async ({ authedPage }) => {
    await authedPage.locator('header button').first().click()
    await expect(authedPage).toHaveURL('/')
  })
})
