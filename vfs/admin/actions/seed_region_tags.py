def execute(ctx):
    regions = ["東區", "南區", "西區", "北區"]

    try:
        existing = ctx.db.query("customer_tags", limit=200) or []
    except Exception as e:
        ctx.response.json({"error": str(e)})
        return

    existing_names = {str(t.get("name") or "") for t in existing
                      if (t.get("custom_data") or {}).get("category") == "region"}

    created = []
    skipped = []
    for name in regions:
        if name in existing_names:
            skipped.append(name)
            continue
        try:
            t = ctx.db.insert("customer_tags", {
                "name": name,
                "custom_data": {"category": "region", "single_select": True},
            })
            if t and t.get("id"):
                created.append(name)
        except Exception as e:
            ctx.response.json({"error": f"建立 {name} 失敗：{e}"})
            return

    ctx.response.json({"created": created, "skipped": skipped})
