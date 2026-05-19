# 分店統一編號 + 統編防呆檢核設計

**日期**：2026-05-19
**分支**：dev（待開 feature branch）
**作者**：HsuPeiChun（與 Claude 共同 brainstorming）
**狀態**：設計階段（待 review）

---

## 1. 問題陳述

### 1.1 分店沒有自己的統編

客戶反映「分店也要設定統一編號」。經釐清，實際業務情況是：**各分店各自是獨立法人、各自開發票、統編都不同**（連鎖店常見型態）。

但現行設計是「繼承制」：

- `ARCHITECTURE.md` §0.1：分店「營運據點，**共用公司統編**」。
- `ARCHITECTURE.md` §0.123 屬性繼承規則：統編 `vat`「存在 headquarters；branch/role 查詢時**向上追**」。
- `create_customer_bundle.py:47-48`：`vat` 只寫進 headquarters，branch 完全不帶 `vat`。
- `CustomersPage.tsx` 的分店表單（新增 / 編輯 / 加分店）**完全沒有統編欄位**。

繼承制與「各分店有獨立統編」直接牴觸，必須廢除。

### 1.2 統編沒有任何防呆，業務員會重複建檔

不同業務員各自跑業務，可能各自建了同一家客戶（例：小王與小李都建了「家樂福內湖店」），系統就出現重複客戶。

現況：

- 統編欄位是純文字框，無格式檢查、無檢查碼驗證、無重複檢查。
- `create_customer_bundle.py` 對 `email` 有 regex 驗證，但 `vat` 原樣寫入、零檢核。
- 對比：客戶編碼 `ref` 在 `assign_customer_code.py` 有完整重複檢查；統編沒有對應機制。

### 1.3 客戶寫入未走 server-side action（根本障礙）

`CustomersPage.tsx` 的客戶建檔/編輯**沒有經過任何 server-side action**：

| 流程 | 位置 | 現況寫入方式 |
|---|---|---|
| 新增客戶（總公司 + 分店） | `submit`（`CustomersPage.tsx:381`） | 直接 `db.insert('customers')` |
| 對既有總公司加分店 | `submitAddBranch`（`:430`） | 直接 `db.insert('customers')` |
| 編輯總公司 / 分店 | `saveEdit`（`:244`） | 直接 `db.update('customers')` |

`create_customer_bundle.py` 這個 action 雖存在，但前端**沒有任何地方呼叫它**（dead code）。

這違反 `CLAUDE.md`「Admin 寫入一律走 server-side action」，也使「硬擋重複統編」無法可靠實作——多業務員可能同時建檔，純前端用各自過時的客戶清單比對必有漏網。**防呆必須是權威性的 server-side 檢查**。

---

## 2. 業務需求（已與使用者確認）

| 編號 | 需求 |
|---|---|
| N1 | 分店可設定自己的統一編號（各分店獨立、互不相同）。 |
| N2 | 統編格式須通過台灣財政部統一編號**檢查碼**驗證（擋打錯）。 |
| N3 | 統編在整張 `customers` 表內**全域唯一**；建檔時偵測到重複一律**硬擋**，不准建檔。 |
| N4 | 統編對總公司（`headquarters`）、分店（`branch`）為**必填**；角色（`role`，負責人/聯絡人）不填。 |

---

## 3. 資料模型（schema 不變）

### 3.1 統編存放：各 `kind` 各自獨立

`customers` 表每一列本來就有 `vat` 欄位（`db_admin.py:7` REFS 已含 `vat`）。分店統編就存**分店自己那列的 `customers.vat`**，**schema 零變動**。

| `custom_data.kind` | `vat` 存放規則 |
|---|---|
| `headquarters`（總公司） | 自己那列存自己的統編；**必填** |
| `branch`（分店） | **自己那列存自己的統編**（新規則，廢除繼承）；**必填** |
| `independent`（獨立客戶） | 自己那列存自己的統編 |
| `role`（負責人 / 聯絡人） | 不存統編 |

分店仍掛在總公司底下做組織分群（路線、業績歸戶、客戶編碼等**皆不變**）；本次只把「統編」這個屬性從「繼承」改成「各自獨立」。

### 3.2 唯一性範圍

「統編不可重複」比對對象 = **整張 `customers` 表所有有填統編的列**（不分 `kind`）。沒有「同集團內可重複」的例外。

### 3.3 附帶影響（標註，本次不改）

`ARCHITECTURE.md` §0.1 將分店定義為「虛擬、非真實法人」，真實/虛擬以 `kind IN ('headquarters','independent')` 區分。分店有了自己的統編後，嚴格講已是獨立法人。此點影響某些報表「真實客戶數」的計算口徑——**本次僅在文件標註，不改報表邏輯**（見 §8）。

---

## 4. Server-Side Actions

採方案 A：把「會寫統編的客戶寫入」收斂到 server-side action。新增 / 改造 **2 個 action**，全走 Admin 內部 app：`POST /api/v1/actions/apps/{app_id}/run/{action_name}`。

