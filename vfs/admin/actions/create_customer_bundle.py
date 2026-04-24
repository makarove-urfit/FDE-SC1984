def execute(ctx):
    import uuid
    p = ctx.params

    headquarters_name = (p.get("headquarters_name") or "").strip()
    branch_name = (p.get("branch_name") or "").strip()

    if not headquarters_name:
        ctx.response.json({"error": "公司名稱為必填"})
        return
    if not branch_name:
        ctx.response.json({"error": "店名為必填"})
        return

    vat = (p.get("vat") or "").strip()
    owner_name = (p.get("owner_name") or "").strip()
    contact_address = (p.get("contact_address") or "").strip()
    branch_phone = (p.get("phone") or "").strip()
    contact_name = (p.get("contact_name") or "").strip()
    contact_phone = (p.get("contact_phone") or "").strip()
    email = (p.get("email") or "").strip()
    payment_term = (p.get("payment_term") or "").strip()
    salesperson_id = (p.get("salesperson_id") or "")
    invoice_format = (p.get("invoice_format") or "").strip()
    region_tag_id = (p.get("region_tag_id") or "")

    # Step 1: 建公司（headquarters）
    hq_data = {
        "name": headquarters_name,
        "customer_type": "company",
        "is_company": True,
        "custom_data": {
            "kind": "headquarters",
            "invoice_format": invoice_format,
        },
    }
    if vat:
        hq_data["vat"] = vat
    if email:
        hq_data["email"] = email
    if payment_term:
        hq_data["payment_term"] = payment_term
    if salesperson_id:
        hq_data["salesperson_id"] = salesperson_id

    hq = ctx.db.insert("customers", hq_data)
    if not hq or not hq.get("id"):
        ctx.response.json({"error": "建立公司記錄失敗"})
        return
    hq_id = str(hq["id"])

    # Step 2: 建分店（branch）並生成 invite_token
    invite_token = str(uuid.uuid4())
    branch_data = {
        "name": branch_name,
        "customer_type": "individual",
        "is_company": False,
        "custom_data": {
            "kind": "branch",
            "parent_customer_id": hq_id,
            "invite_token": invite_token,
        },
    }
    if contact_address:
        branch_data["contact_address"] = contact_address
    if branch_phone:
        branch_data["phone"] = branch_phone

    branch = ctx.db.insert("customers", branch_data)
    if not branch or not branch.get("id"):
        ctx.response.json({"error": "建立分店記錄失敗"})
        return
    branch_id = str(branch["id"])

    # Step 3: 建店內聯絡人（kind=role, role=contact，掛分店下）
    contact_id = None
    if contact_name:
        contact_data = {
            "name": contact_name,
            "customer_type": "individual",
            "is_company": False,
            "custom_data": {
                "kind": "role",
                "role": "contact",
                "parent_customer_id": branch_id,
            },
        }
        if contact_phone:
            contact_data["phone"] = contact_phone
        c = ctx.db.insert("customers", contact_data)
        if c and c.get("id"):
            contact_id = str(c["id"])

    # Step 4: 建公司負責人（kind=role, role=owner，掛公司下）
    owner_id = None
    if owner_name:
        owner_data = {
            "name": owner_name,
            "customer_type": "individual",
            "is_company": False,
            "custom_data": {
                "kind": "role",
                "role": "owner",
                "parent_customer_id": hq_id,
            },
        }
        o = ctx.db.insert("customers", owner_data)
        if o and o.get("id"):
            owner_id = str(o["id"])

    # Step 5: 打路線 tag（分店 ↔ region tag）
    if region_tag_id and branch_id:
        try:
            ctx.db.insert("customer_tag_rel", {
                "customer_id": branch_id,
                "tag_id": region_tag_id,
            })
        except Exception:
            pass  # tag rel 失敗不阻斷主流程

    ctx.response.json({
        "headquarters_id": hq_id,
        "branch_id": branch_id,
        "contact_id": contact_id,
        "owner_id": owner_id,
        "invite_token": invite_token,
    })
