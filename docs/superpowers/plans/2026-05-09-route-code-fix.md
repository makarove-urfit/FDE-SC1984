# 採購單路線代號修復 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓採購單列印頁顯示正確的路線代號，方法是切斷 place_order 的 email 比對 + ghost customer 自動建立兩個壞邏輯，改走 user_id ↔ branch_id 的 rel 表驗證路徑。

**Architecture:** 後端 place_order 改吃前端傳的 branch_id，先 verify rel 再寫入 sale_orders.customer_id；前端在 App.tsx 入口 layer 加 BranchPicker 強制選分店並存 localStorage；admin 端寫一支一次性 backfill action 把舊 hq 訂單隨機分配給 branch。

**Tech Stack:** React 18 + TypeScript（前端）、Python 3 ctx.db（AI GO action）、deploy_lib.py 部署（`--no-publish` + `run_dev` 走 use_dev=true 不影響 prod）

**Spec:** `docs/superpowers/specs/2026-05-09-route-code-fix-design.md`

---

## 共用 dev mode 執行 helper

每次 deploy `--no-publish` 後要呼叫 admin action 驗證，用這個 one-liner（後續 task 以 `<RUN_DEV_ADMIN action params>` 形式引用）：

```bash
set -a && source .env && set +a && python3 -c "
import sys, json
sys.path.insert(0, 'vfs/scripts')
from deploy_lib import login, require_env, run_dev
t = login(require_env('AIGO_EMAIL'), require_env('AIGO_PASSWORD'))
h = {'Authorization': f'Bearer {t}', 'Content-Type': 'application/json'}
r = run_dev(h, require_env('ADMIN_APP_ID'), 'ACTION_NAME', PARAMS_DICT)
print(json.dumps(r, ensure_ascii=False, indent=2, default=str))
"
```

Ordering 的 action（list_my_branches、place_order）需要 `ctx.user_id`，不能用 admin 的 run_dev 跑。Ordering action 的驗證走「上傳 → 真實使用者在瀏覽器測 → 看 response」。

---

## File Map

**新增**：
- `vfs/ordering/actions/list_my_branches.py` — 給前端 picker 拉清單
- `vfs/admin/actions/backfill_sale_orders_branch.py` — 一次性 backfill
- `vfs/ordering/src/utils/branchSession.ts` — localStorage helper
- `vfs/ordering/src/components/BranchPicker.tsx` — modal 元件

**修改**：
- `vfs/scripts/db_ordering.py` — REFS 補 customer_custom_app_user_rel（read），customers 補欄位
- `vfs/scripts/db_admin.py` — REFS 補 customer_custom_app_user_rel、custom_app_users
- `vfs/ordering/actions/place_order.py` — 重寫驗證段
- `vfs/ordering/actions/manifest.json` — 註冊 list_my_branches
- `vfs/admin/actions/manifest.json` — 註冊 backfill_sale_orders_branch
- `vfs/ordering/src/App.tsx` — selectedBranch state、picker 整合、header chip
- `vfs/ordering/src/pages/CartPage.tsx` — handleSubmit 改傳 branch_id、處理 BRANCH_FORBIDDEN

---

## Task 1: REFS 變更（同時動 admin + ordering）

**Files:**
- Modify: `vfs/scripts/db_ordering.py`
- Modify: `vfs/scripts/db_admin.py`

- [ ] **Step 1.1: 修 `vfs/scripts/db_ordering.py` 擴充 customers 欄位 + 加 rel 表**

把 `customers` 那行的 columns 從
```python
["id", "name", "email", "ref", "customer_type"]
```
改成
```python
["id", "name", "email", "ref", "customer_type", "short_name", "custom_data", "active"]
```

permissions 維持 `["read", "create"]` 不變。

在 `customers` 那行下方新增一行：
```python
{"table_name": "customer_custom_app_user_rel", "columns": ["id", "customer_id", "custom_app_user_id"], "permissions": ["read", "create"]},
```
（已有 redeem_invite_token 用 create，現補 read。）

- [ ] **Step 1.2: 修 `vfs/scripts/db_admin.py` 加兩張新 REFS**

在 `customer_tags` 那行下方新增兩行：
```python
{"table_name": "customer_custom_app_user_rel", "columns": ["id", "customer_id", "custom_app_user_id"], "permissions": ["read", "create", "update"]},
{"table_name": "custom_app_users",             "columns": ["id", "email", "display_name"],             "permissions": ["read"]},
```

- [ ] **Step 1.3: 部署兩個 app（不發布）驗證 REFS 同步**

```bash
set -a && source .env && set +a
python3 vfs/scripts/deploy_admin.py --no-publish 2>&1 | tail -10
python3 vfs/scripts/deploy_ordering.py --no-publish 2>&1 | tail -10
```

預期看到 `[customer_custom_app_user_rel] 200`、`[custom_app_users] 200`、`[customers] 200`。任一 != 200 停下來查。

- [ ] **Step 1.4: 跑 debug_route_code 確認原本 403 已修復**

執行 `<RUN_DEV_ADMIN debug_route_code {}>`。

預期：原本 `rel_error` 跟 `users_error` 兩個欄位**消失或變成有資料**。`rel_table.total` 會回 > 0、`email_match_check` 也會有結果。如果還是 403，REFS patch 沒生效，重看 step 1.1/1.2。

- [ ] **Step 1.5: Commit**

