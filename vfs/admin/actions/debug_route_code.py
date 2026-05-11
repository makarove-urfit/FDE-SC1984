"""
debug_route_code — 純讀 debug action
用途：驗證「採購單路線代號顯示不出來」的 root cause
回傳：customers / sale_orders / rel 表的統計與抽樣，與 email-match 驗證
"""
def execute(ctx):
    out = {}

    # ── 1. customers 結構分析 ──
    try:
        customers = ctx.db.query("customers", limit=3000) or []
    except Exception as e:
        ctx.response.json({"error": f"query customers failed: {e}"})
        return

    by_kind = {}
    has_email = {}
    has_region_tag = {}
    sample_hq = []
    sample_branch = []
    cust_by_id = {}
    email_to_cust = {}

    for c in customers:
        cid = str(c.get("id") or "")
        cd = c.get("custom_data") or {}
        kind = cd.get("kind") or "(empty)"
        email = (c.get("email") or "").strip().lower()
        region_tag_id = cd.get("region_tag_id") or ""
        active = c.get("active")

        cust_by_id[cid] = c
        by_kind[kind] = by_kind.get(kind, 0) + 1
        if email:
            has_email[kind] = has_email.get(kind, 0) + 1
            email_to_cust.setdefault(email, []).append({"id": cid, "kind": kind, "name": c.get("name")})
        if region_tag_id:
            has_region_tag[kind] = has_region_tag.get(kind, 0) + 1

        snap = {
            "id": cid,
            "name": c.get("name"),
            "short_name": c.get("short_name"),
            "email": c.get("email"),
            "active": active,
            "kind": kind,
            "region_tag_id": str(region_tag_id) if region_tag_id else "",
            "parent_customer_id": str(cd.get("parent_customer_id") or ""),
            "invite_token": "***" if cd.get("invite_token") else "",
        }
        if kind == "headquarters" and len(sample_hq) < 5:
            sample_hq.append(snap)
        elif kind == "branch" and len(sample_branch) < 5:
            sample_branch.append(snap)

    out["customers"] = {
        "total": len(customers),
        "by_kind": by_kind,
        "with_email_by_kind": has_email,
        "with_region_tag_by_kind": has_region_tag,
        "sample_hq": sample_hq,
        "sample_branch": sample_branch,
    }

    # ── 2. sale_orders 抽樣，join 對應 customer ──
    try:
        orders = ctx.db.query("sale_orders", limit=200) or []
    except Exception as e:
        out["sale_orders_error"] = str(e)
        orders = []

    so_with_cust = 0
    so_no_cust = 0
    so_by_kind = {}
    so_with_route = 0
    so_sample = []

    for o in orders:
        cid = str(o.get("customer_id") or "")
        if not cid:
            so_no_cust += 1
            continue
        so_with_cust += 1
        c = cust_by_id.get(cid)
        if c is None:
            so_by_kind["(unknown)"] = so_by_kind.get("(unknown)", 0) + 1
            continue
        cd = c.get("custom_data") or {}
        kind = cd.get("kind") or "(empty)"
        so_by_kind[kind] = so_by_kind.get(kind, 0) + 1
        rt = cd.get("region_tag_id") or ""
        if rt:
            so_with_route += 1
        if len(so_sample) < 8:
            so_sample.append({
                "order_id": str(o.get("id") or ""),
                "date_order": o.get("date_order"),
                "customer_id": cid,
                "customer_name": c.get("name"),
                "customer_kind": kind,
                "customer_email": c.get("email"),
                "region_tag_id": str(rt) if rt else "",
                "parent_customer_id": str(cd.get("parent_customer_id") or ""),
            })

    out["sale_orders"] = {
        "total": len(orders),
        "with_customer_id": so_with_cust,
        "without_customer_id": so_no_cust,
        "by_customer_kind": so_by_kind,
        "with_region_tag_via_customer": so_with_route,
        "sample": so_sample,
    }

    # ── 3. customer_custom_app_user_rel 表 ──
    try:
        rels = ctx.db.query("customer_custom_app_user_rel", limit=2000) or []
    except Exception as e:
        try:
            rels = ctx.db.query_object("customer_custom_app_user_rel", limit=2000) or []
        except Exception as e2:
            out["rel_error"] = f"query: {e}; query_object: {e2}"
            rels = []

    rel_by_kind = {}
    user_to_cust_kinds = {}
    rel_sample = []

    for r in rels:
        cid = str(r.get("customer_id") or "")
        uid = str(r.get("custom_app_user_id") or "")
        c = cust_by_id.get(cid)
        kind = ((c or {}).get("custom_data") or {}).get("kind") if c else "(unknown)"
        kind = kind or "(empty)"
        rel_by_kind[kind] = rel_by_kind.get(kind, 0) + 1
        if uid:
            user_to_cust_kinds.setdefault(uid, set()).add(kind)
        if len(rel_sample) < 10:
            rel_sample.append({
                "rel_id": str(r.get("id") or ""),
                "customer_id": cid,
                "user_id": uid,
                "customer_kind": kind,
                "customer_name": (c or {}).get("name"),
            })

    users_branch_only = 0
    users_hq_only = 0
    users_both = 0
    users_other = 0
    for uid, kinds in user_to_cust_kinds.items():
        has_hq = ("headquarters" in kinds) or ("independent" in kinds)
        has_br = "branch" in kinds
        if has_hq and has_br:
            users_both += 1
        elif has_br:
            users_branch_only += 1
        elif has_hq:
            users_hq_only += 1
        else:
            users_other += 1

    out["rel_table"] = {
        "total": len(rels),
        "by_customer_kind": rel_by_kind,
        "users_total": len(user_to_cust_kinds),
        "users_with_branch_only": users_branch_only,
        "users_with_hq_only": users_hq_only,
        "users_with_both": users_both,
        "users_other": users_other,
        "sample": rel_sample,
    }

    # ── 4. custom_app_users：驗證 email match ──
    users = []
    user_query_error = None
    for tbl in ("custom_app_users", "custom_app_user"):
        try:
            users = ctx.db.query(tbl, limit=2000) or []
            break
        except Exception as e:
            user_query_error = f"{tbl}: {e}"
            try:
                users = ctx.db.query_object(tbl, limit=2000) or []
                break
            except Exception as e2:
                user_query_error = f"{tbl} query: {e}; query_object: {e2}"

    if not users:
        out["users_error"] = user_query_error or "no users found"
    else:
        match_any = 0
        match_hq = 0
        match_branch = 0
        no_match = 0
        no_email_user = 0
        sample_match = []
        sample_no_match = []
        for u in users:
            uemail = (u.get("email") or "").strip().lower()
            uid = str(u.get("id") or "")
            if not uemail:
                no_email_user += 1
                continue
            matched = email_to_cust.get(uemail) or []
            if matched:
                match_any += 1
                kinds = {m["kind"] for m in matched}
                if "branch" in kinds:
                    match_branch += 1
                if ("headquarters" in kinds) or ("independent" in kinds):
                    match_hq += 1
                if len(sample_match) < 5:
                    sample_match.append({"user_id": uid, "user_email": uemail, "matched": matched})
            else:
                no_match += 1
                if len(sample_no_match) < 5:
                    sample_no_match.append({"user_id": uid, "user_email": uemail})
        out["email_match_check"] = {
            "total_users": len(users),
            "users_with_email": len(users) - no_email_user,
            "users_no_email": no_email_user,
            "match_any_customer": match_any,
            "match_branch_customer": match_branch,
            "match_hq_or_independent_customer": match_hq,
            "no_match": no_match,
            "sample_match": sample_match,
            "sample_no_match": sample_no_match,
        }

    ctx.response.json(out)
