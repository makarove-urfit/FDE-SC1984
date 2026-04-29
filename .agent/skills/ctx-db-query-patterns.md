---
name: ctx-db-query-patterns
description: "ctx.db.query 查詢模式與最佳實踐：filter、sort、search、pagination、批次處理"
trigger: model_decision
---

# ctx.db.query 查詢模式

## 完整簽名

```python
ctx.db.query(
    table: str,
    limit: int = 100,                # 上限 500
    offset: int = 0,                 # 分頁偏移
    order_by: list = None,           # [{"column": "...", "direction": "asc|desc"}]
    search: str = None,              # 全文搜尋關鍵字
    search_columns: list = None,     # 搜尋目標欄位 ["name", "email"]
    select: list = None,             # 只回傳指定欄位
    count_only: bool = False,        # 只返回筆數
    **filters                        # 簡單 eq filter (kwargs)
) -> list
```

## 使用模式

### 1. 簡單篩選 (Simple Filters)

```python
# WHERE active=true AND role='admin'
ctx.db.query("users", active=True, role="admin", limit=50)

# WHERE category_id='abc-123'
ctx.db.query("products", category_id="abc-123", limit=100)
```

### 2. 排序 (Order By)

```python
# ORDER BY name ASC
ctx.db.query("customers", order_by=[{"column": "name", "direction": "asc"}], limit=50)

# 多欄排序：ORDER BY priority DESC, name ASC
ctx.db.query(
    "orders",
    order_by=[
        {"column": "priority", "direction": "desc"},
        {"column": "created_at", "direction": "asc"}
    ],
    limit=100
)
```

### 3. 全文搜尋 (Full-Text Search)

```python
# LIKE '%keyword%' on name, description
ctx.db.query(
    "products",
    search="iPhone",
    search_columns=["name", "description"],
    select=["id", "name", "price"],
    limit=20
)
```

### 4. 欄位篩選 (SELECT 特定欄位)

```python
# 減少 payload，提高查詢效率
ctx.db.query(
    "orders",
    select=["id", "amount", "created_at"],  # 只要這些欄位
    limit=500,
    offset=0
)
```

### 5. 計數查詢 (Count Only)

```python
# 先算總筆數，決定分頁策略
result = ctx.db.query("orders", count_only=True)
total = result["total"]
pages = (total + 499) // 500  # 計算需要幾頁
```

### 6. 分頁迴圈 (Pagination Loop for Batch)

```python
all_records = []
for offset in range(0, 10000, 500):
    batch = ctx.db.query(
        "customers",
        limit=500,
        offset=offset,
        select=["id", "name", "email"]
    )
    if not batch:
        break
    all_records.extend(batch)
    
    # 即時處理，不必等全部載入
    for record in batch:
        process(record)
```

## 不支援 (Workaround)

| 需求 | 做法 |
|------|------|
| WHERE age >= 18 | Python 層過濾：`[r for r in rows if r["age"] >= 18]` |
| WHERE email LIKE '%@gmail.com' | Python 層過濾：`[r for r in rows if "@gmail.com" in r["email"]]` |
| JOIN / GROUP BY | 分開查多張表，Python 層組合/聚合 |
| SUM / COUNT (aggregate) | 用 `count_only=True` 或 `sum(r["amount"] for r in rows)` |

## 批次操作最佳實踐

### 讀取大量資料

```python
def fetch_all(table, filters=None, chunk_size=500):
    """分頁查詢，自動載入所有資料"""
    filters = filters or {}
    all_data = []
    offset = 0
    
    while True:
        batch = ctx.db.query(
            table,
            limit=chunk_size,
            offset=offset,
            **filters
        )
        if not batch:
            break
        all_data.extend(batch)
        offset += chunk_size
    
    return all_data

# 使用
customers = fetch_all("customers", {"active": True})
```

### 寫入批次（insert/update）

```python
def batch_insert(table, rows, batch_size=50):
    """批次新增，避免單次 timeout"""
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        for row in batch:
            ctx.db.insert(table, row)
```

### 組合查詢 + 排序 + 分頁 + 搜尋

```python
# 完整實例：搜尋進行中的訂單，最新優先，只要關鍵欄位，分頁
data = ctx.db.query(
    "orders",
    status="pending",                    # WHERE status='pending'
    search="iPhone",                     # 全文搜尋
    search_columns=["product_name", "notes"],
    order_by=[{"column": "created_at", "direction": "desc"}],  # 最新優先
    select=["id", "customer_name", "amount", "created_at"],   # 關鍵欄位
    limit=100,
    offset=0
)
```

## 效能考量

1. **盡量用 `select` 縮減欄位** — 減少 JSON payload 大小
2. **避免一次查 10K+ 筆** — 用迴圈分頁處理
3. **用 `count_only=True` 預估總數** — 決定分頁策略
4. **複雜篩選改 Python** — 不要等 SDK 支援複雜 operator
5. **搜尋結合 `select`** — 全文搜尋通常配合欄位篩選

