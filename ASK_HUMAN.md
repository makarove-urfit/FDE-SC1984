# ASK_HUMAN

## 待確認

- [x] 2026-04-22 x_category_buyer custom table 已建立並上線
      前端 CategoryBuyerPage 已隨 deploy_admin.py 發布至 admin.apps.ai-go.app

- [ ] 2026-04-02 `syncOrderLinePrices` 的 state filter 實作方式確認
      - 問題：AI GO proxy 不支援 JOIN，無法在 SQL 層過濾「進行中訂單」
      - 目前做法：client-side filter — 查 sale_order_lines 取 order_id，
        再查 sale_orders 取 state，只更新 state='draft' 或 'sale' 的訂單明細
      - 副作用：多一次額外 API call（查 sale_orders），大量訂單時效能略有影響
      - 備選方案：若希望減少 API call，可在後端（AI GO）建立 view 或 composite table；
        或接受現況（兩次查詢）
      - 請確認：此兩次 API call 方式是否可接受，或需要調整設計？

- [ ] 2026-04-02 需求 6：「最近一次價格」的定義
      - 是 sale_order_lines.price_unit 最新一筆？
      - 還是 product_templates.list_price？
      - 或是採購後更新的實價？

- [ ] 2026-04-02 需求 7：實價更新的操作入口在哪裡？
      - 是在 PurchasePage 輸入到貨實價後自動觸發？
      - 還是需要一個獨立的「批次更新價格」按鈕？

- [ ] 2026-04-02 需求 5：稽核軌跡的查看方式？
      - 是在同一頁顯示變更紀錄（inline）？
      - 還是獨立的稽核頁面？

- [ ] 2026-04-02 需求 3：截止時間的粒度？
      - 每天固定同一個時間（如 22:00）？
      - 還是每個訂單日期各別設定截止時間？

- [ ] 2026-04-02 需求 4：休假日是否需要後台手動管理介面，或只是 CSV/固定規則匯入？
