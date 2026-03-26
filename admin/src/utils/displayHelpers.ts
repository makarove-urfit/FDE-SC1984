/**
 * UUID / ID 顯示工具
 *
 * 偵測值是否為 UUID 或純數字 ID，
 * 若是則替換為人類可讀的 fallback 文字。
 */

// UUID v4 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 純數字 ID（如 "123"、"4567"）
const NUMERIC_ID_RE = /^\d+$/

/**
 * 若值看起來像 UUID 或純數字 ID，則回傳 fallback；否則回傳原值。
 */
export function displayName(value: string | undefined | null, fallback: string): string {
  if (!value) return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  if (UUID_RE.test(trimmed)) return fallback
  if (NUMERIC_ID_RE.test(trimmed)) return fallback
  return trimmed
}

/**
 * 將 UUID 或數字 ID 縮短為短碼（取前 6 碼），用於訂單編號等場景。
 * 例如：657fd834-d42f-4499-938f-bb5ff2d5e554 → #657FD8
 */
export function shortId(value: string | undefined | null): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (UUID_RE.test(trimmed)) {
    return '#' + trimmed.replace(/-/g, '').slice(0, 6).toUpperCase()
  }
  if (NUMERIC_ID_RE.test(trimmed)) {
    return '#' + trimmed
  }
  return trimmed
}

/**
 * 判斷值是否為 UUID 格式
 */
export function isUUID(value: string | undefined | null): boolean {
  if (!value) return false
  return UUID_RE.test(value.trim())
}
