# 依名稱查 supplier_id
# params:
#   name: str  (必填)
# 回傳：
#   exact: [{id, name}]  名稱完全相同
#   contains: [{id, name}]  名稱包含關鍵字（exact 為空時 fallback 用）
def execute(ctx):
    p = ctx.params or {}
    name = (p.get("name") or "").strip()
    if not name:
        ctx.response.json({"error": "需要 name"})
        return

    rows = ctx.db.query("suppliers", limit=1000) or []
    exact = []
    contains = []
    for r in rows:
        d = dict(r) if not isinstance(r, dict) else r
        if d.get("active") is False:
            continue
        nm = str(d.get("name") or "").strip()
        if nm == name:
            exact.append({"id": str(d.get("id")), "name": nm})
        elif name in nm:
            contains.append({"id": str(d.get("id")), "name": nm})

    ctx.response.json({
        "query": name,
        "total_active_suppliers": sum(1 for r in rows if (dict(r) if not isinstance(r, dict) else r).get("active") is not False),
        "exact": exact,
        "contains": contains,
    })