```bash
git add vfs/scripts/db_ordering.py vfs/scripts/db_admin.py
git commit -m "feat(refs): 補 customer_custom_app_user_rel 與 customers 欄位

修 Phase 1 admin app 對 rel 表 403。ordering 的 customers 也補上
short_name/custom_data/active，list_my_branches 跟未來分析會用到。"
```

---

## Task 2: list_my_branches action（含純函式單元測試）

**Files:**
- Create: `vfs/ordering/actions/list_my_branches.py`
- Modify: `vfs/ordering/actions/manifest.json`

設計策略：把過濾邏輯抽成純函式 `_filter_branches(uid, rels, customers)`，可在 `if __name__ == "__main__":` 區塊本地單元測試（無 ctx 依賴）。

- [ ] **Step 2.1: 寫 action 含純函式 + 內嵌單元測試**

完整內容寫到 `vfs/ordering/actions/list_my_branches.py`：

```python
"""list_my_branches — 回傳目前 user 綁定且 kind=branch 的客戶清單。"""

def _filter_branches(uid, rels, customers):
    """純函式：給定 uid、rel list、customer list，回傳該 user 能下單的 branch 清單。
    僅回 kind=branch、active != False 的客戶。"""
    my_ids = {str(r.get("customer_id") or "") for r in rels
              if str(r.get("custom_app_user_id") or "") == uid}
    cust_by_id = {str(c.get("id") or ""): c for c in customers}
    out = []
    for cid in my_ids:
        c = cust_by_id.get(cid)
        if not c:
            continue
        cd = c.get("custom_data") or {}
        if cd.get("kind") != "branch":
            continue
        if c.get("active") is False:
            continue
        parent = cust_by_id.get(str(cd.get("parent_customer_id") or ""))
        out.append({
            "branch_id": str(c.get("id") or ""),
            "branch_name": c.get("name") or "",
            "hq_name": (parent or {}).get("name") or "",
        })
    out.sort(key=lambda x: (x["hq_name"], x["branch_name"]))
    return out


def execute(ctx):
    uid = str((ctx.user.get("id") or ctx.user.get("custom_app_user_id")) or "")
    if not uid:
        ctx.response.json({"branches": [], "error": "no user_id"})
        return
    try:
        rels = ctx.db.query("customer_custom_app_user_rel", limit=2000) or []
        customers = ctx.db.query("customers", limit=2000) or []
    except Exception as e:
        ctx.response.json({"branches": [], "error": str(e)})
        return
    ctx.response.json({"branches": _filter_branches(uid, rels, customers)})


if __name__ == "__main__":
    rels = [
        {"customer_id": "b1", "custom_app_user_id": "u1"},
        {"customer_id": "h1", "custom_app_user_id": "u1"},
        {"customer_id": "b2", "custom_app_user_id": "u2"},
        {"customer_id": "b3_inactive", "custom_app_user_id": "u1"},
    ]
    customers = [
        {"id": "b1", "name": "B-One", "active": True,  "custom_data": {"kind": "branch", "parent_customer_id": "h1"}},
        {"id": "b2", "name": "B-Two", "active": True,  "custom_data": {"kind": "branch", "parent_customer_id": "h2"}},
        {"id": "b3_inactive", "name": "B-Off", "active": False, "custom_data": {"kind": "branch", "parent_customer_id": "h1"}},
        {"id": "b4_active_null", "name": "B-Null", "custom_data": {"kind": "branch", "parent_customer_id": "h1"}},  # active 省略 → None，依 active=null convention 應放行
        {"id": "h1", "name": "HQ-One", "active": True, "custom_data": {"kind": "headquarters"}},
        {"id": "h2", "name": "HQ-Two", "active": True, "custom_data": {"kind": "headquarters"}},
    ]
    rels.append({"customer_id": "b4_active_null", "custom_app_user_id": "u1"})
    r = _filter_branches("u1", rels, customers)
    assert len(r) == 2, f"u1 should see 2 branches (b1, b4_active_null), got {r}"
    ids = {b["branch_id"] for b in r}
    assert ids == {"b1", "b4_active_null"}, f"unexpected ids {ids}"
    assert _filter_branches("u_unknown", rels, customers) == []
    assert _filter_branches("u2", rels, customers)[0]["branch_id"] == "b2"
    print("✅ list_my_branches._filter_branches tests pass")
```

- [ ] **Step 2.2: 跑單元測試**

```bash
python3 vfs/ordering/actions/list_my_branches.py
```

預期 stdout：`✅ list_my_branches._filter_branches tests pass`、exit code 0。

- [ ] **Step 2.3: 註冊到 manifest**

修 `vfs/ordering/actions/manifest.json`，在 `manage_favorites` 那一段下方新增：
```json
"list_my_branches": {
  "description": "回傳目前 user 綁定且 kind=branch 的客戶清單，給下單前 branch picker 用"
}
```

注意維持 JSON 合法（前一行尾要加 `,`）。

- [ ] **Step 2.4: 部署 ordering --no-publish 並編譯通過**

```bash
set -a && source .env && set +a && python3 vfs/scripts/deploy_ordering.py --no-publish 2>&1 | tail -10
```

預期：`編譯驗證: 200 success=True`。失敗代表 manifest JSON 格式錯。

- [ ] **Step 2.5: Commit**

```bash
git add vfs/ordering/actions/list_my_branches.py vfs/ordering/actions/manifest.json
git commit -m "feat(ordering): 新增 list_my_branches action

給前端 branch picker 拉「目前 user 綁定的 branch 清單」。
過濾邏輯抽成純函式 _filter_branches，含內嵌單元測試。"
```

---

