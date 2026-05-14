def execute(ctx):
    from datetime import datetime, timezone

    p = ctx.params
    customer_id = str(p.get("customer_id") or "").strip()
    new_route_tag_id = str(p.get("new_route_tag_id") or "").strip()

    if not customer_id:
        ctx.response.json({"error": "customer_id 為必填"})
        return
    if not new_route_tag_id:
        ctx.response.json({"error": "new_route_tag_id 為必填"})
        return

    for attempt in range(3):
        # 1. 讀客戶
        customers = ctx.db.query("customers", limit=5000) or []
        cust = next((c for c in customers if str(c.get("id")) == customer_id), None)
        if not cust:
            ctx.response.json({"error": f"客戶 {customer_id} 不存在"})
            return
        old_code = (cust.get("ref") or "").strip()
        if not old_code:
            ctx.response.json({"error": "客戶尚未發放編碼，請改用 assign_customer_code"})
            return
        cust_cd = cust.get("custom_data") or {}
        old_route_tag_id = str(cust_cd.get("region_tag_id") or "")
        if old_route_tag_id == new_route_tag_id:
            ctx.response.json({"success": True, "old_code": old_code, "new_code": old_code, "noop": True})
            return

        # 2. 讀新路線 tag、算新編碼
        tags = ctx.db.query("customer_tags", limit=2000) or []
        new_tag = next((t for t in tags if str(t.get("id")) == new_route_tag_id), None)
        if not new_tag:
            ctx.response.json({"error": f"路線 tag {new_route_tag_id} 不存在"})
            return
        new_tag_cd = new_tag.get("custom_data") or {}
        route_letter = str(new_tag_cd.get("route_letter") or "").strip().upper()
        if not (len(route_letter) == 1 and "A" <= route_letter <= "Z"):
            ctx.response.json({"error": "新路線未設定有效的 route_letter"})
            return
        next_seq = int(new_tag_cd.get("next_seq") or 1)
        seq_str = f"{next_seq:02d}" if next_seq < 100 else str(next_seq)
        new_code = f"{route_letter}{seq_str}"

        # 3. 更新 history：舊筆封 until、新筆 append
        now_iso = datetime.now(timezone.utc).isoformat()
        history = list(cust_cd.get("code_history") or [])
        if history and history[-1].get("until") is None:
            history[-1] = {**history[-1], "until": now_iso}
        history.append({
            "code": new_code,
            "route_tag_id": new_route_tag_id,
            "since": now_iso,
            "until": None,
        })
        new_cd = {**cust_cd, "code_history": history, "region_tag_id": new_route_tag_id}

        # 4. tag.next_seq +1（舊路線不動）
        updated_tag_cd = {**new_tag_cd, "next_seq": next_seq + 1}
        try:
            ctx.db.update("customer_tags", new_route_tag_id, {"custom_data": updated_tag_cd})
        except Exception as e:
            ctx.response.json({"error": f"更新新路線 next_seq 失敗：{e}"})
            return

        # 4b. 樂觀鎖驗證：re-read 新 tag 確認 next_seq 已正確 +1
        post_tags = ctx.db.query("customer_tags", limit=2000) or []
        post_tag = next((t for t in post_tags if str(t.get("id")) == new_route_tag_id), None)
        post_cd = (post_tag or {}).get("custom_data") or {}
        if int(post_cd.get("next_seq") or 0) != next_seq + 1:
            continue

        # 4c. Belt-and-suspenders：確認新 code 尚未被其他客戶使用
        duplicate = next(
            (c for c in customers if (c.get("ref") or "").strip() == new_code and str(c.get("id")) != customer_id),
            None,
        )
        if duplicate:
            continue

        # 5. 客戶 ref + custom_data
        try:
            ctx.db.update("customers", customer_id, {"ref": new_code, "custom_data": new_cd})
        except Exception as e:
            ctx.response.json({"error": f"更新客戶失敗（號碼 {new_code} 跳號）：{e}"})
            return

        ctx.response.json({"success": True, "old_code": old_code, "new_code": new_code})
        return

    ctx.response.json({"error": "並發衝突重試 3 次仍失敗，請手動重試"})
