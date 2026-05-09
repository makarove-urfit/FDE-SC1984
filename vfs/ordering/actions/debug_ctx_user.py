"""debug_ctx_user — 純讀，回傳 ctx.user 的 type / dir / 所有 attribute 值，用來確認 ordering /ext endpoint 給的 ctx.user 真實 shape。"""
def execute(ctx):
    u = ctx.user
    out = {
        "type": type(u).__name__,
        "module": type(u).__module__,
        "attrs": [a for a in dir(u) if not a.startswith("_")],
        "is_none": u is None,
    }
    if u is None:
        ctx.response.json(out)
        return

    # Try common access patterns
    out["has_get"] = hasattr(u, "get") and callable(getattr(u, "get", None))

    values = {}
    for attr in ("id", "custom_app_user_id", "email", "display_name", "name"):
        try:
            v = getattr(u, attr, None)
            values[attr] = str(v) if v is not None else None
        except Exception as e:
            values[attr] = f"ERR: {e}"
    out["attr_values"] = values

    # Also try as dict if has __getitem__
    if hasattr(u, "__getitem__"):
        dict_values = {}
        for key in ("id", "custom_app_user_id", "email"):
            try:
                dict_values[key] = str(u[key]) if u[key] is not None else None
            except Exception as e:
                dict_values[key] = f"ERR: {e}"
        out["dict_values"] = dict_values

    ctx.response.json(out)
