def execute(ctx):
    try:
        employees = ctx.db.query("hr_employees", limit=500) or []
    except Exception:
        ctx.response.json({"employees": []})
        return

    result = []
    for e in employees:
        if e.get("active") is False:
            continue
        user_id = e.get("user_id")
        if isinstance(user_id, list):
            user_id = str(user_id[0]) if user_id else ""
        else:
            user_id = str(user_id or "")
        if not user_id:
            continue  # 沒有系統帳號的員工不能作為業務員
        result.append({
            "id": str(e.get("id", "")),
            "name": str(e.get("name") or ""),
            "user_id": user_id,
            "job_title": str(e.get("job_title") or ""),
        })

    ctx.response.json({"employees": result})
