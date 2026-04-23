def execute(ctx):
    """回傳 product_product 的 tmpl_id→pp_id 對照表，供前端 addToCart meta 使用。
    只查標準 Odoo 表，不碰 custom table（ctx.db 不支援）。
    """
    pp_rows = ctx.db.query("product_product", limit=1000) or []

    tmpl_to_prod = {}
    for r in pp_rows:
        raw = r.get("product_tmpl_id")
        tmpl_id = str(raw[0]) if isinstance(raw, list) else str(raw or "")
        if tmpl_id and r.get("id"):
            tmpl_to_prod[tmpl_id] = str(r["id"])

    ctx.response.json({"tmpl_to_prod": tmpl_to_prod})