### 4.1 `create_customer_bundle` — 新增客戶（改造既有檔）

一次呼叫完成「新增客戶」整包流程，同時支援兩種情境：

- **不傳 `headquarters_id`**：建總公司 + 一或多間分店 + 負責人/聯絡人（取代 `submit` 的逐筆 `db.insert`）。
- **傳既有 `headquarters_id`**：跳過建總公司，只建分店掛上去（取代 `submitAddBranch`）。

**入參**（在既有參數上擴充）：

- `headquarters_id`: string，選填 — 有給則只建分店。
- `headquarters_name`, `vat`（總公司統編）, `email`, `payment_term`, `salesperson_id`, `invoice_format`, `owner_name` — 同既有。
- `branches`: array — 每筆含 `branch_name`、`vat`（**新增：分店統編**）、`phone`、`contact_address`、`region_tag_id`、`contact_name`、`contact_phone`、`contact_email`。

**邏輯——「先驗全部、全過才寫」**：

1. 收集本次所有統編：總公司統編（若要建總公司）+ 每間分店統編。
2. 逐一跑**格式 + 檢查碼驗證**（§5.1）。任一筆不合法 → 回傳錯誤，不寫入。
3. 逐一跑**查重**（§5.2）：比對 `customers` 表既有統編。撞到 → 回傳錯誤（含被誰使用），不寫入。
4. 檢查**本批之內**統編彼此不互撞。撞到 → 回傳錯誤，不寫入。
5. 全部通過後才依序 insert（總公司 → 分店 → 聯絡人 / 負責人）。
6. 每筆帶統編的 insert 之後跑**並發退讓檢查**（§5.3）。
7. 回傳 `{headquarters_id, branch_ids, contact_ids, owner_id, invite_token(s)}`。

「先驗全部、全過才寫」確保統編問題在動筆前全部擋掉，不會留下「總公司建好、第 2 間分店卡住」的半套資料。

### 4.2 `update_customer` — 編輯客戶（新增）

編輯既有客戶（總公司或分店），取代 `saveEdit` 的 `db.update('customers')`。

**入參**：

- `customer_id`: string — 要編輯的客戶 id。
- `fields`: object — 要更新的欄位（`name`、`vat`、`phone`、`email`、`short_name`、`payment_term`、`salesperson_id`、`contact_address`、`custom_data` 等）。

**邏輯**：

1. 讀取客戶現有資料。
2. 若 `fields` 含 `vat` 且**與現值不同**：
   - 跑格式 + 檢查碼驗證（§5.1）。
   - 跑查重（§5.2），比對時**排除自己這筆**（`id != customer_id`）。
   - 任一關卡失敗 → 回傳錯誤，不更新。
3. 若 `kind ∈ {headquarters, branch}` 且 `vat` 被清成空 → 回傳「統編為必填」錯誤。
4. 通過後 `update customers`。
5. 若有改統編，update 後跑並發退讓檢查（§5.3）。
6. 回傳 `{success}`。

**不負責**：客戶編碼發放 / 搬路線仍由 `assign_customer_code` / `reassign_customer_route` 處理，順序不變（前端先 `update_customer` 存一般欄位，再視情況呼叫發碼 action）。

### 4.3 為什麼是 2 個 action

新增是「無中生有、可能多筆」、編輯是「改既有單筆」，流程差異大；分成兩個 action 各司其職，較易理解與測試。

### 4.4 共用驗證邏輯

兩個 action 都需要「格式 + 檢查碼驗證」與「查重」。AI GO 的 action 是獨立單檔 `execute(ctx)`，沒有跨檔 import 機制 —— 因此驗證邏輯（`_validate_vat_format`、`_check_vat_duplicate`）在兩個檔**各放一份**。小幅程式碼重複，換取符合平台限制的可靠性。

---

## 5. 統編驗證規則

### 5.1 關卡一：格式 + 檢查碼

台灣統一編號為 8 位數字，須通過財政部檢查碼演算法：

1. 8 個字元皆為數字，否則不合法。
2. 8 碼各自乘上權重 `[1, 2, 1, 2, 1, 2, 4, 1]`；乘積若 ≥ 10，取其十位數 + 個位數相加（即各位數字和）。
3. 將 8 筆結果加總為 `sum`。
4. 合法條件：`sum % 5 == 0`。
5. 特例：第 7 碼（index 6）為 `7` 時，`sum % 5 == 0` 或 `(sum + 1) % 5 == 0` 任一成立即合法。

範例：`12345678` → 檢查碼不符 → 擋下。

### 5.2 關卡二：查重

撈出 `customers` 表所有 `vat` 非空的客戶，比對目標統編是否已存在：

- **新增**：撞到 → 擋，錯誤訊息明列被誰使用，例如「統編 12345678 已被『家樂福內湖店（編碼 C51）』使用」。
- **編輯**：比對排除自己這筆（`id != customer_id`）。
- **同次新增多間分店**：本批分店統編之間亦須互相比對。

