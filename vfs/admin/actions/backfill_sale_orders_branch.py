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
