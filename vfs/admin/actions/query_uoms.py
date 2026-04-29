def execute(ctx):
    rows = ctx.db.query("uom_uom", limit=500)
    ctx.response.json({"uoms": rows or []})
