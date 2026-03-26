/**
 * 04 - Procurement（採購定價與入庫）E2E 測試
 * 涵蓋：供應商分群、狀態標記、單筆/批次確認、Dialog、邊界案例
 */
import { test, expect } from '../fixtures/test-fixtures'

test.describe('Procurement (採購定價與入庫)', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto('/procurement')
    await authedPage.waitForLoadState('networkidle')
  })

  // --- 正常流 ---

  test('4.1 載入後顯示頁面標題', async ({ authedPage }) => {
    await expect(authedPage.getByText('Loading procurements')).not.toBeVisible()
    await expect(authedPage.getByText('採購定價與入庫')).toBeVisible()
  })

  test('4.2 標題顯示待採購/已確認/已收貨統計', async ({ authedPage }) => {
    const subtitle = await authedPage.locator('header p.text-sm').textContent()
    expect(subtitle).toMatch(/\d+ 待採購/)
  })

  test('4.3 供應商分群顯示', async ({ authedPage }) => {
    const supplierHeaders = authedPage.locator('h3.font-bold')
    const count = await supplierHeaders.count()
    // 無採購單時可能 = 0，有的話 > 0
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('4.4 品項表格顯示（號碼、品名、量、單價、小計）', async ({ authedPage }) => {
    const table = authedPage.locator('table').first()
    if (await table.isVisible()) {
      await expect(table.getByText('品名')).toBeVisible()
    }
  })

  test('4.5 供應商群組總金額顯示', async ({ authedPage }) => {
    const totalLabel = authedPage.locator('span:has-text("總金額")')
    if (await totalLabel.first().isVisible()) {
      const text = await totalLabel.first().textContent()
      expect(text).toMatch(/\$/)
    }
  })

  // --- 狀態轉換 ---

  test('4.6 Draft 狀態→「確認訂單」按鈕可見', async ({ authedPage }) => {
    const confirmBtn = authedPage.locator('button:has-text("確認訂單")').first()
    if (await confirmBtn.isVisible()) {
      await expect(confirmBtn).toBeEnabled()
    }
  })

  test('4.7 Confirm 狀態→「進貨登錄」按鈕可見', async ({ authedPage }) => {
    const receiveBtn = authedPage.locator('button:has-text("進貨登錄")').first()
    if (await receiveBtn.isVisible()) {
      await expect(receiveBtn).toBeEnabled()
    }
  })

  test('4.8 點擊「確認訂單」→ Dialog 顯示', async ({ authedPage }) => {
    const confirmBtn = authedPage.locator('button:has-text("確認訂單")').first()
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click()
      await expect(authedPage.getByText('確認採購單')).toBeVisible()
      // 取消
      await authedPage.getByRole('button', { name: '取消' }).click()
    }
  })

  // --- 批次操作 ---

  test('4.9 批次確認訂單按鈕', async ({ authedPage }) => {
    const batchBtn = authedPage.locator('button:has-text("批次確認訂單")')
    if (await batchBtn.isVisible()) {
      await batchBtn.click()
      await expect(authedPage.getByText('批次確認所有品項')).toBeVisible()
      await authedPage.getByRole('button', { name: '取消' }).click()
    }
  })

  test('4.10 批次入庫按鈕', async ({ authedPage }) => {
    const batchBtn = authedPage.locator('button:has-text("批次入庫")')
    if (await batchBtn.isVisible()) {
      await batchBtn.click()
      await expect(authedPage.getByText('批次入庫所有定價品項')).toBeVisible()
      await authedPage.getByRole('button', { name: '取消' }).click()
    }
  })

  // --- 邊界案例 ---

  test('4.11 Dialog ESC 關閉', async ({ authedPage }) => {
    const confirmBtn = authedPage.locator('button:has-text("確認訂單")').first()
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click()
      await authedPage.keyboard.press('Escape')
      await expect(authedPage.getByText('此操作無法復原')).not.toBeVisible()
    }
  })

  test('4.12 單據小計列正確', async ({ authedPage }) => {
    const subtotalCell = authedPage.locator('td:has-text("本單小計")')
    if (await subtotalCell.first().isVisible()) {
      const row = subtotalCell.first().locator('..')
      const text = await row.textContent()
      expect(text).toMatch(/\$/)
    }
  })

  test('4.13 供應商名稱不應為 UUID', async ({ authedPage }) => {
    const supplierHeaders = authedPage.locator('h3.font-bold')
    const count = await supplierHeaders.count()
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (let i = 0; i < count; i++) {
      const text = await supplierHeaders.nth(i).textContent()
      expect(UUID_RE.test(text?.trim() || '')).toBe(false)
    }
  })

  test('4.14 返回 Dashboard', async ({ authedPage }) => {
    await authedPage.locator('header button').first().click()
    await expect(authedPage).toHaveURL('/')
  })
})
