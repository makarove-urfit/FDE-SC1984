def _scrub(v):
    """遞迴把 Decimal/datetime 轉成 JSON 可序列化型別（ext path 寫 action_execution_logs JSONB 會 bomb）。"""
    from decimal import Decimal
    from datetime import datetime, date
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, dict):
        return {k: _scrub(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_scrub(x) for x in v]
    return v


def execute(ctx):
    user_email = ctx.params.get("user_email", "")
    if not user_email:
        ctx.response.json({"orders": []})
        return

    try:
        customers = ctx.db.query("customers", limit=1000) or []
    except Exception:
        ctx.response.json({"orders": []})
        return

    customer_id = None
    for c in customers:
        if c.get("email") == user_email:
            customer_id = str(c.get("id", ""))
            break

    if not customer_id:
        ctx.response.json({"orders": []})
        return

    try:
        all_orders = ctx.db.query(
            "sale_orders", limit=500,
            order_by=[{"column": "date_order", "direction": "desc"}]
        ) or []
    except Exception:
        ctx.response.json({"orders": []})
        return

    my_orders = [o for o in all_orders if str(o.get("customer_id") or "") == customer_id]

    try:
        all_lines = ctx.db.query("sale_order_lines", limit=5000) or []
    except Exception:
        all_lines = []

    result = []
    for order in my_orders:
        oid = str(order.get("id", ""))
        lines = [l for l in all_lines if str(l.get("order_id") or "") == oid]
        result.append({"order": _scrub(order), "lines": [_scrub(l) for l in lines]})

    ctx.response.json({"orders": result})
