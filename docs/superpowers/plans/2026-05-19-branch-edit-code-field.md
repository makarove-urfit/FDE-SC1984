# 編輯分店表單客戶編碼唯讀欄 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「編輯分店資訊」表單的路線欄位下方新增一個唯讀欄，顯示分店目前的客戶編碼。

**Architecture:** 純 presentational JSX，直接讀 `editTarget.record.ref`；不進 `editBranch` state、不進 `saveEdit` payload。無新 action、無資料模型變更。

**Tech Stack:** React + TypeScript（`vfs/admin`），平台 publish 後生效。

---

### Task 1: 新增客戶編碼唯讀欄

**Files:**
- Modify: `vfs/admin/src/pages/admin/CustomersPage.tsx`（編輯分店表單，「電話 / 路線」grid 那一列之後）

- [ ] **Step 1: 插入唯讀欄 JSX**

在編輯分店表單中，找到「電話 / 路線」2 欄 grid 的結尾 `</div>`（路線 `<select>` 所在 grid，緊接其後是「地址」欄位的 `<div>`）。在該 grid 結尾 `</div>` 與「地址」`<div>` 之間插入：

```tsx
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">客戶編碼</label>
                    <div className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50">
                      {String(editTarget.record.ref || '').trim()
                        ? <span className="font-mono text-blue-700">{editTarget.record.ref}</span>
                        : <span className="text-gray-400">（未發碼）</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">系統自動管理，改路線時自動發碼/封存，不可手動編輯</p>
                  </div>
```

定位參考（現有程式碼）：

```tsx
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">路線（配送區域）</label>
                      <select value={editBranch.region_tag_id} onChange={e => setEditBranch(p => ({ ...p, region_tag_id: e.target.value }))} className={selectCls}>
                        <option value="">（請選擇）</option>
                        {regionTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  </div>          ← 這是「電話 / 路線」grid 的結尾，新區塊插在此行之後
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
```

- [ ] **Step 2: typecheck 驗證**

Run:
```bash
cd vfs/admin && node_modules/.bin/tsc --noEmit --jsx react-jsx --module esnext --moduleResolution bundler --target es2022 --strict --skipLibCheck --lib es2022,dom src/pages/admin/CustomersPage.tsx
```
Expected: exit 0，無輸出。

- [ ] **Step 3: Commit**

```bash
git add vfs/admin/src/pages/admin/CustomersPage.tsx
git commit -m "feat(admin): 編輯分店表單路線欄下方加客戶編碼唯讀欄

操作者編輯分店時看不到客戶編碼，改路線等操作前無法確認當下編碼。
唯讀顯示 editTarget.record.ref，未發碼顯示「（未發碼）」。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Publish 後瀏覽器驗證**

Publish（需使用者執行）：`set -a && source .env && set +a && python3 vfs/scripts/deploy_admin.py`

驗證：
- 編輯一家有編碼的分店 → 路線欄下方「客戶編碼」顯示該編碼（藍色 mono）。
- 編輯一家未發碼的分店 → 顯示「（未發碼）」灰字。

---

## Self-Review

- **Spec coverage:** spec §3 唯讀欄（位置、內容、資料來源、行為）→ Task 1 Step 1；§6 驗證 → Step 4。涵蓋完整。
- **Placeholder scan:** 無 TBD/TODO，JSX 為完整可貼程式碼。
- **Type consistency:** `editTarget.record.ref` — `editTarget` 在此 JSX 作用域內非 null（modal 由 `editTarget` 控制渲染，line 586 已直接用 `editTarget.type`）；`record` 為 customer，`ref?: string`（`Customer` type 有 `ref?`）。型別一致。
