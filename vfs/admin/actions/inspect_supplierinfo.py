def execute(ctx):
    p = ctx.params or {}
    mode = p.get("mode", "summary")

    if mode == "try_insert":
        # 試插入：partner_id = supplier_id（驗證假設）
        tmpl_id = p.get("product_tmpl_id")
        sup_id = p.get("supplier_id")
        if not tmpl_id or not sup_id:
            ctx.response.json({"error": "需要 product_tmpl_id 與 supplier_id"})
            return
        try:
            r = ctx.db.insert("product_supplierinfo", {
                "product_tmpl_id": tmpl_id,
                "supplier_id": sup_id,
                "partner_id": sup_id,
            })
            ctx.response.json({"ok": True, "inserted": r})
        except Exception as e:
            ctx.response.json({"ok": False, "error": str(e)})
        return

    # summary mode：查 suppliers 一筆 + product_supplierinfo 一筆
    out = {}
    try:
        sups = ctx.db.query("suppliers", limit=1)
        if sups:
            d = dict(sups[0]) if not isinstance(sups[0], dict) else sups[0]
            out["supplier_sample"] = {k: str(v) for k, v in d.items()}
            out["supplier_keys"] = sorted(list(d.keys()))
    except Exception as e:
        out["supplier_error"] = str(e)

    try:
        infos = ctx.db.query("product_supplierinfo", limit=1)
        if infos:
            d = dict(infos[0]) if not isinstance(infos[0], dict) else infos[0]
            out["info_sample"] = {k: str(v) for k, v in d.items()}
            out["info_keys"] = sorted(list(d.keys()))
        else:
            out["info_count"] = 0
    except Exception as e:
        out["info_error"] = str(e)

    ctx.response.json(out)
