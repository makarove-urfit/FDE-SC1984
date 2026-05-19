# 客戶編碼制度、路線單字母化、公休日 VIP 例外設計

**日期**：2026-05-14
**分支**：dev（待開 feature branch）
**作者**：HsuPeiChun（與 Claude 共同 brainstorming）
**狀態**：設計階段（待 review）

---

## 1. 問題陳述

### 1.1 概念混淆：分店編號 vs 客戶編碼

點貨單上的「G43 皇家」原本被誤認為「G43 是路線」。客戶端釐清：**G 是路線、43 是流水號**。

但在會議溝通中，「分店編號」與「客戶編碼」兩個詞被混用，造成需求對齊困難。

**結論**：兩個詞指向同一個實體（branch 客戶的身分識別碼）。

| 詞 | 使用情境 | 對應物 |
|---|---|---|
| 路線 | 配送、報表分類 | A、C、G（單英文字母） |
| 客戶編碼／分店編號 | 會計帳款、列印 | G43（路線字首 + 流水號） |

### 1.2 現有資料模型的根本缺陷

| 問題 | 證據 |
|---|---|
| `customer_tags.name` 語意過載 | `RouteDriversPage.tsx` 提示「如：北區、南區」；`reportData.selftest.ts` line 14-17 卻測試 `name='F33'`、`'C60'`。兩種用法並存。 |
| 沒有獨立的「客戶編碼」欄位 | `reportData.ts` line 60-62 在 runtime 把 `region_tag.name + short_name` 拼出來當編碼。 |
| 編碼不持久 | 改路線 → 編碼自動換、舊單據對不回去 → 違反會計需求。 |
| 沒有自動發號、沒有唯一性保證、沒有不可變保護 | 全靠人工輸入 `customer_tags.name`。 |
| `x_holiday_settings` 沒有 VIP 例外機制 | schema 只有 `date`、`reason`。 |

---

## 2. 業務需求（已與使用者確認）

### N1. 公休日 VIP 例外配送
- 公休日預設**全客戶不送貨**。
- 每個公休日**各自**指定一份 VIP 名單（branch 客戶），名單內的分店在該日仍可被選入配送清單。
- VIP 名單**逐假日獨立**，不是永久旗標（同一家分店可能下週要送、下下週不要送）。

### N2. 客戶編碼自動發號 + 不可覆蓋
- 編碼格式：`<路線單字母><流水號>`，如 `G43`、`C51`。
- 路線：單英文字母 A~Z，存在 `customer_tags`（category=region），**不再混塞流水號**。
- 流水號：每路線一個獨立計數器，**只往上走、釋出的號永不重用**。
  - 預設兩位數補零（`G01`~`G99`），第 100 家後自然變 `G100`、`G101`……不設上限。
- 客戶搬家／換路線：**不改舊號**，到目標路線取下一個流水號發新號，並把舊號塞入 `code_history` 封存。
- 範例：G 路線有 42 家，C 路線有 50 家，皇家以 G43 加入，後搬家到 C → 拿 C51；
  - G 路線下一個新客戶拿 G44（永不重用 G43）。
- 編碼不可由前端直接寫入，**只能透過 server-side action 發放**。

### N3. 舊資料處理
- 使用者**自行在後台介面手動調整**現有資料（把 `customer_tags.name='F33'` 拆成路線='F' + 客戶編碼='F33'）。
- Spec 不包含批次 migration action。
- 但程式碼需提供 **fallback**：若客戶沒有新欄位 `ref`，顯示時退回舊邏輯（`region_tag.name + short_name`），讓使用者能漸進清理。

---

## 3. 資料模型（方案 A）

### 3.1 `customers` — 用既有欄位

`customers` 表已有 `ref`、`short_name`、`custom_data` 欄位（見 `db_admin.py` line 7），**schema 不變**。

| 欄位 | 用途 | 範例 |
|---|---|---|
| `ref` | 目前生效的客戶編碼（SSOT） | `"C51"` |
| `short_name` | 顯示用短名稱 | `"皇家"` |
| `custom_data.kind` | 既有 | `"branch"` |
| `custom_data.region_tag_id` | 既有，指向路線 tag | `"<C 路線 tag id>"` |
| `custom_data.code_history` | **新增**：歷史編碼陣列 | 見下 |

`custom_data.code_history` 結構：

```jsonc
{
  "code_history": [
    {
      "code": "G43",
      "route_tag_id": "<G 路線 tag id>",
      "since": "2025-01-01T00:00:00Z",
      "until": "2026-05-14T10:30:00Z"   // null 代表生效中
    },
    {
      "code": "C51",
      "route_tag_id": "<C 路線 tag id>",
      "since": "2026-05-14T10:30:00Z",
      "until": null
    }
  ]
}
```

**不變式**：`code_history` 最後一筆的 `code` 必須等於 `customers.ref`。發放新號的 action 同時寫兩處。

### 3.2 `customer_tags` — 加計數器

`customer_tags.custom_data` 既有，**schema 不變**。

