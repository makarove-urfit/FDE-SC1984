"""list_my_branches — 回傳目前 user 綁定且 kind=branch 的客戶清單。
單元測試在 tests/test_list_my_branches.py，不可放在這支檔案（沙箱無 __name__、NameError 等 builtins）。"""

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

