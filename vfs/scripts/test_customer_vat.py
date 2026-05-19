"""End-to-end test for create_customer_bundle + update_customer 統編防呆。
Run: set -a && source .env && set +a && python3 vfs/scripts/test_customer_vat.py
"""
from test_lib import api_login, qquery, run_action, ADMIN_APP


def _vat_ok(v):
    """與 action 端 _validate_vat_format 等價的本地檢查（測試自用）。"""
    if len(v) != 8 or not v.isdigit():
        return False
    w = [1, 2, 1, 2, 1, 2, 4, 1]
    t = sum((int(v[i]) * w[i]) // 10 + (int(v[i]) * w[i]) % 10 for i in range(8))
    return t % 5 == 0 or (v[6] == "7" and (t + 1) % 5 == 0)


def _gen_valid_vats(n, used):
    """產生 n 個合法且未被使用的統編，從高位數往下找以避開線上資料。"""
    out, cand = [], 99999999
    while len(out) < n and cand > 90000000:
        s = str(cand)
        if _vat_ok(s) and s not in used:
            out.append(s)
        cand -= 1
    assert len(out) == n, "無法產生足夠的測試統編"
    return out


def _body(r):
    return (r or {}).get("result") or r or {}


def main():
    h = api_login()
    print("✅ login ok")

    # 蒐集現有統編，避開衝突
    existing = qquery(h, ADMIN_APP, "customers", [])
    used = {(c.get("vat") or "").strip() for c in existing if (c.get("vat") or "").strip()}
    v1, v2, v3 = _gen_valid_vats(3, used)
    print(f"✅ 測試統編：{v1} {v2} {v3}")

    created = []
    try:
        # ── Test 1: 合法統編新增客戶（總公司 + 分店）──
        s, r = run_action(h, ADMIN_APP, "create_customer_bundle", {
            "headquarters_name": f"統編測試公司-{v1}",
            "vat": v1,
            "branches": [{"branch_name": f"統編測試分店-{v2}", "vat": v2}],
        })
        b = _body(r)
        assert s == 200 and b.get("success") is True, f"建檔應成功：{s} {b}"
        hq_id = str(b["headquarters_id"])
        branch_id = str(b["branches"][0]["branch_id"])
        created += [hq_id, branch_id]
        print(f"✅ 合法統編建檔成功 hq={hq_id} branch={branch_id}")

        # 驗證分店 vat 寫入自己那列
        rows = qquery(h, ADMIN_APP, "customers", [{"column": "id", "op": "eq", "value": branch_id}])
        assert rows and (rows[0].get("vat") or "").strip() == v2, f"分店 vat 應為 {v2}：{rows}"
        print("✅ 分店統編寫入分店自己那列")

        # ── Test 2: 重複統編硬擋（用 v1 再建）──
        s, r = run_action(h, ADMIN_APP, "create_customer_bundle", {
            "headquarters_name": "重複統編公司",
            "vat": v1,
            "branches": [{"branch_name": "重複統編分店", "vat": v3}],
        })
        b = _body(r)
        assert "error" in b and "已被" in b["error"], f"重複統編應被擋：{b}"
        print(f"✅ 重複統編被硬擋：{b['error']}")

        # ── Test 3: 非法檢查碼被擋 ──
        s, r = run_action(h, ADMIN_APP, "create_customer_bundle", {
            "headquarters_name": "非法統編公司",
            "vat": "12345678",
            "branches": [{"branch_name": "x", "vat": v3}],
        })
        b = _body(r)
        assert "error" in b and "統一編號" in b["error"], f"非法檢查碼應被擋：{b}"
        print("✅ 非法檢查碼被擋")

        # ── Test 4: 分店空統編被擋（必填）──
        s, r = run_action(h, ADMIN_APP, "create_customer_bundle", {
            "headquarters_name": "缺統編公司",
            "vat": v3,
            "branches": [{"branch_name": "缺統編分店", "vat": ""}],
        })
        b = _body(r)
        assert "error" in b and "必填" in b["error"], f"分店空統編應被擋：{b}"
        print("✅ 分店空統編被擋")

        # ── Test 5: 同次新增多分店統編互撞被擋 ──
        s, r = run_action(h, ADMIN_APP, "create_customer_bundle", {
            "headquarters_name": "互撞公司",
            "vat": v3,
            "branches": [
                {"branch_name": "互撞分店A", "vat": v3},
                {"branch_name": "互撞分店B", "vat": v3},
            ],
        })
        b = _body(r)
        assert "error" in b, f"本批互撞應被擋：{b}"
        print("✅ 同批統編互撞被擋")

        # ── Test 6: update_customer 改統編成重複 → 擋 ──
        s, r = run_action(h, ADMIN_APP, "update_customer", {
            "customer_id": branch_id,
            "fields": {"vat": v1},  # v1 已被總公司用
        })
        b = _body(r)
        assert "error" in b and "已被" in b["error"], f"編輯改成重複統編應被擋：{b}"
        print("✅ 編輯改成重複統編被擋")

        # ── Test 7: update_customer 改成合法新統編 → 成功 ──
        s, r = run_action(h, ADMIN_APP, "update_customer", {
            "customer_id": branch_id,
            "fields": {"vat": v3},
        })
        b = _body(r)
        assert s == 200 and b.get("success") is True, f"編輯改合法新統編應成功：{b}"
        rows = qquery(h, ADMIN_APP, "customers", [{"column": "id", "op": "eq", "value": branch_id}])
        assert (rows[0].get("vat") or "").strip() == v3, f"vat 應更新為 {v3}：{rows}"
        print("✅ 編輯改合法新統編成功")

        # ── Test 8: 對既有總公司加分店（headquarters_id 模式）──
        s, r = run_action(h, ADMIN_APP, "create_customer_bundle", {
            "headquarters_id": hq_id,
            "branches": [{"branch_name": f"加掛分店-{v2}", "vat": v2}],
        })
        b = _body(r)
        assert s == 200 and b.get("success") is True, f"加掛分店應成功：{b}"
        created.append(str(b["branches"][0]["branch_id"]))
        print("✅ 對既有總公司加分店成功")

        print("🎉 test_customer_vat 全數通過")

    finally:
        if created:
            try:
                s, r = run_action(h, ADMIN_APP, "crud_delete", {"table": "customers", "ids": created})
                print(f"🧹 cleanup customers: {_body(r)}")
            except Exception as e:
                print(f"⚠️ cleanup: {e}")


if __name__ == "__main__":
    main()
