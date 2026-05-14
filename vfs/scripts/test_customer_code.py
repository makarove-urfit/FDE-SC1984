"""End-to-end test for customer code / route / VIP actions.
Run: set -a && source .env && set +a && python3 vfs/scripts/test_customer_code.py
"""
import sys, json, uuid
from test_lib import api_login, post, patch, query, qquery, run_action, ADMIN_APP, _req, API_BASE


def main():
    h = api_login()
    print("✅ login ok")

    # Track created resources for cleanup
    created_tags = []
    created_customers = []
    created_holidays = []

    try:
        # ── 前置：建一個測試用路線 tag（單字母 Z，避免撞線上資料）──
        # next_seq 從 9900 起，避免與線上或其他測試殘留的低序號衝突
        s, tag = post(h, ADMIN_APP, "customer_tags", {
            "name": f"Z-test-{uuid.uuid4().hex[:6]}",
            "custom_data": {"category": "region", "route_letter": "Z", "next_seq": 9900},
        })
        assert s in (200, 201), f"create tag failed: {s} {tag}"
        tag_id = str((tag or {}).get("id") or (tag or {}).get("data", {}).get("id"))
        created_tags.append(tag_id)
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
        created_customers.append(cid)
        print(f"✅ test branch created: {cid}")

        # ── Test 1: assign_customer_code ──
        # 讀取 tag 目前的 next_seq，以便後續驗證遞增（DB 可能已有舊資料）
        tag_rows = qquery(h, ADMIN_APP, "customer_tags", [{"column": "id", "op": "eq", "value": tag_id}])
        initial_seq = int(((tag_rows[0].get("custom_data") or {}) if tag_rows else {}).get("next_seq") or 1)

        s, r = run_action(h, ADMIN_APP, "assign_customer_code", {
            "customer_id": cid, "route_tag_id": tag_id,
        })
        assert s == 200, f"assign HTTP {s} {r}"
        body = (r or {}).get("result") or r
        assert body.get("success") is True, f"assign body: {body}"
        assigned_code = body.get("code")
        assert assigned_code and assigned_code.startswith("Z"), f"expected Z-prefixed code got {assigned_code}"
        print(f"✅ assign_customer_code → {assigned_code}")

        # ── 驗證 customer.ref 與 code_history ──
        rows = qquery(h, ADMIN_APP, "customers", [{"column": "id", "op": "eq", "value": cid}])
        assert rows, "customer not found after assign"
        c = rows[0]
        assert c.get("ref") == assigned_code, f"ref expected {assigned_code} got {c.get('ref')}"
        hist = (c.get("custom_data") or {}).get("code_history") or []
        assert len(hist) == 1 and hist[0]["code"] == assigned_code and hist[0]["until"] is None
        print("✅ ref + code_history correct")

        # ── 驗證 tag.next_seq 已 +1（相對於 assign 前的值）──
        rows = qquery(h, ADMIN_APP, "customer_tags", [{"column": "id", "op": "eq", "value": tag_id}])
        post_seq = int(((rows[0].get("custom_data") or {}) if rows else {}).get("next_seq") or 0)
        assert rows and post_seq > initial_seq, f"next_seq should have incremented from {initial_seq}, got {post_seq}"
        print(f"✅ next_seq incremented from {initial_seq} to {post_seq}")

        # ── 前置：再建一個目標路線 tag（Y）──
        s, tag2 = post(h, ADMIN_APP, "customer_tags", {
            "name": f"Y-test-{uuid.uuid4().hex[:6]}",
            "custom_data": {"category": "region", "route_letter": "Y", "next_seq": 50},
        })
        assert s in (200, 201), f"create tag2 failed: {s} {tag2}"
        tag2_id = str((tag2 or {}).get("id") or (tag2 or {}).get("data", {}).get("id"))
        created_tags.append(tag2_id)
        print(f"✅ second test tag created: {tag2_id}")

        # ── Test 2: reassign_customer_route ──
        s, r = run_action(h, ADMIN_APP, "reassign_customer_route", {
            "customer_id": cid, "new_route_tag_id": tag2_id,
        })
        assert s == 200, f"reassign HTTP {s} {r}"
        body = (r or {}).get("result") or r
        assert body.get("success") is True
        assert body.get("old_code") == assigned_code, f"old_code expected {assigned_code} got {body.get('old_code')}"
        assert body.get("new_code") == "Y50", f"new_code expected Y50 got {body.get('new_code')}"
        print(f"✅ reassign_customer_route {assigned_code} → Y50")

        # ── 驗證 history 兩筆、舊筆 until 已封 ──
        rows = qquery(h, ADMIN_APP, "customers", [{"column": "id", "op": "eq", "value": cid}])
        c = rows[0]
        assert c.get("ref") == "Y50", f"ref expected Y50 got {c.get('ref')}"
        hist = (c.get("custom_data") or {}).get("code_history") or []
        assert len(hist) == 2, f"history len expected 2 got {len(hist)}"
        assert hist[0]["code"] == assigned_code and hist[0]["until"] is not None, f"hist[0]: {hist[0]}"
        assert hist[1]["code"] == "Y50" and hist[1]["until"] is None, f"hist[1]: {hist[1]}"
        print(f"✅ code_history 封存 {assigned_code}、新增 Y50")

        # ── 驗證舊路線 next_seq 不回退、新路線 +1 ──
        rows = qquery(h, ADMIN_APP, "customer_tags", [{"column": "id", "op": "in", "value": [tag_id, tag2_id]}])
        by_id = {str(r["id"]): r for r in rows}
        old_tag_seq = int((by_id[tag_id].get("custom_data") or {}).get("next_seq") or 0)
        new_tag_seq = int((by_id[tag2_id].get("custom_data") or {}).get("next_seq") or 0)
        assert old_tag_seq == post_seq, f"舊路線 next_seq 不應回退（仍應為 {post_seq}），實際 {old_tag_seq}"
        assert new_tag_seq == 51, f"新路線 next_seq 應為 51 got {new_tag_seq}"
        print(f"✅ 舊路線 next_seq={old_tag_seq} 不回退、新路線 next_seq={new_tag_seq}")

        print("🎉 Task 2 tests passed")

    finally:
        for h_id in created_holidays:
            try:
                _req("DELETE", f"{API_BASE}/proxy/{ADMIN_APP}/x_holiday_settings/{h_id}", h)
            except Exception as e:
                print(f"⚠️ holiday {h_id} cleanup: {e}")
        for c_id in created_customers:
            try:
                _req("DELETE", f"{API_BASE}/proxy/{ADMIN_APP}/customers/{c_id}", h)
            except Exception as e:
                print(f"⚠️ customer {c_id} cleanup: {e}")
        for t_id in created_tags:
            try:
                _req("DELETE", f"{API_BASE}/proxy/{ADMIN_APP}/customer_tags/{t_id}", h)
            except Exception as e:
                print(f"⚠️ tag {t_id} cleanup: {e}")
        print("🧹 cleanup attempted")


if __name__ == "__main__":
    main()
