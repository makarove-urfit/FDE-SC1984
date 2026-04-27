def execute(ctx):
    try:
        categories = ctx.db.query("product_categories", limit=500) or []
    except Exception:
        categories = []

    try:
        templates = ctx.db.query("product_templates", limit=2000) or []
    except Exception:
        templates = []

    try:
        uoms = ctx.db.query("uom_uom", limit=200) or []
    except Exception:
        uoms = []

    try:
        prods = ctx.db.query("product_products", limit=2000) or []
    except Exception:
        prods = []

    active_cats = [r for r in categories if r.get("active") != False]
    _seen_tmpl = set()
    active_tmpl = []
    for r in templates:
        if r.get("active") == False or r.get("sale_ok") == False:
            continue
        rid = r.get("id")
        if rid in _seen_tmpl:
            continue
        _seen_tmpl.add(rid)
        active_tmpl.append(r)
    active_uoms = [r for r in uoms if r.get("active") != False]

    order_settings = {}
    for p in prods:
        tmpl_id = str(p.get("product_tmpl_id") or "")
        if not tmpl_id:
            continue
        cd = p.get("custom_data") or {}
        if not isinstance(cd, dict):
            continue
        step = cd.get("order_step") or 0
        min_q = cd.get("min_qty") or 0
        max_q = cd.get("max_qty") or 0
        if step or min_q or max_q:
            order_settings[tmpl_id] = {"order_step": step, "min_qty": min_q, "max_qty": max_q}

    ctx.response.json({
        "categories": active_cats,
        "templates": active_tmpl,
        "uoms": active_uoms,
        "order_settings": order_settings,
    })
