def execute(ctx):
    from datetime import datetime, timezone, timedelta

    items = ctx.params.get("items", [])
    note = ctx.params.get("note", "")
    delivery_date = ctx.params.get("delivery_date", "")
    user_email = ctx.params.get("user_email", "")

    if not items or not user_email:
        ctx.response.json({"error": "缺少必要參數"})
        return

    if not delivery_date:
        ctx.response.json({"error": "未指定配送日期", "code": "DATE_BLOCKED"})
        return

    tw_now = datetime.now(timezone(timedelta(hours=8)))
    today_tw = tw_now.strftime("%Y-%m-%d")

    if delivery_date < today_tw:
        ctx.response.json({"error": "配送日期已過，請改選新的配送日期", "code": "DATE_BLOCKED"})
        return

    if delivery_date == today_tw:
        cutoff_time = ""
        try:
            setting_rows = ctx.db.query_object("x_app_settings", limit=100) or []
            for r in setting_rows:
                if r.get("key") == "order_cutoff_time":
                    cutoff_time = str(r.get("value", ""))
                    break
        except Exception:
            cutoff_time = ""
        if cutoff_time and ":" in cutoff_time:
            try:
                h, m = [int(x) for x in cutoff_time.split(":")[:2]]
                if tw_now.hour * 60 + tw_now.minute >= h * 60 + m:
                    ctx.response.json({
                        "error": f"已超過今日下單時間（{cutoff_time}），請改選新的配送日期",
                        "code": "DATE_BLOCKED",
                    })
                    return
            except Exception:
                pass

    today = delivery_date
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
        line_payload = {
            "order_id": order_id,
            "product_template_id": item.get("product_template_id"),
            "name": item.get("product_name", ""),
            "product_uom_qty": item.get("qty", 1),
            "price_unit": item.get("price_unit", 0),
            "delivery_date": today,
        }
        line_note = (item.get("note") or "").strip()
        if line_note:
            line_payload["custom_data"] = {"note": line_note}
        result = ctx.db.insert("sale_order_lines", line_payload)
        if not result or not result.get("id"):
            ctx.response.json({"error": f"明細建立失敗：{item.get('product_name')}"})
            return

    ctx.response.json({
        "order_id": order_id,
        "order_name": order.get("name") or f"SO-{str(order_id)[:8]}",
        "delivery_date": today,
        "items_count": len(items),
    })
