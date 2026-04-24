def execute(ctx):
    # for_picker=True：只回傳有 user_id 的員工（供業務員下拉選單）
    # for_picker=False（預設）：回傳所有在職員工 + has_account 旗標（供員工頁）
    for_picker = bool(ctx.params.get("for_picker", False))

    try:
        employees = ctx.db.query("hr_employees", limit=500) or []
    except Exception:
        ctx.response.json({"employees": [], "departments": []})
        return

    try:
        departments = ctx.db.query("hr_departments", limit=200) or []
    except Exception:
        departments = []

    # Lazy linking：email → user_id（透過 members + users 反查）
    email_to_user_id = {}
    try:
        members = ctx.db.query("members", limit=2000) or []
        users = ctx.db.query("users", limit=2000) or []
        mid_to_email = {str(m.get("id", "")): str(m.get("email") or "") for m in members}
        for u in users:
            mid = str(u.get("member_id") or "")
            email = mid_to_email.get(mid, "")
            if email:
                email_to_user_id[email] = str(u.get("id", ""))
    except Exception:
        pass

    def resolve_id(v):
        if isinstance(v, list):
            return str(v[0]) if v else ""
        return str(v or "")

    dept_map = {str(d.get("id", "")): str(d.get("name") or "") for d in departments}

    result = []
    for e in employees:
        if e.get("active") is False:
            continue

        user_id = resolve_id(e.get("user_id"))
        work_email = str(e.get("work_email") or "")

        # 若 user_id 空但 email 已有對應 user，自動補上並更新 DB
        if not user_id and work_email and work_email in email_to_user_id:
            user_id = email_to_user_id[work_email]
            try:
                ctx.db.update("hr_employees", str(e.get("id")), {"user_id": user_id})
            except Exception:
                pass

        if for_picker and not user_id:
            continue

        dept_id = resolve_id(e.get("department_id"))
        result.append({
            "id": str(e.get("id", "")),
            "name": str(e.get("name") or ""),
            "user_id": user_id,
            "has_account": bool(user_id),
            "job_title": str(e.get("job_title") or ""),
            "work_email": work_email,
            "department_id": dept_id,
            "department_name": dept_map.get(dept_id, ""),
        })

    dept_list = [{"id": str(d.get("id", "")), "name": str(d.get("name") or "")}
                 for d in departments]

    ctx.response.json({"employees": result, "departments": dept_list})
