"""TDD: crud_delete action 必須支援 customers / customer_tags 兩張標準表。

背景：proxy DELETE 對這兩表回 403，唯一可靠刪除路徑是 server-side action
的 ctx.db.remove；但 crud_delete 的 ALLOWED_TABLES 白名單漏了這兩表，
導致 test_customer_code.py 的 cleanup 長期靜默失敗、累積垃圾路線。

臨時資料刻意命名 Z-test-* 並把 customer 掛在該 tag 下，
即使本測試 RED（crud_delete 拒絕）也會被 cleanup_test_routes.py 掃掉。

Run: set -a && source .env && set +a && python3 vfs/scripts/test_crud_delete_customers.py
"""
import uuid
from test_lib import api_login, post, qquery, run_action, ADMIN_APP


def main():
    h = api_login()
    print("✅ login ok")

    s, tag = post(h, ADMIN_APP, "customer_tags", {
        "name": f"Z-test-cruddel-{uuid.uuid4().hex[:6]}",
        "custom_data": {"category": "region", "route_letter": "Z", "next_seq": 9990},
    })
    assert s in (200, 201), f"create tag failed: {s} {tag}"
    tag_id = str((tag or {}).get("id") or (tag or {}).get("data", {}).get("id"))

    s, cust = post(h, ADMIN_APP, "customers", {
        "name": f"測試分店-cruddel-{uuid.uuid4().hex[:6]}",
        "is_company": False, "customer_type": "individual",
        "custom_data": {"kind": "branch", "region_tag_id": tag_id},
    })
    assert s in (200, 201), f"create customer failed: {s} {cust}"
    cust_id = str((cust or {}).get("id") or (cust or {}).get("data", {}).get("id"))
    print(f"created tag={tag_id} customer={cust_id}")

    # ── crud_delete 必須能刪 customers ──
    s, r = run_action(h, ADMIN_APP, "crud_delete", {"table": "customers", "id": cust_id})
    body = (r or {}).get("result") or r
    print(f"crud_delete customers → {body}")
    assert s == 200 and body.get("deleted") == 1, f"customer delete failed: {body}"
    rows = qquery(h, ADMIN_APP, "customers", [{"column": "id", "op": "eq", "value": cust_id}])
    assert not rows, f"customer still exists after delete: {rows}"
    print("✅ crud_delete 成功刪除 customers")

    # ── crud_delete 必須能刪 customer_tags ──
    s, r = run_action(h, ADMIN_APP, "crud_delete", {"table": "customer_tags", "id": tag_id})
    body = (r or {}).get("result") or r
    print(f"crud_delete customer_tags → {body}")
    assert s == 200 and body.get("deleted") == 1, f"tag delete failed: {body}"
    rows = qquery(h, ADMIN_APP, "customer_tags", [{"column": "id", "op": "eq", "value": tag_id}])
    assert not rows, f"tag still exists after delete: {rows}"
    print("✅ crud_delete 成功刪除 customer_tags")

    print("\n✅ ALL PASS — crud_delete 支援 customers + customer_tags")


if __name__ == "__main__":
    main()