| custom_data key | 用途 | 範例 |
|---|---|---|
| `category` | 既有 | `"region"` |
| `single_select` | 既有 | `true` |
| `defaultDriverId` | 既有 | `"<driver id>"` |
| `route_letter` | **新增**：路線單字母 | `"G"` |
| `next_seq` | **新增**：下一個要發的流水號 | `44` |

**為何另開 `route_letter` 而非用 `tag.name`**：避免再次語意過載；`tag.name` 仍可顯示「G 路線（北區）」這種人類可讀名稱。

### 3.3 `x_holiday_settings` — 加 `custom_data` 欄位

**Schema 變更**：`db_admin.py` line 24 的 columns 加入 `"custom_data"`。

| 欄位 | 用途 | 範例 |
|---|---|---|
| `id`, `date`, `reason` | 既有 | |
| `custom_data.vip_branch_ids` | **新增**：當日 VIP 例外名單（branch customer id 陣列） | `["123", "456"]` |

---

## 4. Server-Side Actions

全部走 Admin 內部 app：`POST /api/v1/actions/apps/{app_id}/run/{action_name}`。

### 4.1 `assign_customer_code` — 新增客戶時取號

**入參**：
- `customer_id`: string — 已建立的 branch 客戶 id
- `route_tag_id`: string — 該客戶所屬路線 tag id

**邏輯**：
1. `query_object` 抓 `customer_tags` 該筆 tag，讀 `custom_data.route_letter` 與 `next_seq`（缺省 1）。
2. 算出新編碼：`code = route_letter + str(next_seq).zfill(2)`（≤99 補零，≥100 不補）。
3. `update customer`：`ref = code`、`custom_data.code_history` append `{code, route_tag_id, since=now, until=null}`、`custom_data.region_tag_id = route_tag_id`。
4. `update customer_tags`：`custom_data.next_seq = next_seq + 1`。
5. 回傳 `{success, code}`。

**並發安全**：平台無 transaction。先 `update` tag 的 `next_seq`（樂觀鎖：附帶 `current_seq` 條件，若實際值不符則重試最多 3 次），再寫客戶。最壞情況：兩個並發 request 拿到同號 → 第二個重試。

### 4.2 `reassign_customer_route` — 搬家／換路線

**入參**：
- `customer_id`: string
- `new_route_tag_id`: string

**邏輯**：
1. 抓客戶現有 `ref`、`custom_data.code_history`、`custom_data.region_tag_id`。
2. 若 `new_route_tag_id == 現有 region_tag_id` → 直接 return（noop）。
3. 從新路線 tag 取下一個流水號（同 4.1 步驟 1-2）。
4. 把 `code_history` 最後一筆的 `until` 寫成 now（封存舊號）。
5. append 新一筆 `{code: new_code, route_tag_id: new_route_tag_id, since: now, until: null}`。
6. `update customer`：`ref = new_code`、`custom_data.region_tag_id = new_route_tag_id`、`custom_data.code_history = 更新後陣列`。
7. `update customer_tags`：新路線 `next_seq += 1`。
8. 回傳 `{success, old_code, new_code}`。

**注意**：舊路線的 `next_seq` **不回退**——這是 N2 的「永不重用」需求。

### 4.3 `set_holiday_vip` — 設定/更新公休日 VIP 名單

**入參**：
- `holiday_id`: string — `x_holiday_settings` 的 row id
- `vip_branch_ids`: string[] — 完整覆蓋寫入

**邏輯**：`update x_holiday_settings` 把 `custom_data.vip_branch_ids` 整個覆寫。

回傳 `{success}`。

### 4.4 （可選）`backfill_customer_code` — 後台手動單筆修補

讓使用者在後台介面點「為這個客戶分發編碼」按鈕，等同 `assign_customer_code` 但允許指定路線。**列為選用，看後台介面要不要露這個按鈕**。

---

## 5. 前端改動清單

### 5.1 `RouteDriversPage.tsx`（路線管理頁）

- 新增欄位輸入：「路線代號（單英文字母）」對應 `custom_data.route_letter`。
  - 驗證：1 個 A-Z 字元、唯一（檢查不和其他 region tag 撞）。
- 既有 `name` 欄位仍保留作為「顯示名稱」（如「G 路線（北區）」）。
- 列表多顯示一欄「已發放/下一號」`(next_seq - 1) / next_seq`。

### 5.2 `CustomersPage.tsx`（客戶/分店管理頁）

- 新增分店流程改用 `assign_customer_code` action：
  - UI 表單仍是現在那一套，使用者填 branch_name、region_tag_id 等。
  - 送出後，前端先 insert customer（不含 code），拿到 id，再呼叫 `assign_customer_code`。
  - 顯示新發放的編碼讓使用者確認。
- 編輯分店時，若使用者改了「路線」下拉 → 觸發確認 dialog「將會發放新編碼並封存舊號，確定？」 → 呼叫 `reassign_customer_route`。
- 列表顯示客戶編碼欄（讀 `customer.ref`，缺值時 fallback 顯示「未發放」）。
- `customer.ref` 在 UI **唯讀**——強調不可手動覆蓋。

### 5.3 `HolidayCalendar.tsx`（公休月曆）

