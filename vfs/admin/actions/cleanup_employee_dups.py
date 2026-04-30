def execute(ctx):
    """
    清掉舊版平台 trigger 自動衍生的 hr_employees 重複記錄。

    判定邏輯（同 work_email 多筆 active 員工）：
      - 「衍生」：有 user_id 但 department_id 與 job_title 皆空，且名稱可能是 email
      - 「原始」：手動建立的那筆（通常無 user_id 但有 dept/title 或人名）

    動作：
      1. 把 user_id 從衍生那筆搬到原始那筆
      2. 將衍生那筆 active 設為 false（軟刪除）

    dry_run=True 只回報計畫不動 DB。
    """
    dry_run = bool(ctx.params.get("dry_run", True))

    employees = ctx.db.query("hr_employees", limit=1000) or []
    active = [e for e in employees if e.get("active") is not False]

    by_email = {}
    for e in active:
        email = str(e.get("work_email") or "").strip().lower()
        if email:
            by_email.setdefault(email, []).append(e)

    def resolve_id(v):
        if isinstance(v, list):
            return str(v[0]) if v else ""
        return str(v or "")

    plan = []
    for email, group in by_email.items():
        if len(group) <= 1:
            continue

        # 區分原則：同 email 下，有 user_id 的那筆是平台 trigger 衍生的；
        # 沒有 user_id 的那筆是 admin 手動建立的原始記錄
        with_user = [e for e in group if resolve_id(e.get("user_id"))]
        without_user = [e for e in group if not resolve_id(e.get("user_id"))]

        if not with_user or not without_user:
            # 全有或全無 user_id → 無法判定，跳過
            plan.append({"email": email, "skipped": True, "reason": "ambiguous_no_split", "ids": [str(e.get("id")) for e in group]})
            continue

        derived = with_user
        canonical_candidates = without_user

        # 從候選原始挑一筆：有 dept > 有 title > 名稱長度長 > id 較小
        def score(e):
            return (
                1 if resolve_id(e.get("department_id")) else 0,
                1 if str(e.get("job_title") or "").strip() else 0,
                len(str(e.get("name") or "")),
            )
        canonical_candidates.sort(key=score, reverse=True)
        canonical = canonical_candidates[0]
        canonical_id = str(canonical.get("id"))
        canonical_user_id = resolve_id(canonical.get("user_id"))

        moves = []
        for d in derived:
            d_id = str(d.get("id"))
            d_user_id = resolve_id(d.get("user_id"))
            if not canonical_user_id and d_user_id:
                if not dry_run:
                    ctx.db.update("hr_employees", canonical_id, {"user_id": d_user_id})
                canonical_user_id = d_user_id
                moves.append({"action": "move_user_id", "from": d_id, "to": canonical_id, "user_id": d_user_id})
            if not dry_run:
                ctx.db.update("hr_employees", d_id, {"active": False})
            moves.append({"action": "deactivate", "id": d_id})

        plan.append({"email": email, "canonical_id": canonical_id, "moves": moves})

    ctx.response.json({
        "dry_run": dry_run,
        "groups_processed": len(plan),
        "plan": plan,
    })
