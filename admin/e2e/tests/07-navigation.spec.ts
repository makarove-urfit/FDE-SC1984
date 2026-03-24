/**
 * 07 - 全站導航 E2E 測試
 * 涵蓋：每頁返回 Dashboard、未知路由重導、頁面互切穩定性
 */
import { test, expect } from '../fixtures/test-fixtures'

test.describe('Navigation', () => {
  test('7.1 每頁「←」返回 Dashboard', async ({ authedPage }) => {
    const pages = ['/sales-orders', '/procurement', '/delivery']
    for (const path of pages) {
      await authedPage.goto(path)
      await authedPage.waitForLoadState('networkidle')
      // 點擊返回
      await authedPage.locator('header button').first().click()
      await expect(authedPage).toHaveURL('/')
    }
  })

  test('7.2 未知路由重導至 /', async ({ authedPage }) => {
    await authedPage.goto('/totally-fake-route-12345')
    await expect(authedPage).toHaveURL('/')
  })

  test('7.3 快速切換各頁面不崩潰', async ({ authedPage }) => {
    const routes = ['/', '/sales-orders', '/procurement', '/purchase-list', '/delivery', '/stock', '/']
    for (const route of routes) {
      await authedPage.goto(route)
      await authedPage.waitForLoadState('domcontentloaded')
    }
    // 最後應在 Dashboard
    await expect(authedPage.getByText('管理總覽')).toBeVisible()
  })
})
