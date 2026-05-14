"""End-to-end test for customer code / route / VIP actions.
Run: set -a && source .env && set +a && python3 vfs/scripts/test_customer_code.py
"""
import sys, json, uuid
from test_lib import api_login, post, patch, query, qquery, run_action, ADMIN_APP


def main():
    h = api_login()
    print("✅ login ok")

    # ── 前置：建一個測試用路線 tag（單字母 Z，避免撞線上資料）──
    s, tag = post(h, ADMIN_APP, "customer_tags", {
        "name": f"Z-test-{uuid.uuid4().hex[:6]}",
        "custom_data": {"category": "region", "route_letter": "Z", "next_seq": 1},
    })
    assert s in (200, 201), f"create tag failed: {s} {tag}"
    tag_id = str((tag or {}).get("id") or (tag or {}).get("data", {}).get("id"))
    print(f"✅ test tag created: {tag_id}")

    # ── 建一筆 branch customer（無 code）──
    s, cust = post(h, ADMIN_APP, "customers", {
        "name": f"測試分店-{uuid.uuid4().hex[:6]}",
        "is_company": False,
        "customer_type": "individual",
        "custom_data": {"kind": "branch", "region_tag_id": tag_id},
    })
    assert s in (200, 201), f"create customer failed: {s} {cust}"
    cid = str((cust or {}).get("id") or (cust or {}).get("data", {}).get("id"))
    print(f"✅ test branch created: {cid}")

    # ── Test 1: assign_customer_code ──
    s, r = run_action(h, ADMIN_APP, "assign_customer_code", {
        "customer_id": cid, "route_tag_id": tag_id,
    })
    assert s == 200, f"assign HTTP {s} {r}"
    body = (r or {}).get("result") or r
    assert body.get("success") is True, f"assign body: {body}"
    assert body.get("code") == "Z01", f"expected Z01 got {body.get('code')}"
    print(f"✅ assign_customer_code → {body.get('code')}")

    # ── 驗證 customer.ref 與 code_history ──
    rows = qquery(h, ADMIN_APP, "customers", [{"column": "id", "op": "eq", "value": cid}])
    assert rows, "customer not found after assign"
    c = rows[0]
    assert c.get("ref") == "Z01", f"ref expected Z01 got {c.get('ref')}"
    hist = (c.get("custom_data") or {}).get("code_history") or []
    assert len(hist) == 1 and hist[0]["code"] == "Z01" and hist[0]["until"] is None
    print("✅ ref + code_history correct")

    # ── 驗證 tag.next_seq 已 +1 ──
    rows = qquery(h, ADMIN_APP, "customer_tags", [{"column": "id", "op": "eq", "value": tag_id}])
    assert rows and (rows[0].get("custom_data") or {}).get("next_seq") == 2
    print("✅ next_seq incremented to 2")

    print("🎉 Task 2 tests passed")


if __name__ == "__main__":
    main()
