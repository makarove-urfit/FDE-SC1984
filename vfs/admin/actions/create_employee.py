def execute(ctx):
    name = (ctx.params.get("name") or "").strip()
    if not name:
        ctx.response.json({"error": "姓名為必填"})
        return

    work_email = (ctx.params.get("work_email") or "").strip()
    department_id = (ctx.params.get("department_id") or "")
    job_title = (ctx.params.get("job_title") or "").strip()

    data = {"name": name}
    if work_email:
        data["work_email"] = work_email
    if department_id:
        data["department_id"] = department_id
    if job_title:
        data["job_title"] = job_title

    try:
        emp = ctx.db.insert("hr_employees", data)
    except Exception as e:
        ctx.response.json({"error": str(e)})
        return

    if not emp or not emp.get("id"):
        ctx.response.json({"error": "建立員工失敗"})
        return

    ctx.response.json({"id": str(emp["id"]), "name": name})