- 點紅格的編輯 popup 新增區塊「VIP 例外配送名單」：
  - 多選下拉（資料來源：所有 `kind=branch` 客戶，顯示「客戶編碼 + short_name」如「G43 皇家」）。
  - 已選名單以 chip 形式顯示，可逐項移除。
  - 儲存時呼叫 `set_holiday_vip` action。
- Props 介面新增：
  ```ts
  interface Props {
    // ... 既有 props
    branchOptions: { id: string; label: string }[];  // 全部 branch 給多選器
    onUpdateVip: (id: string, branchIds: string[]) => Promise<void>;
  }
  ```
- `Holiday` type 擴充：`vip_branch_ids?: string[]`。

### 5.4 `reportData.ts`（採購單客戶編碼運算）

**Fallback 機制**：

```ts
function customerCode(cust, tagMap): string {
  // 優先用新欄位
  if (cust.ref) return cust.ref;
  // 找不到再退回舊邏輯（供漸進遷移期間使用）
  const tagId = _id(cust?.custom_data?.region_tag_id);
  const route = tagMap[tagId]?.name ?? '';
  const short = (cust?.short_name || cust?.name || '').slice(0, 3);
  return `${route}${short}`;
}
```

`reportData.selftest.ts` 既有測試保留，新增「`ref` 存在時優先用 `ref`」的 case。

### 5.5 配送清單頁（位置待確認）

公休日的處理邏輯（pseudo）：
```ts
if (isHoliday(date)) {
  const vipIds = holiday.custom_data?.vip_branch_ids ?? [];
  // 預設不送，但允許勾選 vipIds 內的分店
  return allBranches.filter(b => vipIds.includes(b.id));
}
```

**注意**：本 spec **不規範**配送清單頁的 UI 細節（那是另一條動線），只規範資料來源契約。

---

## 6. 不變式與檢查點

| 不變式 | 何處保證 |
|---|---|
| `customers.ref == code_history[-1].code` | `assign_customer_code` / `reassign_customer_route` 同 transaction 寫兩處 |
| 同路線下 `ref` 唯一 | `next_seq` 永不回退 → 自然保證 |
| 編碼不可重用 | 同上 |
| 編碼不可手動覆蓋 | 前端 `customer.ref` 設 read-only；後端 action 之外的 update 不檢查（信任邊界內，但 db.ts 的 `update` 不暴露 `ref` 欄位） |
| 路線單字母唯一 | `RouteDriversPage` 表單驗證 + server-side 重新檢查 |

---

## 7. 風險與已知限制

| 風險 | 應對 |
|---|---|
| 並發發號可能撞號 | 樂觀鎖 + 重試 3 次；極端情況回傳錯誤讓使用者重點 |
| 平台沒有 transaction，action 中途失敗會留下不一致 | 順序設計：先 update customer_tags（單一欄位），再 update customer（含完整 history）。前者失敗 → 沒影響；後者失敗 → `next_seq` 已 +1 但客戶沒拿到號 → 等於那個號碼跳號（可接受，符合「不回收」原則） |
| `x_holiday_settings.custom_data` 是新增欄位，舊資料沒這 key | 讀取時 `?? []` 預設空陣列即可 |
| 使用者手動清理舊資料期間，會混用新舊邏輯 | `reportData.ts` 的 fallback 機制涵蓋；轉換完成後可移除 fallback |

---

## 8. 不在本 Spec 範圍

- 批次 migration action（使用者選擇手動處理）。
- 編碼格式變更（如 `G-43` 加破折號）——本 spec 鎖定 `G43` 緊連格式。
- 跨 app 共用（Ordering 是否也要顯示新編碼）——目前 `reportData.ts` 在 admin 與 ordering 共用，自動帶過去，但 Ordering 的 UI 細節另議。
- 客戶編碼 audit log（誰在何時發了哪個號）——`code_history` 已內含 since/until，**不額外做**外部 log。
- 釋出編碼的反查 UI（「G43 歷年屬於誰」）——使用者沒提這需求，**不做**。

---

## 9. 部署順序

1. `db_admin.py` line 24 加 `custom_data` 進 `x_holiday_settings` columns → 部署步驟 1-2（ensure references）。
2. 寫 3 個 action（`assign_customer_code`、`reassign_customer_route`、`set_holiday_vip`）→ 上傳 VFS。
3. `use_dev=true` 測 3 個 action（建假客戶、改路線、設假日 VIP）→ 驗 `code_history` 結構正確。
4. 改前端 4 個檔（`RouteDriversPage`、`CustomersPage`、`HolidayCalendar`、`reportData.ts`）→ 上傳 VFS。
5. 整流程瀏覽器實測（建新客戶 → 看編碼 → 搬路線 → 設公休日 VIP → 看採購單顯示）。
6. 全部正確才 publish。

---

## 10. 待後續決策（spec 簽核後處理）

- [ ] 三個 action 各自的命名是否要加 prefix（如 `customer_`、`holiday_`）以利分類？
- [ ] `RouteDriversPage` 的「路線單字母」欄位是否在現有 list 上 inline 編輯，或開 modal？
- [ ] 採購單列印時，編碼與店名之間要不要加空格（`G43 皇家` vs `G43皇家`）？
