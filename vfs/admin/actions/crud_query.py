ALLOWED_TABLES = {
    "sale_orders", "sale_order_lines", "customers", "product_templates",
    "product_categories", "suppliers", "product_supplierinfo", "purchase_orders",
    "purchase_order_lines", "stock_quants", "product_products", "hr_employees",
    "hr_departments", "stock_locations", "uom_uom", "customer_tags",
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

    limit = int(p.get("limit", 500))
    offset = int(p.get("offset", 0))
    fetch_all = bool(p.get("all", False))
    order_by = p.get("order_by")
    select = p.get("select")
    search = p.get("search")
    search_columns = p.get("search_columns")
    filters = p.get("filters") or {}
    count_only = bool(p.get("count_only", False))

    if slug:
        rows = ctx.db.query_object(slug, limit=limit)
        ctx.response.json({"data": rows or []})
        return

    query_kwargs = {k: v for k, v in filters.items()}
    if order_by:
        query_kwargs["order_by"] = order_by
    if select:
        query_kwargs["select"] = select
    if search:
        query_kwargs["search"] = search
    if search_columns:
        query_kwargs["search_columns"] = search_columns
    if count_only:
        query_kwargs["count_only"] = True
        result = ctx.db.query(table, limit=limit, offset=offset, **query_kwargs)
        ctx.response.json(result)
        return

    if fetch_all:
        all_rows = []
        cur = 0
        while True:
            batch = ctx.db.query(table, limit=500, offset=cur, **query_kwargs)
            if not batch:
                break
            all_rows.extend(batch)
            if len(batch) < 500:
                break
            cur += 500
        ctx.response.json({"data": all_rows})
    else:
        rows = ctx.db.query(table, limit=limit, offset=offset, **query_kwargs)
        ctx.response.json({"data": rows or []})