## Task 3: 重寫 place_order — 砍 email 比對 + ghost customer，改 rel 驗證

**Files:**
- Modify: `vfs/ordering/actions/place_order.py`

設計策略：抽 `_is_authorized(uid, branch_id, rels)` 純函式，內嵌單元測試。

- [ ] **Step 3.1: 改寫 place_order.py**

把整支 `vfs/ordering/actions/place_order.py` 改成：

```python
"""place_order — 客戶下單。改吃前端傳的 branch_id，verify rel 通過才寫入 customer_id。"""

def _is_authorized(uid, branch_id, rels):
    """純函式：給定 uid、branch_id、rel list，判斷 user 是否真的綁這個 branch。"""
    return any(
        str(r.get("custom_app_user_id") or "") == uid
        and str(r.get("customer_id") or "") == branch_id
        for r in rels
    )


def execute(ctx):
    from datetime import datetime, timezone, timedelta

    items = ctx.params.get("items", [])
    branch_id = str(ctx.params.get("branch_id") or "")
    note = ctx.params.get("note", "")
    delivery_date = ctx.params.get("delivery_date", "")
    uid = str((ctx.user.get("id") or ctx.user.get("custom_app_user_id")) or "")

    if not items or not branch_id:
        ctx.response.json({"error": "缺少必要參數（items / branch_id）"})
        return
    if not uid:
        ctx.response.json({"error": "未登入", "code": "UNAUTHORIZED"})
        return
    if not delivery_date:
        ctx.response.json({"error": "未指定配送日期", "code": "DATE_BLOCKED"})
        return

    tw_now = datetime.now(timezone(timedelta(hours=8)))
    today_tw = tw_now.strftime("%Y-%m-%d")
    if delivery_date < today_tw:
        ctx.response.json({"error": "配送日期已過，請改選新的配送日期", "code": "DATE_BLOCKED"})
        return
    if delivery_date == today_tw:
        cutoff_time = ""
        try:
            setting_rows = ctx.db.query_object("x_app_settings", limit=100) or []
            for r in setting_rows:
                if r.get("key") == "order_cutoff_time":
                    cutoff_time = str(r.get("value", ""))
                    break
        except Exception:
            cutoff_time = ""
        if cutoff_time and ":" in cutoff_time:
            try:
                h, m = [int(x) for x in cutoff_time.split(":")[:2]]
                if tw_now.hour * 60 + tw_now.minute >= h * 60 + m:
                    ctx.response.json({
                        "error": f"已超過今日下單時間（{cutoff_time}），請改選新的配送日期",
                        "code": "DATE_BLOCKED",
                    })
                    return
            except Exception:
                pass

    # ── 權限驗證：user 必須真的綁這個 branch ──
    try:
        rels = ctx.db.query("customer_custom_app_user_rel", limit=2000) or []
    except Exception as e:
        ctx.response.json({"error": "權限驗證暫時不可用，請稍後再試", "code": "SERVER_ERROR", "detail": str(e)})
        return
    if not _is_authorized(uid, branch_id, rels):
        ctx.response.json({"error": "無權對此分店下單", "code": "BRANCH_FORBIDDEN"})
        return

    customer_id = branch_id
    today = delivery_date
    date_order = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    order_note = f"配送日期：{today}"
    if note:
        order_note += f"\n{note}"

    order = ctx.db.insert("sale_orders", {
        "customer_id": customer_id,
        "date_order": date_order,
        "note": order_note,
        "state": "draft",
    })
    order_id = order.get("id") if order else None
    if not order_id:
        ctx.response.json({"error": "建立訂單失敗"})
        return

    for item in items:
        line_payload = {
            "order_id": order_id,
            "product_template_id": item.get("product_template_id"),
            "name": item.get("product_name", ""),
            "product_uom_qty": item.get("qty", 1),
            "price_unit": item.get("price_unit", 0),
            "delivery_date": today,
        }
        line_note = (item.get("note") or "").strip()
        if line_note:
            line_payload["custom_data"] = {"note": line_note}
        result = ctx.db.insert("sale_order_lines", line_payload)
        if not result or not result.get("id"):
            ctx.response.json({"error": f"明細建立失敗：{item.get('product_name')}"})
            return

    ctx.response.json({
        "order_id": order_id,
        "order_name": order.get("name") or f"SO-{str(order_id)[:8]}",
        "delivery_date": today,
        "items_count": len(items),
    })


if __name__ == "__main__":
    rels = [
        {"customer_id": "b1", "custom_app_user_id": "u1"},
        {"customer_id": "h1", "custom_app_user_id": "u1"},
    ]
    assert _is_authorized("u1", "b1", rels), "u1 應該能下 b1"
    assert _is_authorized("u1", "h1", rels), "u1 也綁 hq（雖然不該被選）"
    assert not _is_authorized("u2", "b1", rels), "u2 不該能下 b1"
    assert not _is_authorized("u1", "b_unknown", rels), "u1 沒綁的 branch 要擋"
    assert not _is_authorized("", "b1", rels), "空 uid 一律擋"
    print("✅ place_order._is_authorized tests pass")
```

- [ ] **Step 3.2: 跑單元測試**

```bash
python3 vfs/ordering/actions/place_order.py
```

預期：`✅ place_order._is_authorized tests pass`、exit 0。

- [ ] **Step 3.3: 部署 ordering --no-publish 編譯通過**

```bash
set -a && source .env && set +a && python3 vfs/scripts/deploy_ordering.py --no-publish 2>&1 | tail -10
```

預期 `編譯驗證: 200 success=True`。

