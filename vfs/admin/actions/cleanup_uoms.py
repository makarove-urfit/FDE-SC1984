def execute(ctx):
    rows = ctx.db.query("uom_uom", limit=500) or []

    # 每個名稱只保留第一筆，其餘軟刪除
    seen = {}
    to_deactivate = []
    for r in rows:
        name = r.get("name", "")
        rid = str(r.get("id", ""))
        if name not in seen:
            seen[name] = rid
        else:
            to_deactivate.append(rid)

    results = []
    for rid in to_deactivate:
        try:
            ctx.db.update("uom_uom", rid, {"active": False})
            results.append({"id": rid, "ok": True})
        except Exception as e:
            results.append({"id": rid, "ok": False, "error": str(e)})

    ctx.response.json({
        "total": len(rows),
        "kept": len(seen),
        "deactivated": len(to_deactivate),
        "results": results,
    })
