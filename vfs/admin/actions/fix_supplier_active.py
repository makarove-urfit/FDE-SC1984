# 將 suppliers 表 active 欄位不是嚴格 true/false 的 row 統一寫成 true
# mode='dry_run'（預設）：只列出有問題的 row，不修改
# mode='commit'：實際 update active=true（params.target_ids 可選；不傳則修全部問題 row）
def execute(ctx):
    p = ctx.params or {}
    mode = p.get("mode", "dry_run")
    target_ids = set(p.get("target_ids") or [])

    rows = ctx.db.query("suppliers", limit=1000) or []
    problematic = []
    for r in rows:
        d = dict(r) if not isinstance(r, dict) else r
        active = d.get("active")
        if active is True or active is False:
            continue
        problematic.append({
            "id": str(d.get("id") or ""),
            "name": str(d.get("name") or ""),
            "active_raw": repr(active),
            "active_type": type(active).__name__,
        })

    if mode == "dry_run":
        ctx.response.json({
            "mode": "dry_run",
            "total_suppliers": len(rows),
            "problematic_count": len(problematic),
            "problematic": problematic,
        })
        return

    if mode == "commit":
        to_fix = problematic if not target_ids else [x for x in problematic if x["id"] in target_ids]
        results = []
        for x in to_fix:
            try:
                ctx.db.update("suppliers", x["id"], {"active": True})
                results.append({"id": x["id"], "name": x["name"], "ok": True})
            except Exception as e:
                results.append({"id": x["id"], "name": x["name"], "ok": False, "error": str(e)})
        ctx.response.json({
            "mode": "commit",
            "fixed": sum(1 for r in results if r["ok"]),
            "failed": sum(1 for r in results if not r["ok"]),
            "results": results,
        })
        return

    ctx.response.json({"error": f"unknown mode: {mode}"})
