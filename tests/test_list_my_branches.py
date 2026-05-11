"""本機單元測試 — 不部署到 AI GO（沙箱缺 __name__、NameError 等 builtins）。
執行：python3 tests/test_list_my_branches.py"""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "list_my_branches",
    Path(__file__).parent.parent / "vfs/ordering/actions/list_my_branches.py",
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

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

r = mod._filter_branches("u1", rels, customers)
assert len(r) == 2, f"u1 should see 2 branches (b1, b4_active_null), got {r}"
ids = {b["branch_id"] for b in r}
assert ids == {"b1", "b4_active_null"}, f"unexpected ids {ids}"
assert mod._filter_branches("u_unknown", rels, customers) == []
assert mod._filter_branches("u2", rels, customers)[0]["branch_id"] == "b2"

print("✅ list_my_branches._filter_branches tests pass")