- [ ] **Step 3.4: Commit**

```bash
git add vfs/ordering/actions/place_order.py
git commit -m "fix(ordering): place_order 改吃 branch_id + rel 驗證

切斷兩個壞邏輯：
- email 比對找 customer（branch 沒 email 永遠 match 到 hq）
- email 沒 match 自動建 ghost customer（造成 25 筆 kind 為空殘留）

新流程：前端傳 branch_id → verify rel → customer_id = branch_id。
未綁 rel 的 user 直接 BRANCH_FORBIDDEN，前端會清 localStorage 重選。"
```

---

## Task 4: backfill_sale_orders_branch admin action

**Files:**
- Create: `vfs/admin/actions/backfill_sale_orders_branch.py`
- Modify: `vfs/admin/actions/manifest.json`

設計：把分配邏輯抽成純函式 `_assign_branches(orders, customers, fallback_strategy, rng)`，注入 RNG 讓單元測試可預測。

- [ ] **Step 4.1: 寫 action**

完整 `vfs/admin/actions/backfill_sale_orders_branch.py`：

```python
"""backfill_sale_orders_branch — dev 期一次性，把指 hq 的 sale_orders 隨機改寫成 branch。
spec: docs/superpowers/specs/2026-05-09-route-code-fix-design.md §7"""
import random


def _kind(c):
    return ((c or {}).get("custom_data") or {}).get("kind") or ""


def _assign_branches(orders, customers, fallback_strategy, rng):
    """純函式：對每筆 sale_order 決定要 rewrite 成哪個 branch_id。
    回傳 (changes, stats)。dry_run 與 actual update 都用這個結果。"""
    cust_by_id = {str(c.get("id") or ""): c for c in customers}
    branches_by_hq = {}
    all_active_branches = []
    for c in customers:
        if _kind(c) != "branch":
            continue
        if c.get("active") is False:
            continue
        all_active_branches.append(c)
        hq = str(((c.get("custom_data") or {}).get("parent_customer_id") or ""))
        if hq:
            branches_by_hq.setdefault(hq, []).append(c)

    stats = {
        "total_orders": len(orders),
        "skipped_already_branch": 0,
        "rewrote_hq_to_branch": 0,
        "rewrote_ghost_to_random_branch": 0,
        "skipped_ghost": 0,
        "no_branch_available": 0,
    }
    changes = []

    if not all_active_branches:
        return changes, {**stats, "error": "no branches available, cannot backfill"}

    for o in orders:
        oid = str(o.get("id") or "")
        cid = str(o.get("customer_id") or "")
        c = cust_by_id.get(cid)
        c_kind = _kind(c)

        if c_kind == "branch":
            stats["skipped_already_branch"] += 1
            continue

        if c_kind in ("headquarters", "independent"):
            pool = branches_by_hq.get(cid, [])
            if not pool:
                stats["no_branch_available"] += 1
                continue
            new_b = rng.choice(pool)
            changes.append({
                "order_id": oid,
                "from_kind": c_kind,
                "from_name": (c or {}).get("name"),
                "to_branch_id": str(new_b["id"]),
                "to_branch_name": new_b.get("name"),
            })
            stats["rewrote_hq_to_branch"] += 1
            continue

        # ghost / empty kind
        if fallback_strategy == "skip":
            stats["skipped_ghost"] += 1
            continue
        new_b = rng.choice(all_active_branches)
        changes.append({
            "order_id": oid,
            "from_kind": c_kind or "(empty)",
            "from_name": (c or {}).get("name"),
            "to_branch_id": str(new_b["id"]),
            "to_branch_name": new_b.get("name"),
        })
        stats["rewrote_ghost_to_random_branch"] += 1

    return changes, stats


def execute(ctx):
    dry_run = bool((ctx.params or {}).get("dry_run", True))
    fallback_strategy = str((ctx.params or {}).get("fallback_strategy", "any_branch"))
    seed = (ctx.params or {}).get("seed")
    rng = random.Random(seed) if seed is not None else random.Random()

    orders = ctx.db.query("sale_orders", limit=2000) or []
    customers = ctx.db.query("customers", limit=2000) or []

    changes, stats = _assign_branches(orders, customers, fallback_strategy, rng)
    if "error" in stats:
        ctx.response.json(stats)
        return

    actually_updated = 0
    if not dry_run:
        for ch in changes:
            try:
                ctx.db.update("sale_orders", ch["order_id"], {"customer_id": ch["to_branch_id"]})
                actually_updated += 1
            except Exception as e:
                ch["error"] = str(e)

    ctx.response.json({
        "dry_run": dry_run,
        "fallback_strategy": fallback_strategy,
        **stats,
        "actually_updated": actually_updated,
        "sample_changes": changes[:10],
        "total_changes": len(changes),
    })


if __name__ == "__main__":
    customers = [
        {"id": "h1", "name": "HQ-One", "custom_data": {"kind": "headquarters"}},
        {"id": "h2", "name": "HQ-Two", "custom_data": {"kind": "headquarters"}},
        {"id": "b1", "name": "B-One",  "active": True, "custom_data": {"kind": "branch", "parent_customer_id": "h1"}},
        {"id": "b2", "name": "B-Two",  "active": True, "custom_data": {"kind": "branch", "parent_customer_id": "h2"}},
        {"id": "g1", "name": "Ghost",  "custom_data": {}},
    ]
    orders = [
        {"id": "o1", "customer_id": "h1"},
        {"id": "o2", "customer_id": "h2"},
        {"id": "o3", "customer_id": "b1"},
        {"id": "o4", "customer_id": "g1"},
    ]
    rng = random.Random(42)
    changes, stats = _assign_branches(orders, customers, "any_branch", rng)
    assert stats["skipped_already_branch"] == 1, stats
    assert stats["rewrote_hq_to_branch"] == 2, stats
    assert stats["rewrote_ghost_to_random_branch"] == 1, stats
    assert stats["no_branch_available"] == 0, stats
    assert len(changes) == 3
    by_oid = {c["order_id"]: c for c in changes}
    assert by_oid["o1"]["to_branch_id"] == "b1", "h1 only has b1 underneath"
    assert by_oid["o2"]["to_branch_id"] == "b2", "h2 only has b2 underneath"

    # skip fallback
    changes2, stats2 = _assign_branches(orders, customers, "skip", random.Random(42))
    assert stats2["skipped_ghost"] == 1
    assert stats2["rewrote_ghost_to_random_branch"] == 0

    # no branch at all → error
    _, stats3 = _assign_branches(orders, [c for c in customers if _kind(c) != "branch"], "any_branch", random.Random(42))
    assert "error" in stats3

    print("✅ backfill_sale_orders_branch._assign_branches tests pass")
```

