def execute(ctx):
    p = ctx.params
    holiday_id = str(p.get("holiday_id") or "").strip()
    vip_ids = p.get("vip_branch_ids")

    if not holiday_id:
        ctx.response.json({"error": "holiday_id 為必填"})
        return
    if not isinstance(vip_ids, list):
        ctx.response.json({"error": "vip_branch_ids 必須為陣列"})
        return

    # 正規化：全部轉字串、去空、去重（保留順序）
    seen = set()
    normalized = []
    for v in vip_ids:
        s = str(v or "").strip()
        if s and s not in seen:
            seen.add(s)
            normalized.append(s)

    # 讀現有 row（用 query_object：x_ 表專用）
    rows = ctx.db.query_object("x_holiday_settings", limit=2000) or []
    row = next((r for r in rows if str(r.get("id")) == holiday_id), None)
    if not row:
        ctx.response.json({"error": f"假日 {holiday_id} 不存在"})
        return
    cd = row.get("custom_data") or {}
    new_cd = {**cd, "vip_branch_ids": normalized}

    try:
        ctx.db.update_object(slug="x_holiday_settings", record_id=holiday_id, data={"custom_data": new_cd})
    except Exception as e:
        ctx.response.json({"error": f"更新失敗：{e}"})
        return

    ctx.response.json({"success": True, "count": len(normalized)})
