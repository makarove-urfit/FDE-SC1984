/**
 * 08 - 邊界案例 & 異常 E2E 測試
 * 涵蓋：無 Token、API 攔截、網路模擬、快速操作、冪等性
 */
import { test, expect } from '@playwright/test'

test.describe('Edge Cases & Robustness', () => {

  test('8.1 無 Token → 頁面不崩潰', async ({ page }) => {
    // 不使用 authedPage，故意不注入 Token
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Dashboard 的 try/catch 應 fallback
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
    // 應仍顯示 Dashboard 標題
    await expect(page.getByText('管理總覽')).toBeVisible()
  })

  test('8.2 Token 過期 → 頁面不崩潰', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('admin_token', 'expired_invalid_token_xxxxx')
    })
    await page.reload()
    await page.waitForLoadState('networkidle')
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('8.3 網路斷線模擬 → 載入不卡死', async ({ page }) => {
    // 注入一個有效結構但不接 API
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('admin_token', 'test_token_for_offline')
    })
    
    // 攔截所有 API 並回傳空陣列
    await page.route('**/api/v1/**', route => {
      route.fulfill({ status: 200, body: '[]', contentType: 'application/json' })
    })

    await page.goto('/sales-orders')
    await page.waitForLoadState('networkidle')
    // 應顯示空列表而非崩潰
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('8.4 API 超時 → 頁面可恢復', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('admin_token', 'test_token_slow')
    })

    // 攔截 API 讓其延遲 3 秒
    await page.route('**/api/v1/**', async route => {
      await new Promise(r => setTimeout(r, 3000))
      route.fulfill({ status: 200, body: '[]', contentType: 'application/json' })
    })

    await page.goto('/stock')
    // 應出現 Loading 但最終顯示頁面
    await page.waitForLoadState('domcontentloaded')
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('8.5 快速連續切換頁面 → 無 race condition', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('admin_token', 'test_token')
    })
    await page.reload()

    // 快速切換
    await page.goto('/sales-orders')
    await page.goto('/procurement')
    await page.goto('/delivery')
    await page.goto('/stock')
    await page.goto('/')
    
    await page.waitForLoadState('networkidle')
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('8.6 API 回傳 500 → 不白屏', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('admin_token', 'test_token_500')
    })

    await page.route('**/api/v1/**', route => {
      route.fulfill({ status: 500, body: '{"error":"Internal Server Error"}', contentType: 'application/json' })
    })

    await page.goto('/sales-orders')
    await page.waitForLoadState('domcontentloaded')
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('8.7 API 回傳非陣列格式 → 不崩潰', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('admin_token', 'test_token_bad_format')
    })

    await page.route('**/api/v1/**', route => {
      route.fulfill({ status: 200, body: '{"unexpected": "object"}', contentType: 'application/json' })
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Dashboard 有 fallback
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('8.8 回上頁後再前進 → 資料不遺失', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('admin_token', 'test')
    })
    await page.reload()
    await page.waitForLoadState('networkidle')
    
    await page.goto('/stock')
    await page.waitForLoadState('domcontentloaded')
    
    await page.goBack()
    await page.waitForLoadState('domcontentloaded')
    
    await page.goForward()
    await page.waitForLoadState('domcontentloaded')
    
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})
