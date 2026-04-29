ALLOWED_TABLES = {
    "product_categories", "product_supplierinfo",
}

ALLOWED_SLUGS = {
    "x_app_settings", "x_holiday_settings", "x_driver_customer", "x_category_buyer",
}

def execute(ctx):
    p = ctx.params or {}
    table = p.get("table")
    slug = p.get("slug")

    if table and table not in ALLOWED_TABLES:
        ctx.response.json({"error": f"table '{table}' not allowed"})
        return
    if slug and slug not in ALLOWED_SLUGS:
        ctx.response.json({"error": f"slug '{slug}' not allowed"})
        return
    if not table and not slug:
        ctx.response.json({"error": "table or slug required"})
        return

    single_id = p.get("id")
    ids = p.get("ids")

    if single_id:
        items = [single_id]
    elif ids:
        items = ids
    else:
        ctx.response.json({"error": "provide id or ids"})
        return

    results = []
    errors = []

    for row_id in items:
        try:
            if slug:
                ctx.db.remove_object(slug=slug, record_id=row_id)
            else:
                ctx.db.remove(table, row_id)
            results.append({"id": row_id, "ok": True})
        except Exception as e:
            errors.append({"id": row_id, "error": str(e)})

    ctx.response.json({
        "deleted": len(results),
        "errors": len(errors),
        "results": results,
        "error_details": errors,
    })
