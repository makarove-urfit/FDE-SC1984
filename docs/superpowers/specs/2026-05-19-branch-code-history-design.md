# 編輯分店表單：封存編碼歷程 — 設計

日期：2026-05-19
狀態：已核准，待實作

## 1. 目的

客戶編碼搬路線時，舊碼會被「封存」（不刪除、不重用），因為舊碼在會計
帳本上永遠代表該客戶當時的身分。目前 UI 任何地方都看不到封存的舊碼，
操作者無法驗證/查閱一個分店過去用過哪些編碼。

延續 `2026-05-19-branch-edit-code-field-design.md`（唯讀「客戶編碼」欄
只顯示目前碼），本設計補上「曾用編碼」歷程顯示。

## 2. 需求

在「編輯分店資訊」表單的「客戶編碼」欄下方，列出該分店已封存的舊編碼。

## 3. 資料背景

客戶的編碼歷程存在 `customers.custom_data.code_history`，為陣列，每筆：

```json
{ "code": "B43", "route_tag_id": "<tag>", "since": "<ISO>", "until": "<ISO>|null" }
```

- `until: null` → 目前使用中的碼（已由「客戶編碼」欄顯示）。
- `until: <ISO 時間戳>` → 已封存的舊碼，`until` 即封存時間。

## 4. 設計

### 4.1 純函式 `sealedCodeHistory`

- 新檔：`vfs/admin/src/utils/codeHistory.ts`
- 簽名：`sealedCodeHistory(record: any): SealedCode[]`
- `SealedCode = { code: string; since: string; until: string }`
- 行為：
  - 讀 `record?.custom_data?.code_history`，非陣列時視為空陣列。
  - 篩出 `until` 為非空字串的項（已封存）。
  - 每項 `since` / `until` 取 ISO 字串前 10 碼（`YYYY-MM-DD`）；
    缺值則回空字串。
  - 保留原陣列順序（`code_history` 為 append 順序，即時間由舊到新）。

### 4.2 UI 區塊

- 位置：`CustomersPage.tsx` 編輯分店表單，「客戶編碼」唯讀欄 `<div>`
  之後、「地址」欄 `<div>` 之前。
- 僅當 `sealedCodeHistory(editTarget.record).length > 0` 才 render 整塊；
  否則不輸出任何節點。
- 標籤「曾用編碼」。
- 逐筆一行，格式：`{code} · {since} ~ {until} 封存`
  例：`B43 · 2026-01-05 ~ 2026-05-19 封存`。
  - `code` mono 灰字，整行小字（`text-xs text-gray-500`）。

### 4.3 行為

- 純唯讀。不進 `editBranch` state、不進 `saveEdit` payload。

## 5. 不做（YAGNI）

- 不顯示路線名稱（編碼首字母已表路線）。
- 不可點擊展開、無分頁。
- 不顯示目前使用中的碼於此區塊（已由「客戶編碼」欄負責）。

## 6. 影響範圍

- 新增 `vfs/admin/src/utils/codeHistory.ts`、`codeHistory.selftest.ts`。
- 改 `vfs/admin/src/pages/admin/CustomersPage.tsx` 編輯分店表單一段 JSX。
- 無新 action、無資料模型變更、無 `db_admin.py` 變更。

## 7. 測試

- 單元測試 `codeHistory.selftest.ts`（node 編譯執行）涵蓋：
  - 無 `custom_data` / `code_history` → 空陣列。
  - `code_history` 全部 `until: null`（只發過一次碼）→ 空陣列。
  - 單筆封存 → 一筆，日期格式化正確。
  - 多筆封存 + 一筆使用中 → 只回封存那幾筆，順序保留。
- 前端改動需 publish 後瀏覽器實測：
  - 編輯一家曾搬過路線的分店 → 顯示「曾用編碼」與舊碼。
  - 編輯沒搬過路線的分店 → 不顯示該區塊。
