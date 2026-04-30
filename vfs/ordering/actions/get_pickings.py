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
    diag = {"step": "init"}
    try:
        user_email = ctx.params.get("user_email", "")
        diag["user_email_present"] = bool(user_email)
        if not user_email:
            ctx.response.json({"pickings": [], "diag": diag})
            return

        diag["step"] = "query_customers"
        customers = ctx.db.query("customers", limit=1000) or []
        diag["customers_count"] = len(customers)

        customer_id = None
        for c in customers:
            if c.get("email") == user_email:
                customer_id = str(c.get("id", ""))
                break
        diag["customer_id"] = customer_id

        if not customer_id:
            ctx.response.json({"pickings": [], "diag": diag})
            return

        diag["step"] = "query_stock_pickings"
        all_pickings = ctx.db.query(
            "stock_pickings", limit=500,
            order_by=[{"column": "scheduled_date", "direction": "desc"}]
        ) or []
        diag["pickings_count"] = len(all_pickings)

        mine = [p for p in all_pickings if str(p.get("customer_id") or "") == customer_id]
        diag["mine_count"] = len(mine)

        diag["step"] = "query_stock_moves"
        all_moves = ctx.db.query("stock_moves", limit=5000) or []
        diag["moves_count"] = len(all_moves)

        result = []
        for p in mine:
            pid = str(p.get("id", ""))
            moves = [m for m in all_moves if str(m.get("picking_id") or "") == pid]
            result.append({"picking": _scrub(p), "moves": [_scrub(m) for m in moves]})

        ctx.response.json({"pickings": result})
    except Exception as e:
        diag["error"] = str(e)[:400]
        diag["error_type"] = type(e).__name__
        ctx.response.json({"pickings": [], "diag": diag, "error": str(e)[:400]})
