def execute(ctx):
    """修改訂單明細數量，並重算 sale_orders.amount_total。
    params: { order_id: str, lines: [{id: str, qty: number}] }
    後端以 admin 身份執行，繞過 ext/proxy 的欄位限制。
    """
    order_id = ctx.params.get("order_id", "")
    lines = ctx.params.get("lines", [])

    if not order_id or not lines:
        ctx.response.json({"error": "缺少必要參數"})
        return

    # 建立 id → qty 對照表
    qty_map = {item["id"]: item["qty"] for item in lines if item.get("id") is not None}

    for line_id, qty in qty_map.items():
        try:
            ctx.db.update("sale_order_lines", line_id, {"product_uom_qty": qty})
        except Exception as e:
            ctx.response.json({"error": f"更新明細 {line_id} 失敗：{str(e)}"})
            return

    # 重取所有明細，重算金額
    def _oid(val):
        if isinstance(val, list): return str(val[0])
        return str(val) if val is not None else ""

    all_lines = ctx.db.query("sale_order_lines", limit=500)
    order_lines = [l for l in (all_lines or []) if _oid(l.get("order_id")) == str(order_id)]
    amount_total = round(sum(
        float(l.get("product_uom_qty") or 0) * float(l.get("price_unit") or 0)
        for l in order_lines
    ), 2)

    # 寫回訂單總金額
    try:
        ctx.db.update("sale_orders", order_id, {"amount_total": amount_total})
    except Exception as e:
        ctx.response.json({"error": f"更新訂單金額失敗：{str(e)}"})
        return

    # 重取該訂單確認寫入結果
    all_orders = ctx.db.query("sale_orders", limit=500)
    order = next((o for o in (all_orders or []) if str(o.get("id")) == str(order_id)), None)
    confirmed_total = float(order.get("amount_total") or 0) if order else amount_total

    ctx.response.json({"updated": len(qty_map), "amount_total": confirmed_total})
