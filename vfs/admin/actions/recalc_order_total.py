def execute(ctx):
    p = ctx.params or {}
    order_ids = p.get("order_ids") or []

    if not order_ids:
        ctx.response.json({"error": "order_ids required"})
        return

    unique_ids = list(set(str(oid) for oid in order_ids if oid))
    results = []
    errors = []

    for oid in unique_ids:
        try:
            lines = ctx.db.query("sale_order_lines", order_id=oid, limit=500)
            total = sum(
                float(l.get("product_uom_qty") or 0) * float(l.get("price_unit") or 0)
                for l in (lines or [])
            )
            total = round(total * 100) / 100
            ctx.db.update("sale_orders", oid, {"amount_total": total})
            results.append({"order_id": oid, "total": total})
        except Exception as e:
            errors.append({"order_id": oid, "error": str(e)})

    ctx.response.json({
        "updated": len(results),
        "errors": len(errors),
        "results": results,
        "error_details": errors,
    })
