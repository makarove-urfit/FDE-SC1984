"""get_orders — 回傳目前 user 綁定的所有 branch 名下的訂單（含明細）。
改自 user_email 比對 → customer_custom_app_user_rel 反查（Task 5 backfill 後 sale_orders 都指 branch，沒 email 可比）。"""


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
    uid = str(getattr(ctx.user, "id", "") or "")
    if not uid:
        ctx.response.json({"orders": [], "error": "未登入", "code": "UNAUTHORIZED"})
        return

    try:
        rels = ctx.db.query("customer_custom_app_user_rel", limit=2000) or []
    except Exception:
        ctx.response.json({"orders": []})
        return

    my_customer_ids = {str(r.get("customer_id") or "") for r in rels
                       if str(r.get("custom_app_user_id") or "") == uid}
    if not my_customer_ids:
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

    my_orders = [o for o in all_orders if str(o.get("customer_id") or "") in my_customer_ids]

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
