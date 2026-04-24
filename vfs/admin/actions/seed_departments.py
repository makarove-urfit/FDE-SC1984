def execute(ctx):
    names = ["業務", "採購", "配送"]
    try:
        existing = ctx.db.query("hr_departments", limit=200) or []
    except Exception:
        existing = []

    existing_names = {str(d.get("name", "")) for d in existing}
    created = []
    skipped = []

    for name in names:
        if name in existing_names:
            skipped.append(name)
            continue
        try:
            ctx.db.insert("hr_departments", {"name": name})
            created.append(name)
        except Exception as e:
            ctx.response.json({"error": f"建立 {name} 失敗：{e}"}); return

    ctx.response.json({"created": created, "skipped": skipped})
