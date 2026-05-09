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