比對前先對統編做正規化（去除空白）。`vat` 為空字串 / null 的列不納入比對。

### 5.3 關卡三：並發退讓

平台資料庫無 unique constraint，極端情況下兩個並發 request 可能都通過查重、都寫入。對策（沿用 `assign_customer_code` 的「後到者退讓」模式）：

帶統編的 insert / update 完成後，**再查一次**該統編在 `customers` 表的筆數。若 > 1：

- 比較建立時間 / id，**後寫入的那筆自刪**（`ctx.db.remove`）並回傳錯誤，請使用者重試。
- 編輯情境若無法自刪（資料已存在），則把 `vat` 回退為原值並回傳錯誤。

### 5.4 必填規則

- `kind ∈ {headquarters, branch}`：統編**必填**。空值在前端（紅星 + 送出檢查）與 action 各擋一次。
- `kind ∈ {role}`：不填統編。

---

## 6. 前端改動清單（`CustomersPage.tsx`）

### 6.1 表單欄位

- **分店表單加統編欄位**，三處皆須加並標紅星（必填）：
  - 新增客戶表單內的分店區塊（`branchEntries`）。
  - 「對既有總公司加分店」表單（`addBranchForm`）。
  - 編輯分店表單（`editBranch`）。
- 總公司統編欄位維持，補上紅星（選填 → 必填）。

### 6.2 送出改道

- `submit`：改呼叫 `create_customer_bundle` action（不傳 `headquarters_id`），不再逐筆 `db.insert`。
- `submitAddBranch`：改呼叫 `create_customer_bundle` action（傳既有 `headquarters_id`）。
- `saveEdit`：改呼叫 `update_customer` action，不再 `db.update('customers')`。發碼 / 搬路線流程順序不變。

### 6.3 驗證與錯誤呈現

- 前端做一道「即時格式提示」（8 碼數字）當友善的第一層提醒；**真正的擋以 action 回應為準**。
- action 回傳的錯誤訊息（含「已被 XXX 使用」）原樣顯示給使用者。

### 6.4 列表顯示

- 客戶列表的分店列也顯示統編欄（目前僅總公司列 `:481/:505` 顯示）。

---

## 7. 文件與測試

### 7.1 `ARCHITECTURE.md`

更新 §0.1 與 §0.123 的統編敘述：由「分店共用母公司統編、向上追」改為「各 `kind` 各自獨立統編」；加註分店有統編後對「真實 / 虛擬法人」定義的語意影響。

### 7.2 測試

新增 `vfs/scripts/test_customer_vat.py`，比照既有 `test_customer_code.py` 風格，以 `use_dev=true` 實測：

- **檢查碼**：合法統編通過、亂打統編被擋、第 7 碼為 7 的特例。
- **查重**：重複統編被擋、編輯時排除自己、同次新增多間分店互撞被擋。
- **必填**：總公司 / 分店空統編被擋。
- **並發退讓**：邏輯驗證（後寫入者自刪 / 回退）。

---

## 8. 不在本 Spec 範圍

- 不改報表「真實客戶數」計算口徑（分店是否計入真實法人）。
- 不做既有空統編分店的批次回填 migration（既有空統編分店一旦被編輯，必填規則會要求補上統編才能存檔，藉此漸進補齊）。
- 個人散戶（無統編）的獨立建檔入口不在 `CustomersPage` 此頁，本次不處理。
- 統編變更歷程 audit log——本次不做。

---

## 9. 不變式與檢查點

| 不變式 | 何處保證 |
|---|---|
| 有填統編的 `customers` 列，`vat` 全域唯一 | `create_customer_bundle` / `update_customer` 查重 + 並發退讓 |
| 總公司 / 分店必有合法統編 | 前端紅星 + action 必填檢查 + 檢查碼驗證 |
| 客戶寫入皆經 server-side action | `submit` / `submitAddBranch` / `saveEdit` 改道 |
| 統編格式合法 | §5.1 檢查碼演算法 |

---

## 10. 部署順序

1. 寫 / 改 2 個 action（`create_customer_bundle`、`update_customer`）→ 上傳 VFS（不發布）。
2. `use_dev=true` 跑 `test_customer_vat.py` 驗 3 道關卡。
3. 改前端 `CustomersPage.tsx`（表單欄位 + 送出改道 + 列表顯示）→ 上傳 VFS。
4. 更新 `ARCHITECTURE.md`。
5. 整流程瀏覽器實測（新增客戶含分店統編 → 重複統編被擋 → 編輯改統編 → 舊分店補統編）。
6. 全部正確才發布。

---

## 11. 待後續決策（spec 簽核後處理）

- [ ] `update_customer` 是否要一併接手「發碼 / 搬路線」的觸發，或維持前端兩段呼叫？
- [ ] 重複統編的錯誤訊息要不要附「跳到該客戶」的連結（UX 增強，可選）。
