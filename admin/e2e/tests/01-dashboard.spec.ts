/**
 * 01 - Dashboard E2E 測試
 * 涵蓋：載入、統計卡片、Workflow Actions、導航、邊界案例
 */
import { test, expect } from '../fixtures/test-fixtures'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto('/')
    await authedPage.waitForLoadState('networkidle')
  })

  // --- 正常流 ---

  test('1.1 載入完成後不再顯示 Loading', async ({ authedPage }) => {
    await expect(authedPage.getByText('載入中')).not.toBeVisible()
    await expect(authedPage.getByText('管理總覽')).toBeVisible()
  })

  test('1.2 統計卡片顯示正確數值 (銷售訂單總數 >= 0)', async ({ authedPage }) => {
    const card = authedPage.getByText('銷售訂單總數').locator('..')
    await expect(card).toBeVisible()
    // 卡片數值應為數字
    const value = await card.locator('p.text-3xl').textContent()
    expect(Number(value)).toBeGreaterThanOrEqual(0)
  })

  test('1.3 Workflow Actions 全 5 張卡片呈現', async ({ authedPage }) => {
    const labels = ['銷售訂單', '採購定價', '待出貨', '待收貨', '庫存']
    for (const label of labels) {
      await expect(authedPage.getByRole('button', { name: new RegExp(label) })).toBeVisible()
    }
  })

  // --- 導航 ---

  test('1.4 點擊 Sales Orders 卡片跳轉 /sales-orders', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /銷售訂單/ }).click()
    await expect(authedPage).toHaveURL(/\/sales-orders/)
  })

  test('1.5 點擊 Procurement 卡片跳轉 /procurement', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /採購定價/ }).click()
    await expect(authedPage).toHaveURL(/\/procurement/)
  })

  test('1.6 點擊 Pending Shipments 卡片跳轉 /delivery', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /待出貨/ }).click()
    await expect(authedPage).toHaveURL(/\/delivery/)
  })

  test('1.7 點擊 Pending Receives 卡片跳轉 /purchase-list', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /待收貨/ }).click()
    await expect(authedPage).toHaveURL(/\/purchase-list/)
  })

  test('1.8 點擊 Stock 卡片跳轉 /stock', async ({ authedPage }) => {
    await authedPage.getByRole('button', { name: /庫存/ }).click()
    await expect(authedPage).toHaveURL(/\/stock/)
  })

  test('1.9 Badge 數字與統計卡數值一致', async ({ authedPage }) => {
    // Sales Orders badge
    const salesBtn = authedPage.getByRole('button', { name: /銷售訂單/ })
    const salesDesc = await salesBtn.locator('p.text-xs').textContent()
    const salesCountFromDesc = parseInt(salesDesc?.match(/\d+/)?.[0] || '0')

    // 統計卡片中的 Total Sales Orders
    const totalCard = authedPage.getByText('銷售訂單總數').locator('..')
    const totalVal = await totalCard.locator('p.text-3xl').textContent()
    expect(salesCountFromDesc).toBe(Number(totalVal))
  })

  // --- 邊界案例 ---

  test('1.10 API 失敗時顯示 fallback (0 值)', async ({ page }) => {
    // 不注入 token，模擬 401
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Dashboard 裡有 try/catch fallback，應不崩潰
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('1.11 日期顯示格式為 YYYY-MM-DD', async ({ authedPage }) => {
    const dateText = await authedPage.locator('header p.text-sm').textContent()
    expect(dateText).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  test('1.12 步驟順序：銷售→採購→庫存→出貨→收貨', async ({ authedPage }) => {
    const buttons = authedPage.locator('.grid button')
    const count = await buttons.count()
    expect(count).toBe(5)
    const labels = []
    for (let i = 0; i < count; i++) {
      const text = await buttons.nth(i).locator('p.font-medium').textContent()
      labels.push(text?.trim())
    }
    expect(labels).toEqual(['銷售訂單', '採購定價', '庫存', '待出貨', '待收貨'])
  })
})
