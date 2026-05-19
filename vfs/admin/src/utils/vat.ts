// 統一編號格式提示（前端友善檢查；權威驗證在 server-side action）
const WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1];

/** 回傳格式錯誤訊息；格式正確時回傳空字串。 */
export function vatFormatHint(vat: string): string {
  const v = (vat || '').trim();
  if (!v) return '';
  if (!/^\d{8}$/.test(v)) return '統編須為 8 位數字';
  let total = 0;
  for (let i = 0; i < 8; i++) {
    const product = Number(v[i]) * WEIGHTS[i];
    total += Math.floor(product / 10) + (product % 10);
  }
  const ok = total % 5 === 0 || (v[6] === '7' && (total + 1) % 5 === 0);
  return ok ? '' : '統編檢查碼不正確';
}
