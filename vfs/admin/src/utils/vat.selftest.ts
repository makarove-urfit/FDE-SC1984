// vfs/admin/src/utils/vat.selftest.ts
// 用法：瀏覽器 devtools 執行 import('./utils/vat.selftest')；
//      或本機 node 直接執行編譯後的此檔（無 window 時自動跑）。

import { vatFormatHint } from './vat';

function assert(cond: any, msg: string) {
  if (!cond) { console.error('❌', msg); throw new Error(msg); }
  console.log('✅', msg);
}

export function runVatSelfTest() {
  // 合法統編 04595257
  const h1 = vatFormatHint('04595257');
  assert(h1 === '', '合法統編 04595257 → 空字串');

  // 合法統編（第 7 碼為 7 的特例）12345675
  const h2 = vatFormatHint('12345675');
  assert(h2 === '', '第 7 碼為 7 的特例統編 12345675 → 空字串');

  // 非法檢查碼 12345678
  const h3 = vatFormatHint('12345678');
  assert(h3 !== '', '非法檢查碼 12345678 應回傳非空錯誤字串');
  assert(h3 === '統編檢查碼不正確', '非法檢查碼回傳正確錯誤訊息');

  // 非 8 位 1234567
  const h4 = vatFormatHint('1234567');
  assert(h4 !== '', '非 8 位 1234567 應回傳非空錯誤字串');
  assert(h4 === '統編須為 8 位數字', '非 8 位回傳正確錯誤訊息');

  // 含非數字 1234567X
  const h5 = vatFormatHint('1234567X');
  assert(h5 !== '', '含非數字 1234567X 應回傳非空錯誤字串');
  assert(h5 === '統編須為 8 位數字', '含非數字回傳正確錯誤訊息');

  // 空字串
  const h6 = vatFormatHint('');
  assert(h6 === '', '空字串 → 空字串（空值不提示）');

  // 前後空白
  const h7 = vatFormatHint('  04595257  ');
  assert(h7 === '', '前後空白的合法統編 → 空字串（trim 後合法）');

  console.log('🎉 vat self-test passed');
}

if (typeof window === 'undefined') {
  runVatSelfTest();
} else {
  (window as any).__runVatSelfTest = runVatSelfTest;
}
