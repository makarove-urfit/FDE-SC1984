"""backfill_sale_orders_branch — dev 期一次性，把指 hq 的 sale_orders 隨機改寫成 branch。
spec: docs/superpowers/specs/2026-05-09-route-code-fix-design.md §7

注意：AI GO 平台沙箱禁止 import random，因此用自製 _pick (deterministic hash) 取代 random.choice。
單元測試在 tests/test_backfill_sale_orders_branch.py，不可放在這支檔案（沙箱無 __name__、NameError 等 builtins）。"""


def _kind(c):
    return ((c or {}).get("custom_data") or {}).get("kind") or ""


def _pick(pool, key, salt):
    """從 pool 裡用 deterministic hash 挑一個元素，取代 random.choice。
    same (pool, key, salt) → same result，可重現的 pseudo-random。"""
    if not pool:
        raise ValueError("pool is empty")
    h = salt & 0xffffffff
    for ch in str(key):
        h = (h * 31 + ord(ch)) & 0xffffffff
    return pool[h % len(pool)]


def _assign_branches(orders, customers, fallback_strategy, salt):
    """純函式：對每筆 sale_order 決定要 rewrite 成哪個 branch_id。
    回傳 (changes, stats)。dry_run 與 actual update 都用這個結果。
    salt 控制分配差異（同 salt → 同結果，等同 RNG seed 的角色）。"""
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
            new_b = _pick(pool, oid, salt)
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
        new_b = _pick(all_active_branches, oid, salt)
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
    salt = int((ctx.params or {}).get("seed", 42))   # 預設 42 確保 dry_run 與 actual 結果一致

    ORDER_LIMIT = 5000
    CUSTOMER_LIMIT = 5000
    try:
        orders = ctx.db.query("sale_orders", limit=ORDER_LIMIT) or []
        customers = ctx.db.query("customers", limit=CUSTOMER_LIMIT) or []
    except Exception as e:
        ctx.response.json({"error": str(e), "code": "SERVER_ERROR"})
        return

    truncated = []
    if len(orders) >= ORDER_LIMIT:
        truncated.append(f"sale_orders={len(orders)} hit limit, may be incomplete")
    if len(customers) >= CUSTOMER_LIMIT:
        truncated.append(f"customers={len(customers)} hit limit, may be incomplete")

    changes, stats = _assign_branches(orders, customers, fallback_strategy, salt)
    if "error" in stats:
        ctx.response.json({**stats, "truncated_warning": truncated})
        return

    actually_updated = 0
    update_errors = 0
    failed_samples = []
    if not dry_run:
        for ch in changes:
            try:
                ctx.db.update("sale_orders", ch["order_id"], {"customer_id": ch["to_branch_id"]})
                actually_updated += 1
            except Exception as e:
                ch["error"] = str(e)
                update_errors += 1
                if len(failed_samples) < 5:
                    failed_samples.append(ch)

    ctx.response.json({
        "dry_run": dry_run,
        "fallback_strategy": fallback_strategy,
        **stats,
        "actually_updated": actually_updated,
        "update_errors": update_errors,
        "failed_samples": failed_samples,
        "truncated_warning": truncated,
        "sample_changes": changes[:10],
        "total_changes": len(changes),
    })
