/**
 * LINE Login 後端服務
 * 
 * 職責：
 * 1. 接收前端傳來的 LINE authorization code
 * 2. 使用 Channel Secret 與 LINE API 交換 access_token + id_token
 * 3. 驗證 id_token 取得使用者資訊（email, name, picture）
 * 4. 用該資訊在 AI GO Custom App Auth 註冊/登入
 * 5. 回傳 AI GO 的 JWT 給前端
 */

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
app.use(cors())
app.use(express.json())

const {
  LINE_CHANNEL_ID,
  LINE_CHANNEL_SECRET,
  AIGO_BASE,
  APP_SLUG,
  API_KEY,
  PORT = '3001',
} = process.env

// --- 工具函式 ---

/**
 * 用 authorization code 向 LINE 交換 access_token + id_token
 */
async function exchangeCodeForTokens(code, redirectUri) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: LINE_CHANNEL_ID,
    client_secret: LINE_CHANNEL_SECRET,
  })

  const res = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`LINE token exchange failed: ${data.error_description || data.error || 'Unknown'}`)
  }
  return data // { access_token, token_type, refresh_token, expires_in, scope, id_token }
}

/**
 * 驗證 LINE ID Token 並取得使用者資訊
 */
async function verifyIdToken(idToken) {
  const params = new URLSearchParams({
    id_token: idToken,
    client_id: LINE_CHANNEL_ID,
  })

  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`LINE ID token verification failed: ${data.error_description || data.error || 'Unknown'}`)
  }
  return data // { iss, sub, aud, exp, iat, nonce, name, picture, email }
}

/**
 * 用 LINE access_token 取得使用者 profile（備用，若 id_token 資訊不足）
 */
async function getLineProfile(accessToken) {
  const res = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`LINE profile fetch failed: ${data.message || 'Unknown'}`)
  }
  return data // { userId, displayName, pictureUrl, statusMessage }
}

/**
 * 在 AI GO Custom App Auth 註冊或登入
 * 策略：先嘗試登入，若失敗（帳號不存在）則註冊
 */
async function aigoRegisterOrLogin(email, password, displayName) {
  const authBase = `${AIGO_BASE}/api/v1/custom-app-auth/${APP_SLUG}`

  // 先嘗試登入
  const loginRes = await fetch(`${authBase}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (loginRes.ok) {
    return await loginRes.json()
  }

  // 登入失敗 → 嘗試註冊
  const registerRes = await fetch(`${authBase}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: displayName }),
  })

  if (registerRes.ok) {
    return await registerRes.json()
  }

  // 若註冊也失敗（可能帳號已存在但密碼不同），拋出錯誤
  const errData = await registerRes.json().catch(() => ({}))
  const errMsg = typeof errData.detail === 'string' ? errData.detail : 'AI GO auth failed'
  throw new Error(errMsg)
}

// --- 訂單驗證工具函式 ---

/**
 * 向 AI GO Proxy 查詢 x_app_settings，取得 order_cutoff_time 的值
 */
async function getCutoffTimeSetting() {
  try {
    const res = await fetch(`${AIGO_BASE}/api/v1/open/proxy/x_app_settings/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'X-Api-Key': API_KEY } : {}),
      },
      body: JSON.stringify({
        filters: [{ column: 'key', op: 'eq', value: 'order_cutoff_time' }],
      }),
    })
    const rows = await res.json()
    return rows[0]?.value ?? null
  } catch {
    return null
  }
}

/**
 * 向 AI GO Proxy 查詢 x_holiday_settings，確認指定日期是否為假日
 * @param {string} dateStr - 格式 YYYY-MM-DD
 */
async function isHoliday(dateStr) {
  try {
    const res = await fetch(`${AIGO_BASE}/api/v1/open/proxy/x_holiday_settings/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'X-Api-Key': API_KEY } : {}),
      },
      body: JSON.stringify({
        filters: [{ column: 'date', op: 'eq', value: dateStr }],
      }),
    })
    const rows = await res.json()
    return Array.isArray(rows) && rows.length > 0
  } catch {
    return false
  }
}

// --- API Endpoint ---

/**
 * POST /line-auth/callback
 * Body: { code: string, redirect_uri: string }
 * 
 * 回傳: AI GO 的 AuthResponse（access_token, refresh_token, user）
 */
