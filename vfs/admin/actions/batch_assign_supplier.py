# 批次依 product_template name 設定 custom_data.default_supplier_id
# params:
#   names: list[str]
#   supplier_id: str
#   mode: 'dry_run' | 'commit'  預設 dry_run
def execute(ctx):
    p = ctx.params or {}
    names = p.get("names") or []
    supplier_id = p.get("supplier_id")
    mode = p.get("mode", "dry_run")

    if not supplier_id or not names:
        ctx.response.json({"error": "需要 names[] 與 supplier_id"})
        return

    # 分頁拿全表（product_templates 已 3000+ 筆，limit 單值會截斷）
    rows = []
    offset = 0
    while True:
        batch = ctx.db.query("product_templates", limit=500, offset=offset) or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < 500:
            break
        offset += 500
        if offset > 20000:
            break

    by_name = {}
    for r in rows:
        d = dict(r) if not isinstance(r, dict) else r
        if d.get("active") is False:
            continue
        n = str(d.get("name") or "").strip()
        by_name.setdefault(n, []).append(d)

    matched = []
    not_found = []
    ambiguous = []
    for raw in names:
        n = raw.strip()
        cands = by_name.get(n, [])
        if not cands:
            not_found.append(raw)
        elif len(cands) > 1:
            ambiguous.append({"name": raw, "ids": [str(c.get("id")) for c in cands]})
        else:
            cd = cands[0].get("custom_data")
            cd_dict = dict(cd) if isinstance(cd, dict) else {}
            matched.append({
                "name": raw,
                "id": str(cands[0].get("id")),
                "current_supplier_id": str(cd_dict.get("default_supplier_id") or ""),
                "_cd": cd_dict,
            })

    if mode == "dry_run":
        ctx.response.json({
            "mode": "dry_run",
            "total_rows": len(rows),
            "would_update": len(matched),
            "not_found": not_found,
            "ambiguous": ambiguous,
            "overrides": [{"name": m["name"], "from": m["current_supplier_id"]} for m in matched if m["current_supplier_id"] and m["current_supplier_id"] != supplier_id],
            "matched_count": len(matched),
        })
        return

    if mode == "commit":
        results = []
        for m in matched:
            cd = dict(m["_cd"])
            cd["default_supplier_id"] = supplier_id
            try:
                ctx.db.update("product_templates", m["id"], {"custom_data": cd})
                results.append({"name": m["name"], "ok": True, "prev": m["current_supplier_id"]})
            except Exception as e:
                results.append({"name": m["name"], "ok": False, "error": str(e)})
        ctx.response.json({
            "mode": "commit",
            "fixed": sum(1 for r in results if r["ok"]),
            "failed": sum(1 for r in results if not r["ok"]),
            "not_found": not_found,
            "ambiguous": ambiguous,
            "results": results,
        })
        return

    ctx.response.json({"error": f"unknown mode: {mode}"})
