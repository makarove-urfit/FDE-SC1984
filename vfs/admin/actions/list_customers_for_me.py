def execute(ctx):
    try:
        customers = ctx.db.query("customers", limit=2000) or []
    except Exception as e:
        ctx.response.json({"customers": [], "branches": [], "error": str(e)})
        return

    hq_list = []
    branch_list = []

    for c in customers:
        if c.get("active") is False:
            continue
        cd = c.get("custom_data") or {}
        kind = cd.get("kind", "headquarters")

        base = {
            "id": str(c.get("id", "")),
            "name": str(c.get("name") or ""),
            "vat": str(c.get("vat") or ""),
            "email": str(c.get("email") or ""),
            "phone": str(c.get("phone") or ""),
            "payment_term": str(c.get("payment_term") or ""),
            "salesperson_id": str(c.get("salesperson_id") or ""),
            "kind": kind,
            "custom_data": cd,
        }

        if kind in ("headquarters", "independent"):
            hq_list.append(base)
        elif kind == "branch":
            branch_list.append({
                "id": str(c.get("id", "")),
                "name": str(c.get("name") or ""),
                "contact_address": str(c.get("contact_address") or ""),
                "phone": str(c.get("phone") or ""),
                "parent_customer_id": str(cd.get("parent_customer_id") or ""),
                "invite_token": str(cd.get("invite_token") or ""),
                "kind": kind,
            })

    ctx.response.json({"customers": hq_list, "branches": branch_list})
