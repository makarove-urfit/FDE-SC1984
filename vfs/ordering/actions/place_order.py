"""place_order — 客戶下單。改吃前端傳的 branch_id，verify rel 通過才寫入 customer_id。"""

def _is_authorized(uid, branch_id, rels):
    """純函式：給定 uid、branch_id、rel list，判斷 user 是否真的綁這個 branch。"""
    return any(
        str(r.get("custom_app_user_id") or "") == uid
        and str(r.get("customer_id") or "") == branch_id
        for r in rels
    )


def execute(ctx):
    from datetime import datetime, timezone, timedelta

    items = ctx.params.get("items", [])
    branch_id = str(ctx.params.get("branch_id") or "")
    note = ctx.params.get("note", "")
    delivery_date = ctx.params.get("delivery_date", "")
    uid = str((ctx.user.get("id") or ctx.user.get("custom_app_user_id")) or "")

    if not items or not branch_id:
        ctx.response.json({"error": "缺少必要參數（items / branch_id）"})
        return
    if not uid:
        ctx.response.json({"error": "未登入", "code": "UNAUTHORIZED"})
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

    # ── 權限驗證：user 必須真的綁這個 branch ──
    try:
        rels = ctx.db.query("customer_custom_app_user_rel", limit=2000) or []
    except Exception as e:
        ctx.response.json({"error": "權限驗證暫時不可用，請稍後再試", "code": "SERVER_ERROR", "detail": str(e)})
        return
    if not _is_authorized(uid, branch_id, rels):
        ctx.response.json({"error": "無權對此分店下單", "code": "BRANCH_FORBIDDEN"})
        return

    customer_id = branch_id
    today = delivery_date
    date_order = datetime.now(timezone.utc).strftime("%Y-%m-%d")

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


if __name__ == "__main__":
    rels = [
        {"customer_id": "b1", "custom_app_user_id": "u1"},
        {"customer_id": "h1", "custom_app_user_id": "u1"},
    ]
    assert _is_authorized("u1", "b1", rels), "u1 應該能下 b1"
    assert _is_authorized("u1", "h1", rels), "u1 也綁 hq（雖然不該被選）"
    assert not _is_authorized("u2", "b1", rels), "u2 不該能下 b1"
    assert not _is_authorized("u1", "b_unknown", rels), "u1 沒綁的 branch 要擋"
    assert not _is_authorized("", "b1", rels), "空 uid 一律擋"
    print("✅ place_order._is_authorized tests pass")
