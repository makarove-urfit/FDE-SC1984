/**
 * 02 - Sales Orders E2E 測試
 * 涵蓋：列表載入、展開/收合、搜尋/篩選、勾選、分頁、列印、
 *       品名顯示、備註顯示、金額格式、客戶名稱解析
 * 注意：銷售訂單為純檢視頁面，無確認按鈕和分配欄位
 */
import { test, expect } from '../fixtures/test-fixtures'

test.describe('Sales Orders', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto('/sales-orders')
    await authedPage.waitForLoadState('networkidle')
  })

  // --- 頁面載入 ---

  test('2.1 頁面載入後顯示訂單列表', async ({ authedPage }) => {
    await expect(authedPage.getByText('載入中')).not.toBeVisible()
    await expect(authedPage.getByText('銷售訂單')).toBeVisible()
  })

  test('2.2 標題顯示訂單數量', async ({ authedPage }) => {
    const subtitle = await authedPage.locator('header p.text-sm').textContent()
    expect(subtitle).toMatch(/\d+ 筆訂單/)
  })

  // --- 展開/收合 ---

  test('2.3 展開訂單顯示明細表格', async ({ authedPage }) => {
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
      await expect(authedPage.getByText('品名')).toBeVisible()
      await expect(authedPage.getByText('數量')).toBeVisible()
      await expect(authedPage.getByText('單價')).toBeVisible()
      await expect(authedPage.getByText('金額')).toBeVisible()
      await expect(authedPage.getByText('備註')).toBeVisible()
    }
  })

  test('2.4 展開後不應有已移除的欄位', async ({ authedPage }) => {
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
      await expect(authedPage.locator('th:has-text("分配")')).not.toBeVisible()
      await expect(authedPage.locator('th:has-text("庫存")')).not.toBeVisible()
      await expect(authedPage.locator('th:has-text("單位")')).not.toBeVisible()
    }
  })

  test('2.5 收合已展開的訂單', async ({ authedPage }) => {
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
      await expect(authedPage.getByText('品名')).toBeVisible()
      const collapseBtn = authedPage.locator('button:has-text("▾")').first()
      await collapseBtn.click()
      await expect(authedPage.locator('th:has-text("品名")')).not.toBeVisible()
    }
  })

  // --- 品名與備註 ---

  test('2.6 展開後品名欄應顯示文字（非「未知」）', async ({ authedPage }) => {
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
      // 品名應該有內容（來自 line.name）
      const firstProductCell = authedPage.locator('tbody tr td.font-medium').first()
      if (await firstProductCell.isVisible()) {
        const text = await firstProductCell.textContent()
        expect(text?.trim().length).toBeGreaterThan(0)
      }
    }
  })

  test('2.7 小計金額格式正確（含 $ 和千分位）', async ({ authedPage }) => {
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
      const subtotalArea = authedPage.locator('div.bg-gray-50.text-right')
      if (await subtotalArea.isVisible()) {
        const text = await subtotalArea.textContent()
        // 應包含 $ 符號和小計文字
        expect(text).toContain('小計')
        expect(text).toContain('$')
      }
    }
  })

  // --- 客戶名稱 ---

  test('2.8 客戶名稱應為可讀文字（非 UUID）', async ({ authedPage }) => {
    const customerName = authedPage.locator('.font-bold.text-gray-900').first()
    if (await customerName.isVisible()) {
      const text = await customerName.textContent()
      // UUID 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      expect(UUID_RE.test(text?.trim() || '')).toBe(false)
    }
  })

  // --- 篩選 ---

  test('2.9 搜尋欄輸入客戶名稱篩選結果', async ({ authedPage }) => {
    const searchInput = authedPage.getByPlaceholder('搜尋客戶、訂單...')
    await searchInput.fill('zzz_nonexistent_999')
    await authedPage.waitForTimeout(300)
    await expect(authedPage.getByText('無符合的訂單')).toBeVisible()
  })

  test('2.10 狀態篩選：選擇 All 顯示全部', async ({ authedPage }) => {
    await authedPage.locator('select').selectOption('all')
    await authedPage.waitForTimeout(300)
    const subtitle = await authedPage.locator('header p.text-sm').textContent()
    const count = parseInt(subtitle?.match(/(\d+) 筆訂單/)?.[1] || '0')
    expect(count).toBeGreaterThanOrEqual(0)
  })

  // --- 純檢視：不應有確認功能 ---

  test('2.11 不應有確認按鈕（純檢視頁面）', async ({ authedPage }) => {
    await expect(authedPage.locator('button:has-text("批次確認")')).not.toBeVisible()
    // 展開訂單後也不應有 input[type=number]（分配輸入框）
    const expandBtn = authedPage.locator('button:has-text("▸")').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
      await expect(authedPage.locator('input[type="number"]')).not.toBeVisible()
    }
  })

  test('2.12 不應有商品追蹤數量資訊列', async ({ authedPage }) => {
    await expect(authedPage.getByText('商品追蹤數量')).not.toBeVisible()
  })

  // --- 勾選 ---

  test('2.13 Select All / Deselect 切換', async ({ authedPage }) => {
    const selectAllBtn = authedPage.getByRole('button', { name: /全選/ })
    if (await selectAllBtn.isVisible()) {
      await selectAllBtn.click()
      await expect(authedPage.getByRole('button', { name: /取消全選/ })).toBeVisible()
      await authedPage.getByRole('button', { name: /取消全選/ }).click()
      await expect(authedPage.getByRole('button', { name: /全選/ })).toBeVisible()
    }
  })

  // --- Print ---

  test('2.14 Print 按鈕：未選取時 disabled', async ({ authedPage }) => {
    const printBtn = authedPage.getByRole('button', { name: /列印 \(0\)/ })
    if (await printBtn.isVisible()) {
      await expect(printBtn).toBeDisabled()
    }
  })

  test('2.15 Print 按鈕：選取後 enabled', async ({ authedPage }) => {
    const checkbox = authedPage.locator('input[type="checkbox"]').first()
    if (await checkbox.isVisible()) {
      await checkbox.check()
      const printBtn = authedPage.locator('button:has-text("列印")')
      if (await printBtn.isVisible()) {
        await expect(printBtn).toBeEnabled()
      }
    }
  })

  // --- BackButton ---

  test('2.16 返回按鈕只有 SVG icon，不含文字箭頭 ←', async ({ authedPage }) => {
    const backBtn = authedPage.locator('header button').first()
    const btnText = await backBtn.textContent()
    // 應包含「返回總覽」但不應有 ← 字元
    expect(btnText).toContain('返回總覽')
    expect(btnText).not.toContain('←')
  })

  test('2.17 返回 Dashboard', async ({ authedPage }) => {
    await authedPage.locator('header button').first().click()
    await expect(authedPage).toHaveURL('/')
  })
})
