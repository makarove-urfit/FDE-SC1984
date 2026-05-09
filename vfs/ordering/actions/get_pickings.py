"""get_pickings — 回傳目前 user 綁定的所有 branch 名下的銷貨單（含 stock_moves 明細）。
改自 user_email 比對 → customer_custom_app_user_rel 反查（Task 5 backfill 後 stock_pickings 都指 branch，沒 email 可比）。"""


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
        uid = str((ctx.user.get("id") or ctx.user.get("custom_app_user_id")) or "")
        diag["uid_present"] = bool(uid)
        if not uid:
            ctx.response.json({"pickings": [], "diag": diag, "error": "未登入"})
            return

        diag["step"] = "query_rels"
        rels = ctx.db.query("customer_custom_app_user_rel", limit=2000) or []
        my_customer_ids = {str(r.get("customer_id") or "") for r in rels
                           if str(r.get("custom_app_user_id") or "") == uid}
        diag["my_customer_count"] = len(my_customer_ids)

        if not my_customer_ids:
            ctx.response.json({"pickings": [], "diag": diag})
            return

        diag["step"] = "query_stock_pickings"
        all_pickings = ctx.db.query(
            "stock_pickings", limit=500,
            order_by=[{"column": "scheduled_date", "direction": "desc"}]
        ) or []
        diag["pickings_count"] = len(all_pickings)

        mine = [p for p in all_pickings if str(p.get("customer_id") or "") in my_customer_ids]
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