- [ ] **Step 4.2: 跑單元測試**

```bash
python3 vfs/admin/actions/backfill_sale_orders_branch.py
```

預期：`✅ backfill_sale_orders_branch._assign_branches tests pass`。

- [ ] **Step 4.3: 註冊到 manifest**

修 `vfs/admin/actions/manifest.json`，在 `debug_route_code` 那一段下方新增：
```json
"backfill_sale_orders_branch": {
  "description": "[dev 一次性] 把指向 hq 的 sale_orders 隨機 backfill 到該 hq 底下的 branch；ghost 訂單依 fallback_strategy 處理"
}
```
（注意前一行尾加 `,`。）

- [ ] **Step 4.4: 部署 admin --no-publish 編譯通過**

```bash
set -a && source .env && set +a && python3 vfs/scripts/deploy_admin.py --no-publish 2>&1 | tail -10
```

預期 `編譯驗證: 200 success=True`。

- [ ] **Step 4.5: Commit**

```bash
git add vfs/admin/actions/backfill_sale_orders_branch.py vfs/admin/actions/manifest.json
git commit -m "feat(admin): 新增 backfill_sale_orders_branch dev 期一次性 action

把指向 hq 的 sale_orders 改寫到該 hq 底下隨機 branch；ghost 訂單可選
any_branch（全集池隨機）或 skip。spec §7。"
```

---

## Task 5: 跑 backfill — 先 dry_run 確認，再實際寫入

**Files:** 無變更，純執行

- [ ] **Step 5.1: Dry run**

執行 `<RUN_DEV_ADMIN backfill_sale_orders_branch {"dry_run": true, "fallback_strategy": "any_branch", "seed": 42}>`。

預期 stats：
- `total_orders` ≈ 56（如有新單可能略多）
- `skipped_already_branch`: 0
- `rewrote_hq_to_branch`: 31
- `rewrote_ghost_to_random_branch`: 25
- `no_branch_available`: 0
- `actually_updated`: 0（dry_run）
- `total_changes`: 56
- `sample_changes` 看 from_name / to_branch_name 是否合理

如果數字不符（例如 no_branch_available > 0），停下來檢查 customers 資料。

- [ ] **Step 5.2: 實際 backfill**

執行 `<RUN_DEV_ADMIN backfill_sale_orders_branch {"dry_run": false, "fallback_strategy": "any_branch", "seed": 42}>`。

預期：`actually_updated == total_changes`（前一步的 56）。任何 `error` 在 sample_changes 裡停下來。

- [ ] **Step 5.3: 驗證**

執行 `<RUN_DEV_ADMIN debug_route_code {}>`。

預期：
- `sale_orders.by_customer_kind`：應該變成 `{"branch": 56}` 或接近全 branch
- `sale_orders.with_region_tag_via_customer`：應該等於 `with_customer_id`（因為現有 2 個 branch 都有 region_tag_id）

如果還有 `headquarters` 或 `(empty)` kind 訂單，停下來查：可能是 backfill 跑半途出錯。

- [ ] **Step 5.4: Commit（執行紀錄，無檔案變更時跳過）**

backfill 純執行不產生檔案 diff，本步驟通常無需 commit。若需保留執行 log 可手動加入後 commit。

---

## Task 6: branchSession.ts localStorage helper

**Files:**
- Create: `vfs/ordering/src/utils/branchSession.ts`

- [ ] **Step 6.1: 寫檔**

完整內容：

```ts
const KEY = "selected_branch";

export interface SelectedBranch {
  branch_id: string;
  branch_name: string;
  hq_name: string;
}

export function getSelectedBranch(): SelectedBranch | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && typeof data.branch_id === "string" && data.branch_id) return data as SelectedBranch;
    return null;
  } catch {
    return null;
  }
}

export function setSelectedBranch(b: SelectedBranch): void {
  localStorage.setItem(KEY, JSON.stringify(b));
}

export function clearSelectedBranch(): void {
  localStorage.removeItem(KEY);
}
```

- [ ] **Step 6.2: Commit（先放著，後面 task 會用到）**

```bash
git add vfs/ordering/src/utils/branchSession.ts
git commit -m "feat(ordering): 新增 branchSession.ts localStorage helper

之後 BranchPicker 與 App.tsx 會用來持久化 user 選的分店。"
```

---

