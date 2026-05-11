# Admin 假日管理改為月曆視圖

## 背景

`vfs/admin/src/pages/admin/SettingsPage.tsx` line 162-187 的「假日管理」目前是 `date input + reason input → 列表` 的逐筆模式。使用者要一鍵點月曆切換假日，提升效率與直觀度。

資料表：`x_holiday_settings`（欄位 `date`、`reason`）— **schema 不變**。

## 設計決策（已與使用者確認）

| 議題 | 決策 |
|---|---|
| 互動方式 | 點月曆某格 → 直接 toggle 假日（無 popup） |
| 補班 / 工作日切換 | 不做。FDE 業務只關心「不出貨日」 |
| reason 編輯 | 不在 UI 提供。所有新增假日 reason = `公休` |
| 載入範圍 | 全部假日（移除原 `>= today` 過濾） |
| 「匯入本月週一」按鈕 | 保留，移到月曆右上角 |

## 元件結構

```
src/
  components/
    HolidayCalendar.tsx   ← 新增
  pages/admin/
    SettingsPage.tsx      ← 修改 line 162-187 區塊
```

### HolidayCalendar Props

```typescript
type Holiday = { id: string; date: string; reason: string };

interface HolidayCalendarProps {
  holidays: Holiday[];
  busy: boolean;
  onAdd: (date: string) => Promise<void>;       // 點空白格
  onRemove: (id: string) => Promise<void>;      // 點假日格
  onImportMondays: () => Promise<void>;         // 右上角按鈕
}
```

元件只負責 render + 觸發 callback，DB 呼叫留在 SettingsPage（與現有「截止時間」「公司資訊」一致）。

## UI 規格

```
┌──────────────────────────────────────────────┐
│  [<]  2026年  2月  [>]            [今天] [匯入週一] │
├──────────────────────────────────────────────┤
│   一    二    三    四    五    六    日     │
│   26    27    28    29    30    31     1     │  ← 灰：非本月日期
│    2     3     4     5     6     7     8     │
│  ╔══╗   3     4     5     6     7     8     │
│  ║休║                                        │  ← 紅底+紅字+右上角小「休」
│  ╚══╝                                        │
│    9    10    11    12    13    14    15     │
│   16    17    18    19    20    21    22     │
│   23    24    25    26    27    28          │
└──────────────────────────────────────────────┘
```

- 紅底假日格 `bg-red-50 border-red-300 text-red-700`，右上角小 badge「休」
- 非本月日期淡灰，可點（會跳轉到該月份的同時新增假日）
- 今日格邊框 `border-blue-500 ring-1`
- 週末欄位文字色偏紅（純樣式，週末不會自動算假日）

### 月份切換控制

- 左右箭頭：上/下個月
- 「今天」按鈕：跳回當月
- 點月曆任何「非本月」灰色日期：跳到該月並 toggle

### 互動細節

| 動作 | 結果 |
|---|---|
| 點空白格 | `db.insertCustom('x_holiday_settings', {date, reason:'公休'})` → reload |
| 點假日格 | `db.deleteCustom(id)` → reload（不確認對話） |
| busy 期間 | 全月曆 `pointer-events: none` + 淡化，避免雙擊重複送 |

## 資料流

1. SettingsPage `load()` 移除 `filter(h => h.date >= today)`，回傳全部假日
2. HolidayCalendar 接收 `holidays`，內部用 `useState` 控制當月 `viewYear` / `viewMonth`
3. `holidaysByDate = new Map(holidays.map(h => [h.date, h]))` 用於 O(1) 查格
4. 點擊 → 呼叫 `onAdd`/`onRemove` → SettingsPage 處理 DB → reload → re-render

## 樣式風險

`project_vfs_admin_tailwind.md` 記錄：vfs/admin 的 Tailwind 注入不完整，popup 用 inline style。
月曆會用：`grid grid-cols-7 gap-1 bg-red-50 border-red-300 ring-blue-500` 等。

**緩解策略**：
- 先用 Tailwind 寫，部署後在瀏覽器目視驗證
- 若 grid / bg colors 失靈，把月曆格子的 `display: grid`、`grid-template-columns: repeat(7,1fr)`、背景色用 inline style 寫死
- 月曆容器本身仍可用 Tailwind class（外層 padding、border 通常 OK）

## 測試計畫

部署到 AI GO（**只上傳 VFS，不發布**，依 CLAUDE.md「Dev 模式」流程），瀏覽器手動驗證：

1. 切換月份（上一月、下一月、今天）顯示正確
2. 點空白日 → 變紅、reason=`公休`、DB 確實寫入
3. 點假日日 → 移除、DB 確實刪除
4. busy 期間禁止重複點擊
5. 「匯入本月週一」按鈕功能不變
6. ordering 端的配送日期選擇器仍能正確排除這些日期（回歸測試）

驗證通過後才執行 `deploy_admin.py` 完整發布。

## 不做的事（YAGNI）

- ❌ 不支援補班 / workday 概念
- ❌ 不在月曆上提供 reason 編輯 UI
- ❌ 不顯示農曆 / 節氣（圖中那行小字）
- ❌ 不做拖曳多選一次標記多天
- ❌ 不做年份下拉（左右箭頭 + 今天按鈕已足夠）
