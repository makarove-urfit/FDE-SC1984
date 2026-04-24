def execute(ctx):
    token = (ctx.params.get("token") or "").strip()
    if not token:
        ctx.response.json({"error": "缺少 token"})
        return

    user_id = str(ctx.user.get("id") or ctx.user.get("custom_app_user_id") or "")
    if not user_id:
        ctx.response.json({"error": "未登入"})
        return

    # 找到 invite_token 對應的分店
    try:
        customers = ctx.db.query("customers", limit=2000) or []
    except Exception as e:
        ctx.response.json({"error": str(e)})
        return

    branch = None
    for c in customers:
        cd = c.get("custom_data") or {}
        if cd.get("kind") == "branch" and cd.get("invite_token") == token:
            if c.get("active") is not False:
                branch = c
                break

    if not branch:
        ctx.response.json({"error": "邀請連結無效或已過期"})
        return

    branch_id = str(branch["id"])
    cd = branch.get("custom_data") or {}
    hq_id = str(cd.get("parent_customer_id") or "")

    # 取得現有的 rel，避免重複建立
    try:
        existing_rels = ctx.db.query("customer_custom_app_user_rel", limit=5000) or []
    except Exception:
        existing_rels = []

    linked = {str(r.get("customer_id") or "") for r in existing_rels
              if str(r.get("custom_app_user_id") or "") == user_id}

    if branch_id not in linked:
        ctx.db.insert("customer_custom_app_user_rel", {
            "customer_id": branch_id,
            "custom_app_user_id": user_id,
        })

    if hq_id and hq_id not in linked:
        ctx.db.insert("customer_custom_app_user_rel", {
            "customer_id": hq_id,
            "custom_app_user_id": user_id,
        })

    ctx.response.json({
        "customer_id": branch_id,
        "headquarters_id": hq_id,
        "branch_name": str(branch.get("name") or ""),
    })
