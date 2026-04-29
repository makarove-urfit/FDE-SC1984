ALLOWED_TABLES = {
    "customers", "product_templates", "product_categories", "suppliers",
    "product_supplierinfo", "purchase_orders", "purchase_order_lines",
    "stock_quants", "hr_employees", "hr_departments", "stock_locations",
    "customer_tags",
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

    data = p.get("data")
    rows = p.get("rows")

    if not data and not rows:
        ctx.response.json({"error": "data or rows required"})
        return

    items = rows if rows else [data]
    results = []
    errors = []

    for item in items:
        try:
            if slug:
                r = ctx.db.insert_object(slug=slug, data=item)
            else:
                r = ctx.db.insert(table, item)
            results.append(r)
        except Exception as e:
            errors.append({"data": item, "error": str(e)})

    ctx.response.json({
        "inserted": len(results),
        "errors": len(errors),
        "results": results,
        "error_details": errors,
    })