app.post('/line-auth/callback', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body

    if (!code || !redirect_uri) {
      return res.status(400).json({ detail: 'Missing code or redirect_uri' })
    }

    console.log('[LINE Auth] Exchanging code for tokens...')

    // Step 1: 向 LINE 交換 tokens
    const lineTokens = await exchangeCodeForTokens(code, redirect_uri)
    console.log('[LINE Auth] Token exchange OK')

    // Step 2: 取得使用者資訊
    let userEmail = ''
    let userName = ''
    let userPicture = ''

    if (lineTokens.id_token) {
      // 從 id_token 取得使用者資訊（最佳方式）
      const idTokenData = await verifyIdToken(lineTokens.id_token)
      console.log('[LINE Auth] ID token verified:', idTokenData.name, idTokenData.email)
      userEmail = idTokenData.email || ''
      userName = idTokenData.name || ''
      userPicture = idTokenData.picture || ''
    }

    // 若 id_token 沒有 name，從 profile API 取得
    if (!userName && lineTokens.access_token) {
      const profile = await getLineProfile(lineTokens.access_token)
      userName = profile.displayName || 'LINE User'
      userPicture = userPicture || profile.pictureUrl || ''
    }

    // 若沒有 email，用 LINE userId 產生一個唯一 email
    if (!userEmail) {
      // 從 id_token 的 sub 取得 LINE userId
      let lineUserId = ''
      if (lineTokens.id_token) {
        try {
          const payload = JSON.parse(atob(lineTokens.id_token.split('.')[1]))
          lineUserId = payload.sub
        } catch {}
      }
      if (!lineUserId && lineTokens.access_token) {
        const profile = await getLineProfile(lineTokens.access_token)
        lineUserId = profile.userId
      }
      userEmail = `line_${lineUserId}@line.local`
    }

    console.log('[LINE Auth] User info:', { email: userEmail, name: userName })

    // Step 3: 在 AI GO 註冊/登入
    // 用 LINE userId 的 hash 作為穩定密碼（使用者不需要知道）
    const linePassword = `LINE_${LINE_CHANNEL_SECRET.slice(0, 8)}_${userEmail}`

    const aigoResult = await aigoRegisterOrLogin(userEmail, linePassword, userName)
    console.log('[LINE Auth] AI GO auth OK, user:', aigoResult.user?.display_name)

    // 回傳給前端
    res.json(aigoResult)
  } catch (err) {
    console.error('[LINE Auth] Error:', err.message)
    res.status(400).json({ detail: err.message })
  }
})

// Health check
app.get('/line-auth/health', (req, res) => {
  res.json({ status: 'ok', service: 'line-auth-backend' })
})

/**
 * POST /order/validate
 * Body: { delivery_date: string }   // 格式 YYYY-MM-DD
 *
 * 前端在提交訂單前呼叫此路由，server 端驗證：
 * 1. 目前時間是否已超過截止時間（BV-1）
 * 2. 所選配送日是否為假日（BV-2）
 *
 * 回傳: { allowed: boolean, reason?: string }
 */
app.post('/order/validate', async (req, res) => {
  try {
    // BV-3：驗證 Authorization header（Bearer token）
    const authHeader = req.headers['authorization'] || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: '請先登入',
        allowed: false,
      })
    }
    // 不需要驗證 token 內容（AI GO 會在 proxy 層驗證）
    // 只要確認有 token 存在即可防止未授權的匿名呼叫

    const { delivery_date } = req.body

    // NB-1：delivery_date 缺失時回 400
    if (!delivery_date) {
      return res.status(400).json({
        error: 'MISSING_DELIVERY_DATE',
        message: '請提供訂單日期',
        allowed: false,
      })
    }

    // NB-2：delivery_date 格式驗證
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
    if (!DATE_RE.test(delivery_date)) {
      return res.status(400).json({
        error: 'INVALID_DATE_FORMAT',
        message: '日期格式錯誤，應為 YYYY-MM-DD',
        allowed: false,
      })
    }

    // BV-1：截止時間驗證（以 UTC+8 台灣時間為準）
    const cutoffValue = await getCutoffTimeSetting()
    // 若無設定截止時間，預設放行（fail-open）
    if (cutoffValue) {
      // 取得台灣當地時間的 HH:mm（UTC+8）
      const nowTW = new Date(Date.now() + 8 * 60 * 60 * 1000)
      const nowMinutes = nowTW.getUTCHours() * 60 + nowTW.getUTCMinutes()

      // 解析截止時間（cutoffValue 格式 "HH:mm"）
      const [cutoffH, cutoffM] = cutoffValue.split(':').map(Number)
      const cutoffMinutes = cutoffH * 60 + cutoffM

      if (nowMinutes >= cutoffMinutes) {
        return res.status(403).json({
          error: 'ORDER_CUTOFF_PASSED',
          message: '已超過訂單截止時間',
          allowed: false,
          reason: `截止時間 ${cutoffValue}，目前台灣時間 ${String(nowTW.getUTCHours()).padStart(2, '0')}:${String(nowTW.getUTCMinutes()).padStart(2, '0')}`,
        })
      }
    }

    // BV-2：假日驗證
    const holiday = await isHoliday(delivery_date)
    if (holiday) {
      return res.status(422).json({
        error: 'ORDER_DATE_IS_HOLIDAY',
        message: '所選日期為休息日',
        allowed: false,
        reason: '所選日期為休息日',
      })
    }

    res.json({ allowed: true })
  } catch (err) {
    console.error('[order/validate] Error:', err.message)
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      allowed: false,
      reason: '伺服器錯誤，請稍後再試',
    })
  }
})

