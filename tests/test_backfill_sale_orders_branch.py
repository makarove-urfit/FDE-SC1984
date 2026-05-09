"""本機單元測試 — 不部署到 AI GO（沙箱缺 __name__、NameError 等 builtins）。
執行：python3 tests/test_backfill_sale_orders_branch.py"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "vfs", "admin", "actions"))

from backfill_sale_orders_branch import _kind, _pick, _assign_branches

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
changes, stats = _assign_branches(orders, customers, "any_branch", salt=42)
assert stats["skipped_already_branch"] == 1, stats
assert stats["rewrote_hq_to_branch"] == 2, stats
assert stats["rewrote_ghost_to_random_branch"] == 1, stats
assert stats["no_branch_available"] == 0, stats
assert len(changes) == 3
by_oid = {c["order_id"]: c for c in changes}
assert by_oid["o1"]["to_branch_id"] == "b1", "h1 only has b1 underneath"
assert by_oid["o2"]["to_branch_id"] == "b2", "h2 only has b2 underneath"
assert by_oid["o4"]["to_branch_id"] in ("b1", "b2"), "ghost should pick from all_active_branches"

# skip fallback
_, stats2 = _assign_branches(orders, customers, "skip", salt=42)
assert stats2["skipped_ghost"] == 1
assert stats2["rewrote_ghost_to_random_branch"] == 0

# no branch at all → error
_, stats3 = _assign_branches(orders, [c for c in customers if _kind(c) != "branch"], "any_branch", salt=42)
assert "error" in stats3

# _pick 必須 deterministic
pool = [{"id": "b1"}, {"id": "b2"}, {"id": "b3"}]
assert _pick(pool, "o1", 42) is _pick(pool, "o1", 42), "_pick must be deterministic"

print("✅ backfill_sale_orders_branch._assign_branches tests pass")
