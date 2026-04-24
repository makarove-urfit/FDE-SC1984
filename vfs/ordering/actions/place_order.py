def execute(ctx):
    from datetime import datetime, timezone

    items = ctx.params.get("items", [])
    note = ctx.params.get("note", "")
    delivery_date = ctx.params.get("delivery_date", "")
    user_email = ctx.params.get("user_email", "")

    if not items or not user_email:
        ctx.response.json({"error": "缺少必要參數"})
        return

    today = delivery_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    date_order = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # ctx.db.query 只支援 limit，無 filter，需 Python 側過濾
    customers = ctx.db.query("customers", limit=500)
    customer_id = None
    for c in (customers or []):
        if c.get("email") == user_email:
            customer_id = c.get("id")
            break

    if not customer_id:
        new_cust = ctx.db.insert("customers", {
            "name": user_email.split("@")[0],
            "email": user_email,
            "customer_type": "company",
        })
        customer_id = new_cust.get("id") if new_cust else None

    if not customer_id:
        ctx.response.json({"error": "無法找到或建立客戶記錄"})
        return

    order_note = f"配送日期：{today}"
    if note:
        order_note += f"\n{note}"

    order = ctx.db.insert("sale_orders", {
        "customer_id": customer_id,
        "date_order": date_order,
        "note": order_note,
        "state": "draft",
    })

    order_id = order.get("id") if order else None
    if not order_id:
        ctx.response.json({"error": "建立訂單失敗"})
        return

    for item in items:
        result = ctx.db.insert("sale_order_lines", {
            "order_id": order_id,
            "product_template_id": item.get("product_template_id"),
            "name": item.get("product_name", ""),
            "product_uom_qty": item.get("qty", 1),
            "price_unit": item.get("price_unit", 0),
            "delivery_date": today,
        })
        if not result or not result.get("id"):
            ctx.response.json({"error": f"明細建立失敗：{item.get('product_name')}"})
            return

    ctx.response.json({
        "order_id": order_id,
        "order_name": order.get("name") or f"SO-{str(order_id)[:8]}",
        "delivery_date": today,
        "items_count": len(items),
    })