## Task 7: BranchPicker 元件

**Files:**
- Create: `vfs/ordering/src/components/BranchPicker.tsx`

- [ ] **Step 7.1: 寫檔**

```tsx
import React from "react";
import type { SelectedBranch } from "../utils/branchSession";

interface Props {
  branches: SelectedBranch[];
  onSelect: (b: SelectedBranch) => void;
  onDismiss?: () => void;
  canDismiss?: boolean;
  loading?: boolean;
}

export default function BranchPicker({ branches, onSelect, onDismiss, canDismiss, loading }: Props) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff", borderRadius: 12, maxWidth: 480, width: "100%",
          maxHeight: "80vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 16 }}>選擇下單分店</strong>
          {canDismiss && (
            <button onClick={onDismiss} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
          )}
        </div>

        <div style={{ overflow: "auto", flex: 1, padding: "8px 0" }}>
          {loading && <div style={{ padding: 20, textAlign: "center", color: "#888" }}>載入中…</div>}

          {!loading && branches.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: "#888" }}>
              <p>您尚未綁定任何分店。</p>
              <p style={{ fontSize: 12 }}>請使用您收到的邀請連結兌換 token。</p>
            </div>
          )}

          {!loading && branches.map(b => (
            <button
              key={b.branch_id}
              onClick={() => onSelect(b)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "12px 20px", border: "none", background: "none",
                borderBottom: "1px solid #f0f0f0", cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600 }}>{b.branch_name}</div>
              {b.hq_name && <div style={{ fontSize: 12, color: "#888" }}>{b.hq_name}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

注意用 inline style 而非 className（per memory：vfs/admin Tailwind 不完整，dropdown 等要 inline style；ordering 一致風格）。

- [ ] **Step 7.2: 部署 ordering --no-publish 編譯通過（含 TS 檢查）**

```bash
set -a && source .env && set +a && python3 vfs/scripts/deploy_ordering.py --no-publish 2>&1 | tail -10
```

預期 `編譯驗證: 200 success=True`。失敗多半是 TS 型別錯。

- [ ] **Step 7.3: Commit**

```bash
git add vfs/ordering/src/components/BranchPicker.tsx
git commit -m "feat(ordering): 新增 BranchPicker modal 元件

