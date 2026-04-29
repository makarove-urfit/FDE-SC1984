ALLOWED_TABLES = {
    "sale_orders", "sale_order_lines", "customers", "product_templates",
    "product_categories", "suppliers", "stock_quants", "product_products",
    "hr_employees", "hr_departments", "customer_tags",
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
    single_data = p.get("data")
    updates = p.get("updates")

    if single_id and single_data:
        items = [{"id": single_id, "data": single_data}]
    elif updates:
        items = updates
    else:
        ctx.response.json({"error": "provide {id, data} or {updates: [{id, data}]}"})
        return

    results = []
    errors = []

    for item in items:
        row_id = item.get("id")
        row_data = item.get("data", {})
        try:
            if slug:
                ctx.db.update_object(slug=slug, record_id=row_id, data=row_data)
            else:
                ctx.db.update(table, row_id, row_data)
            results.append({"id": row_id, "ok": True})
        except Exception as e:
            errors.append({"id": row_id, "error": str(e)})

    ctx.response.json({
        "updated": len(results),
        "errors": len(errors),
        "results": results,
        "error_details": errors,
    })
