// vfs/admin/src/utils/codeHistory.selftest.ts
// 用法：瀏覽器 devtools 執行 import('./utils/codeHistory.selftest')；
//      或本機 node 直接執行編譯後的此檔（無 window 時自動跑）。

import { sealedCodeHistory } from './codeHistory';

function assert(cond: any, msg: string) {
  if (!cond) { console.error('❌', msg); throw new Error(msg); }
  console.log('✅', msg);
}

export function runCodeHistorySelfTest() {
  // 無 custom_data → 空陣列
  assert(sealedCodeHistory({}).length === 0, '無 custom_data → []');
  assert(sealedCodeHistory(undefined).length === 0, 'undefined record → []');

  // 有 custom_data 但無 code_history → 空陣列
  assert(sealedCodeHistory({ custom_data: {} }).length === 0, '無 code_history → []');

  // code_history 全部 until:null（只發過一次碼）→ 空陣列
  const onlyActive = { custom_data: { code_history: [
    { code: 'B43', route_tag_id: 'b', since: '2026-01-05T08:00:00+00:00', until: null },
  ] } };
  assert(sealedCodeHistory(onlyActive).length === 0, '全部使用中 → []');

  // 單筆封存
  const oneSealed = { custom_data: { code_history: [
    { code: 'B43', route_tag_id: 'b', since: '2026-01-05T08:00:00+00:00', until: '2026-05-19T10:00:00+00:00' },
    { code: 'C51', route_tag_id: 'c', since: '2026-05-19T10:00:00+00:00', until: null },
  ] } };
  const r1 = sealedCodeHistory(oneSealed);
  assert(r1.length === 1, '一封存一使用中 → 只回 1 筆');
  assert(r1[0].code === 'B43', '回封存那筆 B43');
  assert(r1[0].since === '2026-01-05', 'since 取 YYYY-MM-DD');
  assert(r1[0].until === '2026-05-19', 'until 取 YYYY-MM-DD');

  // 多筆封存，順序保留
  const multi = { custom_data: { code_history: [
    { code: 'B43', route_tag_id: 'b', since: '2026-01-05T08:00:00+00:00', until: '2026-03-01T10:00:00+00:00' },
    { code: 'C51', route_tag_id: 'c', since: '2026-03-01T10:00:00+00:00', until: '2026-05-19T10:00:00+00:00' },
    { code: 'A07', route_tag_id: 'a', since: '2026-05-19T10:00:00+00:00', until: null },
  ] } };
  const r2 = sealedCodeHistory(multi);
  assert(r2.length === 2, '兩封存一使用中 → 回 2 筆');
  assert(r2[0].code === 'B43' && r2[1].code === 'C51', '順序保留：B43 在 C51 前');

  console.log('🎉 codeHistory self-test passed');
}

if (typeof window === 'undefined') {
  runCodeHistorySelfTest();
} else {
  (window as any).__runCodeHistorySelfTest = runCodeHistorySelfTest;
}
