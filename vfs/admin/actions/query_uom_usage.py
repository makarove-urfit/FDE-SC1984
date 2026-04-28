def execute(ctx):
    from collections import defaultdict

    templates = ctx.db.query("product_templates", limit=2000) or []

    # uom_id 出現次數
    usage = defaultdict(list)
    for t in templates:
        uid = t.get("uom_id")
        if not uid:
            continue
        if isinstance(uid, list):
            uid = str(uid[0])
        elif isinstance(uid, dict):
            uid = str(uid.get("id", ""))
        else:
            uid = str(uid)
        if uid:
            usage[uid].append(t.get("name", ""))

    ctx.response.json({"usage": dict(usage)})
