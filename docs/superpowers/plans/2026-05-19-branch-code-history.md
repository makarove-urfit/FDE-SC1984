# 編輯分店表單封存編碼歷程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「編輯分店資訊」表單的「客戶編碼」欄下方，列出該分店已封存的舊編碼。

**Architecture:** 抽純函式 `sealedCodeHistory` 篩出 `code_history` 中已封存（`until` 非空）的項並格式化日期；CustomersPage JSX 僅負責 render，僅在有封存項時顯示。不進 state、不進 saveEdit payload。

**Tech Stack:** React + TypeScript（`vfs/admin`）。單元測試以 node 編譯執行 `.selftest.ts`，與既有 `routeChange.selftest.ts` 同模式。

---

### Task 1: 純函式 `sealedCodeHistory` + 單元測試

**Files:**
- Create: `vfs/admin/src/utils/codeHistory.ts`
- Test: `vfs/admin/src/utils/codeHistory.selftest.ts`

- [ ] **Step 1: 寫 stub（讓測試可編譯）**

建立 `vfs/admin/src/utils/codeHistory.ts`：

```ts
// vfs/admin/src/utils/codeHistory.ts
// STUB — 待 TDD GREEN 階段實作
export interface SealedCode {
  code: string;
  since: string;
  until: string;
}

export function sealedCodeHistory(_record: any): SealedCode[] {
  return [];
}
```

- [ ] **Step 2: 寫失敗測試**

建立 `vfs/admin/src/utils/codeHistory.selftest.ts`：

```ts
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
```

- [ ] **Step 3: 執行測試確認失敗（RED）**

Run:
```bash
cd vfs/admin && node_modules/.bin/tsc --target es2022 --module commonjs --moduleResolution node --strict --outDir /tmp/chtest src/utils/codeHistory.selftest.ts && node /tmp/chtest/codeHistory.selftest.js
```
Expected: FAIL — `❌ 一封存一使用中 → 只回 1 筆`（stub 回 `[]`）。

- [ ] **Step 4: 實作 `sealedCodeHistory`（GREEN）**

將 `vfs/admin/src/utils/codeHistory.ts` 整檔覆寫為：

```ts
// vfs/admin/src/utils/codeHistory.ts
// 從客戶的 code_history 取出「已封存」（until 有值）的舊編碼，
// 供編輯分店表單顯示。純函式、無 DOM/React 依賴，可單元測試。

export interface SealedCode {
  code: string;
  since: string;
  until: string;
}

export function sealedCodeHistory(record: any): SealedCode[] {
  const hist = record?.custom_data?.code_history;
  if (!Array.isArray(hist)) return [];
  return hist
    .filter((e: any) => typeof e?.until === 'string' && e.until.trim() !== '')
    .map((e: any) => ({
      code: String(e?.code || ''),
      since: String(e?.since || '').slice(0, 10),
      until: String(e?.until || '').slice(0, 10),
    }));
}
```

- [ ] **Step 5: 執行測試確認通過（GREEN）**

Run:
```bash
cd vfs/admin && node_modules/.bin/tsc --target es2022 --module commonjs --moduleResolution node --strict --outDir /tmp/chtest src/utils/codeHistory.selftest.ts && node /tmp/chtest/codeHistory.selftest.js
```
Expected: PASS — 結尾 `🎉 codeHistory self-test passed`。

- [ ] **Step 6: Commit**

```bash
cd /home/username/桌面/fde-sc1984
git add vfs/admin/src/utils/codeHistory.ts vfs/admin/src/utils/codeHistory.selftest.ts
git commit -m "feat(admin): sealedCodeHistory — 從 code_history 取已封存舊碼

純函式，供編輯分店表單顯示封存編碼歷程。附單元測試。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 編輯分店表單「曾用編碼」區塊

**Files:**
- Modify: `vfs/admin/src/pages/admin/CustomersPage.tsx`（import 一行 + 編輯分店表單 JSX 一段）

- [ ] **Step 1: 加 import**

在 `CustomersPage.tsx` 既有 import 區塊，`planRouteChange` 那行之後加一行：

```tsx
import { planRouteChange } from '../../utils/routeChange';
import { sealedCodeHistory } from '../../utils/codeHistory';
```

- [ ] **Step 2: 插入「曾用編碼」JSX**

在編輯分店表單，找到「客戶編碼」唯讀欄區塊的結尾 `</div>`（其內含 `系統自動管理...不可手動編輯` 的 `<p>`），與緊接其後的「地址」欄 `<div>` 之間插入。

定位參考（現有程式碼）：

```tsx
                    <p className="text-xs text-gray-400 mt-1">系統自動管理，改路線時自動發碼/封存，不可手動編輯</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
```

在 `客戶編碼` 區塊結尾 `</div>` 之後、`地址` `<div>` 之前插入：

```tsx
                  {sealedCodeHistory(editTarget.record).length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">曾用編碼</label>
                      <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 space-y-1">
                        {sealedCodeHistory(editTarget.record).map((h, i) => (
                          <div key={i} className="text-xs text-gray-500">
                            <span className="font-mono">{h.code}</span> · {h.since} ~ {h.until} 封存
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
```

- [ ] **Step 3: typecheck 驗證**

Run:
```bash
cd vfs/admin && node_modules/.bin/tsc --noEmit --jsx react-jsx --module esnext --moduleResolution bundler --target es2022 --strict --skipLibCheck --lib es2022,dom src/pages/admin/CustomersPage.tsx
```
Expected: exit 0，無輸出。

- [ ] **Step 4: Commit**

```bash
cd /home/username/桌面/fde-sc1984
git add vfs/admin/src/pages/admin/CustomersPage.tsx
git commit -m "feat(admin): 編輯分店表單客戶編碼欄下方顯示封存編碼歷程

操作者搬路線後看不到已封存的舊碼。於「客戶編碼」欄下方加「曾用編碼」，
僅在有封存項時顯示，列出舊碼與啟用~封存日期。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Publish 後瀏覽器驗證**

Publish（需使用者執行）：`set -a && source .env && set +a && python3 vfs/scripts/deploy_admin.py`

驗證：
- 編輯一家曾搬過路線的分店 → 「客戶編碼」下方出現「曾用編碼」，列出舊碼與日期。
- 編輯沒搬過路線的分店 → 不顯示「曾用編碼」區塊。

---

## Self-Review

- **Spec coverage:** §4.1 純函式 `sealedCodeHistory` → Task 1；§4.2 UI 區塊（位置、僅有封存才顯示、格式）→ Task 2 Step 2；§4.3 純唯讀（不進 state/payload）→ Task 2 JSX 未接任何 onChange/state；§7 測試 → Task 1 Step 2 五案例 + Task 2 Step 5 瀏覽器驗證。涵蓋完整。
- **Placeholder scan:** 無 TBD/TODO，程式碼皆完整可貼。
- **Type consistency:** `sealedCodeHistory(record): SealedCode[]`、`SealedCode = {code, since, until}` 於 Task 1 定義；Task 2 用 `.length`、`.map(h => h.code/h.since/h.until)` 與之一致。`editTarget.record` 於該 JSX 作用域非 null（modal 由 `editTarget` 控制渲染）。
