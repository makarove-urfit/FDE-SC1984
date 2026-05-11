"""本機單元測試 — 不部署到 AI GO（沙箱缺 __name__、NameError 等 builtins）。
執行：python3 tests/test_place_order_auth.py"""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "place_order",
    Path(__file__).parent.parent / "vfs/ordering/actions/place_order.py",
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

rels = [
    {"customer_id": "b1", "custom_app_user_id": "u1"},
    {"customer_id": "h1", "custom_app_user_id": "u1"},
]
assert mod._is_authorized("u1", "b1", rels), "u1 應該能下 b1"
assert mod._is_authorized("u1", "h1", rels), "u1 也綁 hq（雖然不該被選）"
assert not mod._is_authorized("u2", "b1", rels), "u2 不該能下 b1"
assert not mod._is_authorized("u1", "b_unknown", rels), "u1 沒綁的 branch 要擋"
assert not mod._is_authorized("", "b1", rels), "空 uid 一律擋"

print("✅ place_order._is_authorized tests pass")
