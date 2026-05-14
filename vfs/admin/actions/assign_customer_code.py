def execute(ctx):
    from datetime import datetime, timezone

    p = ctx.params
    customer_id = str(p.get("customer_id") or "").strip()
    route_tag_id = str(p.get("route_tag_id") or "").strip()

    if not customer_id:
        ctx.response.json({"error": "customer_id 為必填"})
        return
    if not route_tag_id:
        ctx.response.json({"error": "route_tag_id 為必填"})
        return

    for attempt in range(3):
        # 1. 讀 route tag
        tags = ctx.db.query("customer_tags", limit=2000) or []
        tag = next((t for t in tags if str(t.get("id")) == route_tag_id), None)
        if not tag:
            ctx.response.json({"error": f"路線 tag {route_tag_id} 不存在"})
            return
        tag_cd = tag.get("custom_data") or {}
        route_letter = str(tag_cd.get("route_letter") or "").strip().upper()
        if not (len(route_letter) == 1 and "A" <= route_letter <= "Z"):
            ctx.response.json({"error": f"路線 tag 未設定有效的 route_letter（單一 A-Z 字母）"})
            return
        next_seq = int(tag_cd.get("next_seq") or 1)

        # 2. 算出新編碼（≤99 補零、≥100 不補）
        seq_str = f"{next_seq:02d}" if next_seq < 100 else str(next_seq)
        code = f"{route_letter}{seq_str}"

        # 3. 讀客戶（取目前 custom_data 以便 merge）
        customers = ctx.db.query("customers", limit=5000) or []
        cust = next((c for c in customers if str(c.get("id")) == customer_id), None)
        if not cust:
            ctx.response.json({"error": f"客戶 {customer_id} 不存在"})
            return
        if (cust.get("ref") or "").strip():
            ctx.response.json({"error": f"客戶已有編碼 {cust.get('ref')}，請改用 reassign_customer_route"})
            return

        cust_cd = cust.get("custom_data") or {}
        now_iso = datetime.now(timezone.utc).isoformat()
        history = list(cust_cd.get("code_history") or [])
        history.append({
            "code": code,
            "route_tag_id": route_tag_id,
            "since": now_iso,
            "until": None,
        })
        new_cd = {**cust_cd, "code_history": history, "region_tag_id": route_tag_id}

        # 4. 先 update tag（樂觀鎖：把 next_seq +1）
        new_tag_cd = {**tag_cd, "next_seq": next_seq + 1}
        try:
            ctx.db.update("customer_tags", route_tag_id, {"custom_data": new_tag_cd})
        except Exception as e:
            ctx.response.json({"error": f"更新 next_seq 失敗：{e}"})
            return

        # 4b. 樂觀鎖驗證：re-read tag，確認 next_seq 已正確 +1
        post_tags = ctx.db.query("customer_tags", limit=2000) or []
        post_tag = next((t for t in post_tags if str(t.get("id")) == route_tag_id), None)
        post_cd = (post_tag or {}).get("custom_data") or {}
        if int(post_cd.get("next_seq") or 0) != next_seq + 1:
            # 並發寫者搶先改動了 next_seq，我們讀到的 next_seq 已過期 → 重試
            continue

        # 4c. Belt-and-suspenders：確認 code 尚未被其他客戶使用
        duplicate = next(
            (c for c in customers if (c.get("ref") or "").strip() == code and str(c.get("id")) != customer_id),
            None,
        )
        if duplicate:
            # code 已存在（表示 next_seq 管理有誤），重試讓 next_seq 遞增後再算
            continue

        # 5. 再 update customer（ref + custom_data）
        try:
            ctx.db.update("customers", customer_id, {"ref": code, "custom_data": new_cd})
        except Exception as e:
            # 客戶更新失敗 → tag 已 +1，該號碼跳號（符合「不回收」原則，可接受）
            ctx.response.json({"error": f"更新客戶失敗（號碼 {code} 跳號）：{e}"})
            return

        ctx.response.json({"success": True, "code": code, "seq": next_seq})
        return

    # 3 次都遇到並發衝突
    ctx.response.json({"error": "並發衝突重試 3 次仍失敗，請手動重試"})