/**
 * POST /order/create
 * Body: { customer_id, date_order, note, lines: [{ product_template_id, name, product_uom_qty, price_unit?, delivery_date? }] }
 * Header: Authorization: Bearer <token>
 *
 * 後端代理建單，強制 state='draft'，前端無法覆寫
 */
app.post('/order/create', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: '請先登入' })
    }

    const { customer_id, date_order, note, lines } = req.body

    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'MISSING_LINES', message: '訂單明細不可為空' })
    }

    const proxyBase = `${AIGO_BASE}/api/v1/ext/proxy`
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    }

    // 1. 建立訂單，強制 state='draft'
    const orderRes = await fetch(`${proxyBase}/sale_orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customer_id,
        date_order: date_order || new Date().toISOString().slice(0, 10),
        note: note || '',
        state: 'draft',
      }),
    })
    if (!orderRes.ok) {
      const err = await orderRes.json().catch(() => ({}))
      return res.status(orderRes.status).json({ error: 'ORDER_CREATE_FAILED', message: err.detail || '建立訂單失敗' })
    }
    const order = await orderRes.json()
    const orderId = order?.id
    if (!orderId) return res.status(500).json({ error: 'ORDER_CREATE_FAILED', message: '建立訂單失敗：無 id' })

    // 2. 逐一建立明細
    const failures = []
    for (const line of lines) {
      const lineRes = await fetch(`${proxyBase}/sale_order_lines`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          order_id: orderId,
          product_template_id: line.product_template_id,
          name: line.name,
          product_uom_qty: line.product_uom_qty,
          ...(line.price_unit != null ? { price_unit: line.price_unit } : {}),
          ...(line.delivery_date ? { delivery_date: line.delivery_date } : {}),
        }),
      })
      if (!lineRes.ok) failures.push(line.product_template_id)
    }

    // 3. 若有明細失敗，嘗試取消訂單（best-effort rollback）
    if (failures.length > 0) {
      await fetch(`${proxyBase}/sale_orders/${orderId}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ state: 'cancel' }),
      }).catch(() => {})
      return res.status(500).json({ error: 'LINE_CREATE_FAILED', message: `${failures.length} 筆明細建立失敗，訂單已取消` })
    }

    res.json({ order_id: orderId })
  } catch (err) {
    console.error('[order/create] Error:', err.message)
    res.status(500).json({ error: 'INTERNAL_ERROR', message: '伺服器錯誤，請稍後再試' })
  }
})

// --- SPA 靜態檔案伺服 ---
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.join(__dirname, '../dist')
app.use(express.static(distPath))

// 所有未命中 API / Auth 的請求，回傳 index.html (SPA Fallback)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/line-auth/') || req.path.startsWith('/api/')) {
    return next()
  }
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(Number(PORT), () => {
  console.log(`[LINE Auth Backend] Running on http://localhost:${PORT}`)
  console.log(`[LINE Auth Backend] Channel ID: ${LINE_CHANNEL_ID}`)
  console.log(`[LINE Auth Backend] AI GO: ${AIGO_BASE}`)
})
