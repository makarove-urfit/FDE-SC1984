// vfs/admin/src/utils/routeChange.selftest.ts
// 用法：瀏覽器 devtools 執行 import('./utils/routeChange.selftest')；
//      或本機 node 直接執行編譯後的此檔（無 window 時自動跑）。

import { planRouteChange } from './routeChange';

function assert(cond: any, msg: string) {
  if (!cond) { console.error('❌', msg); throw new Error(msg); }
  console.log('✅', msg);
}

export function runRouteChangeSelfTest() {
  // 無編碼分店改路線 → 首次發碼（不是搬路線）
  const p1 = planRouteChange({ ref: '', oldRegionTagId: 'old-deleted', newRegionTagId: 'route-A' });
  assert(p1.action === 'assign', '無編碼分店改路線 → assign（首次發碼）');
  assert(!p1.confirmMessage.includes('封存'), '首次發碼的確認訊息不該提「封存」');
  assert(p1.confirmMessage.length > 0, '首次發碼要有確認訊息');

  // 已有編碼分店改路線 → 搬路線、封存舊碼
  const p2 = planRouteChange({ ref: 'C51', oldRegionTagId: 'route-C', newRegionTagId: 'route-A' });
  assert(p2.action === 'reassign', '已編碼分店改路線 → reassign（搬路線）');
  assert(p2.confirmMessage.includes('C51'), '搬路線的確認訊息要含舊編碼 C51');
  assert(p2.confirmMessage.includes('封存'), '搬路線的確認訊息要提「封存」');

  // 路線沒變 → 不需特別動作
  const p3 = planRouteChange({ ref: 'C51', oldRegionTagId: 'route-C', newRegionTagId: 'route-C' });
  assert(p3.action === 'none', '路線沒變 → none');
  assert(p3.confirmMessage === '', 'none 不需確認訊息');

  // 本來無路線、第一次設路線、無編碼 → 首次發碼
  const p4 = planRouteChange({ ref: '', oldRegionTagId: '', newRegionTagId: 'route-A' });
  assert(p4.action === 'assign', '無路線無編碼第一次設路線 → assign');

  // 清空路線 → 不發碼、不搬路線，交給一般 update
  const p5 = planRouteChange({ ref: '', oldRegionTagId: 'route-A', newRegionTagId: '' });
  assert(p5.action === 'none', '清空路線 → none');

  // 空白字串視同未填（trim）
  const p6 = planRouteChange({ ref: '  ', oldRegionTagId: 'route-C', newRegionTagId: 'route-A' });
  assert(p6.action === 'assign', 'ref 只有空白 → 視為無編碼 → assign');

  console.log('🎉 routeChange self-test passed');
}

if (typeof window === 'undefined') {
  runRouteChangeSelfTest();
} else {
  (window as any).__runRouteChangeSelfTest = runRouteChangeSelfTest;
}