inline style（平台 Tailwind 不完整）。loading / empty / 列表三態。
canDismiss=false 時無 × 鈕，強制 user 必選一項才能繼續。"
```

---

## Task 8: App.tsx 整合 — selectedBranch state、picker 觸發、header chip

**Files:**
- Modify: `vfs/ordering/src/App.tsx`

- [ ] **Step 8.1: 加 import**

在 App.tsx 第 11 行（`import { Product } from "./pages/CatalogProductCard";` 下）加：

```tsx
import BranchPicker from "./components/BranchPicker";
import { getSelectedBranch, setSelectedBranch as saveSelectedBranch, clearSelectedBranch, type SelectedBranch } from "./utils/branchSession";
```

- [ ] **Step 8.2: 在 App() 內加 selectedBranch + branches state**

在 `const [configLoaded, setConfigLoaded] = useState(false);` 之後加：

```tsx
const [selectedBranch, setSelectedBranchState] = useState<SelectedBranch | null>(getSelectedBranch);
const [branches, setBranches] = useState<SelectedBranch[]>([]);
const [branchesLoading, setBranchesLoading] = useState(false);
const [pickerOpen, setPickerOpen] = useState(false);
const [pickerCanDismiss, setPickerCanDismiss] = useState(false);
```

- [ ] **Step 8.3: 加 useEffect 拉 branches、決定是否強制開 picker**

在 `db.runAction("get_catalog", ...)` 那個 useEffect 之後加一個新的 useEffect：

```tsx
useEffect(() => {
  if (!user) return;
  setBranchesLoading(true);
  db.runAction("list_my_branches", {})
    .then((d: any) => {
      const list = Array.isArray(d?.branches) ? d.branches : [];
      setBranches(list);
      const cur = getSelectedBranch();
      if (cur && list.some((b: SelectedBranch) => b.branch_id === cur.branch_id)) {
        setSelectedBranchState(cur);
      } else {
        // localStorage 裡的 branch 已不在綁定清單（可能被解除）→ 清掉強制重選
        clearSelectedBranch();
        setSelectedBranchState(null);
        setPickerCanDismiss(false);
        setPickerOpen(true);
      }
    })
    .catch(() => {})
    .finally(() => setBranchesLoading(false));
}, [user]);
```

- [ ] **Step 8.4: 加 handler 函式**

在 `const handleLogout = () => { ... };` 之後加：

```tsx
const handleSelectBranch = (b: SelectedBranch) => {
  saveSelectedBranch(b);
  setSelectedBranchState(b);
  setPickerOpen(false);
};
const handleOpenSwitcher = () => {
  setPickerCanDismiss(true);
  setPickerOpen(true);
};
const handleInvalidateBranch = () => {
  // 後端回 BRANCH_FORBIDDEN 時呼叫：清掉 React state + localStorage，強制重選
  clearSelectedBranch();
  setSelectedBranchState(null);
  setPickerCanDismiss(false);
  setPickerOpen(true);
};
```

- [ ] **Step 8.5: 把 selectedBranch + onOpenSwitcher 傳進 AppShell**

修 App() return 的 AppShell，把：
```tsx
return <AppShell user={user} cart={cart} ... cartCount={cartCount} currentPath={currentPath} navigate={navigate} onLogout={handleLogout} />;
```
改成：
```tsx
return (
  <>
    <AppShell user={user} cart={cart} addToCart={addToCart} setCartExact={setCartExact} clearCartDate={clearCartDate} setCartItemNote={setCartItemNote}
      uomMap={uomMap} holidays={holidays} priceMap={priceMap} allTemplates={allTemplates} categories={categories}
      configLoaded={configLoaded} cutoffTime={cutoffTime} deliveryDate={deliveryDate} setDeliveryDate={setDeliveryDate}
      changeCartGroupDate={changeCartGroupDate}
      cartCount={cartCount} currentPath={currentPath} navigate={navigate} onLogout={handleLogout}
      selectedBranch={selectedBranch} onOpenBranchSwitcher={handleOpenSwitcher} />
    {pickerOpen && (
      <BranchPicker
        branches={branches}
        loading={branchesLoading}
        canDismiss={pickerCanDismiss}
        onSelect={handleSelectBranch}
        onDismiss={() => setPickerOpen(false)}
      />
    )}
  </>
);
```

- [ ] **Step 8.6: AppShell 簽名加參數，並在 header 渲染 chip**

修 AppShell 的解構：
```tsx
function AppShell({ user, cart, addToCart, setCartExact, clearCartDate, setCartItemNote, uomMap, holidays, priceMap, allTemplates, categories, configLoaded, cutoffTime, deliveryDate, setDeliveryDate, changeCartGroupDate, cartCount, currentPath, navigate, onLogout, selectedBranch, onOpenBranchSwitcher }: any) {
```

修 header 段（原本 `<header className="app-topbar">`），把：
```tsx
<header className="app-topbar">
  <h1>雄泉鮮食</h1>
  <button className="logout-btn" onClick={onLogout}>登出</button>
</header>
```
改成：
```tsx
<header className="app-topbar">
  <h1>雄泉鮮食</h1>
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    {selectedBranch && (
      <button
        onClick={onOpenBranchSwitcher}
        style={{
          background: "#f0f4ff", border: "1px solid #cdd9ff",
          borderRadius: 16, padding: "4px 12px", fontSize: 13,
          cursor: "pointer", color: "#3344aa",
        }}
        title="點擊切換分店"
      >
        分店：{selectedBranch.branch_name}
      </button>
    )}
    <button className="logout-btn" onClick={onLogout}>登出</button>
  </div>
</header>
```

- [ ] **Step 8.7: 部署編譯通過**

```bash
set -a && source .env && set +a && python3 vfs/scripts/deploy_ordering.py --no-publish 2>&1 | tail -10
```

預期 `編譯驗證: 200 success=True`。失敗多半是 TS 型別。

- [ ] **Step 8.8: Commit**

```bash
git add vfs/ordering/src/App.tsx
git commit -m "feat(ordering): App.tsx 整合 BranchPicker + header 分店 chip

登入後拉 list_my_branches，localStorage 沒選 / 選的已不存在 → 強制開 picker。
header 顯示當前分店，點擊重開 picker（canDismiss=true）。"
```

---

## Task 9: CartPage handleSubmit 改傳 branch_id + 處理 BRANCH_FORBIDDEN

**Files:**
- Modify: `vfs/ordering/src/pages/CartPage.tsx`

- [ ] **Step 9.1: 看現有 props 列表（讀取，不改）**

```bash
grep -n "selectedBranch\|user_email\|place_order" vfs/ordering/src/pages/CartPage.tsx
```

確認 CartPage 目前沒有 `selectedBranch` prop。

- [ ] **Step 9.2: 加 import**

在 `vfs/ordering/src/pages/CartPage.tsx` 檔案最上方 import 區加：

```tsx
import { clearSelectedBranch, type SelectedBranch } from "../utils/branchSession";
```

- [ ] **Step 9.3: Props interface 加 selectedBranch + onBranchInvalid**

找到 CartPage 的 props 解構（`export default function CartPage({...}: any) {` 或類似），檔案使用 `: any` 的話直接從 props 取，不用改 interface。在解構參數加：

```tsx
selectedBranch, onBranchInvalid,
```

如果 props 是 `: any`，這樣就夠。如果有具名 interface，加：
```tsx
selectedBranch: SelectedBranch | null;
onBranchInvalid: () => void;
```

- [ ] **Step 9.4: 改 handleSubmit**

把現有 `handleSubmit`（`const handleSubmit = async (date: string) => { ... }`）內：
```tsx
const result = await db.runAction("place_order", {
  user_email: user.email,
  delivery_date: date,
  note: groupNotes[date] || "",
  items: ...,
});
```

改成：
```tsx
if (!selectedBranch) {
  showToast("請先選擇分店", true);
  onBranchInvalid();
  return;
}
const result = await db.runAction("place_order", {
  branch_id: selectedBranch.branch_id,
  delivery_date: date,
  note: groupNotes[date] || "",
  items: items.map(item => ({
    product_template_id: item.productId,
    product_name: tmplMap[item.productId]?.name ?? "",
    qty: item.qty,
    price_unit: priceMap[item.productId]?.price ?? 0,
    note: ((item.note ?? defaultNoteMap[item.productId]) ?? "").trim(),
  })),
});
if (result?.code === "BRANCH_FORBIDDEN") {
  clearSelectedBranch();
  onBranchInvalid();
  showToast("分店權限失效，請重新選擇分店", true);
  return;
}
```

注意 items.map(...) 段保留原本邏輯，只動 user_email → branch_id。

- [ ] **Step 9.5: App.tsx 把 selectedBranch + onBranchInvalid 傳進 AppShell 與 CartPage**

回到 `vfs/ordering/src/App.tsx`：

(a) 修 App() return 區塊裡 `<AppShell ... selectedBranch={selectedBranch} onOpenBranchSwitcher={handleOpenSwitcher} />`，多加一個 prop：
```tsx
onInvalidateBranch={handleInvalidateBranch}
```

(b) 修 AppShell 簽名（Step 8.6 改過的那行），把 `onOpenBranchSwitcher` 後加上 `, onInvalidateBranch`：
```tsx
function AppShell({ ..., selectedBranch, onOpenBranchSwitcher, onInvalidateBranch }: any) {
```

(c) AppShell 裡 `"/cart": <CartPage ...`，在 props 末尾加：
```tsx
selectedBranch={selectedBranch} onBranchInvalid={onInvalidateBranch}
```

這樣 BRANCH_FORBIDDEN 時呼叫的是 `handleInvalidateBranch`（清 state + localStorage + canDismiss=false 開 picker），跟 header 切換用的 `handleOpenSwitcher`（保留 state + canDismiss=true）區分清楚。

- [ ] **Step 9.6: 部署編譯通過**

```bash
set -a && source .env && set +a && python3 vfs/scripts/deploy_ordering.py --no-publish 2>&1 | tail -10
```

預期 `編譯驗證: 200 success=True`。

- [ ] **Step 9.7: Commit**

```bash
git add vfs/ordering/src/pages/CartPage.tsx vfs/ordering/src/App.tsx
git commit -m "fix(ordering): CartPage 改傳 branch_id 並處理 BRANCH_FORBIDDEN

下單前必選分店，未選不能送出。後端 BRANCH_FORBIDDEN 時清 localStorage
並重開 picker。徹底告別 user_email 串接。"
```

---

## Task 10: 全鏈路 browser 手測

**Files:** 無變更，純驗證

- [ ] **Step 10.1: ordering app 已是最新 dev build**

確認最後一次 deploy_ordering --no-publish 的編譯 200。如果 step 9.6 已 confirm，跳過重 deploy。

- [ ] **Step 10.2: 開 ordering app（dev URL）**

讓人類使用者用測試 LINE/帳號登入 ordering（dev mode 訪問方式照專案原本流程，例如 ai-go.app/runtime/{ordering_slug}）。

期望流程：
1. 登入後（如果 localStorage 沒 selected_branch）→ 自動跳 BranchPicker，看到綁定的 branch 列表
2. 選一個 branch → modal 關閉，header 出現「分店：{name}」chip
3. 加入商品到購物車 → 結帳 → 訂單建立成功
4. 點 header 的「分店：xxx」chip → modal 重開，列表一樣
5. 切換到另一個 branch → 再下一單 → 訂單成功

- [ ] **Step 10.3: 後端驗證**

執行 `<RUN_DEV_ADMIN debug_route_code {}>`，看 `sale_orders.sample` 最近兩筆：
- `customer_kind` 應該是 `"branch"`
- `region_tag_id` 應該非空

如果新單的 customer_kind 還是 hq，前端可能在 step 8/9 哪裡漏改 branch_id。

- [ ] **Step 10.4: 採購單 UI 手測**

開 admin app → 報表頁面 → 採購單列印。檢查每一個訂單列的客戶代號欄位：應該前綴是路線代號（如 region_tag.name）+ short_name 或 name。

對比修復前的 PDF（前次對話的「列印.pdf」），現在路線代號應該完整顯示。

- [ ] **Step 10.5: 無檔案變更，無需 commit**

---

## Task 11: 發布 production

**Files:** 無變更，純發布

- [ ] **Step 11.1: 發布 ordering**

```bash
set -a && source .env && set +a && python3 vfs/scripts/deploy_ordering.py 2>&1 | tail -10
```

預期：`發布: 200`、`✅ Ordering 部署完成`（或類似訊息）。

- [ ] **Step 11.2: 發布 admin**

```bash
python3 vfs/scripts/deploy_admin.py 2>&1 | tail -10
```

預期：`發布: 200`、`✅ Admin 部署完成`。

- [ ] **Step 11.3: production 抽查**

讓人類使用者在正式環境（非 use_dev=true）：
1. 登入 ordering，看 BranchPicker 出現
2. 下一筆單，看訂單建立成功
3. admin 採購單看路線代號顯示

- [ ] **Step 11.4: 收尾 commit（紀錄發布時間，無 diff 跳過）**

純發布通常無 diff，跳過。如果有任何小修，個別 commit。

---

## Out of Scope（不在這個 plan 內）

- 25 筆 (empty) kind ghost customer 自身的清理（後續手動）
- BranchPicker 搜尋框
- 切換分店時自動清空購物車
- 同 user 一次下單跨多 branch
- 拔除 `vfs/admin/actions/debug_route_code.py`（保留作為未來診斷工具）
- 拔除 ordering 端 `customers.[create]` 權限（雖然 ghost 邏輯砍了，但其他 action 可能還在用，先不動）

---

## 風險快照

- 真實 user 沒 redeem 過邀請 → 完全無法下單。修法前先用 admin debug action 確認所有現役 user 都有 rel：`<RUN_DEV_ADMIN debug_route_code {}>` 看 `email_match_check.users_with_email` 對比 `rel_table.users_total`。
- backfill 用 `seed=42` 結果可重現；不傳 seed 每次跑都不同。
- BranchPicker 第一次跳出對 user 是新體驗；如有客服反映可在 release notes 提示。
