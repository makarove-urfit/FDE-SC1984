import uuid as _uuid

def execute(ctx):
    r = {}
    uid = str(_uuid.uuid4())[:8]
    phase = (ctx.params or {}).get("phase", "reads")

    if phase == "reads":
        # ── Odoo table reads ─────────────────────────────────────────────
        odoo_tables = [
            "product_categories", "hr_employees", "customers", "customer_tags",
            "sale_orders", "product_templates", "suppliers", "product_supplierinfo",
            "product_products", "hr_departments",
        ]
        r["reads_odoo"] = {}
        for t in odoo_tables:
            try:
                rows = ctx.db.query(t, limit=2)
                r["reads_odoo"][t] = {"ok": True, "count": len(rows or [])}
            except Exception as e:
                r["reads_odoo"][t] = {"ok": False, "error": str(e)}

    elif phase == "x_reads":
        # ── x_ table reads (逐一測試) ─────────────────────────────────────
        table = (ctx.params or {}).get("table", "x_app_settings")
        try:
            rows = ctx.db.query_object(table, limit=2)
            r["table"] = table
            r["ok"] = True
            r["count"] = len(rows or [])
            if rows:
                r["sample_keys"] = list((rows[0] or {}).keys())
        except Exception as e:
            r["table"] = table
            r["ok"] = False
            r["error"] = str(e)

    elif phase == "writes":
        # ── Odoo insert + update (customer_tags) ─────────────────────────
        tag_name = f"__test_{uid}__"
        test_tag_id = None
        try:
            tag = ctx.db.insert("customer_tags", {"name": tag_name})
            if isinstance(tag, dict):
                test_tag_id = tag.get("id")
            r["insert_odoo"] = {"ok": True, "id": test_tag_id}
        except Exception as e:
            r["insert_odoo"] = {"ok": False, "error": str(e)}

        if test_tag_id:
            try:
                ctx.db.update("customer_tags", test_tag_id, {"name": tag_name + "_upd"})
                r["update_odoo"] = {"ok": True}
            except Exception as e:
                r["update_odoo"] = {"ok": False, "error": str(e)}
        else:
            r["update_odoo"] = {"ok": False, "error": "skipped"}

        # ── x_ insert_object + update_object (x_holiday_settings) ────────
        x_id = None
        try:
            row = ctx.db.insert_object(slug="x_holiday_settings", data={"date": "2099-01-01", "reason": f"__test_{uid}__"})
            if isinstance(row, dict):
                x_id = row.get("id")
            r["insert_x"] = {"ok": True, "id": x_id}
        except Exception as e:
            r["insert_x"] = {"ok": False, "error": str(e)}

        if x_id:
            try:
                ctx.db.update_object(slug="x_holiday_settings", record_id=x_id, data={"reason": f"__test_{uid}_upd__"})
                r["update_x"] = {"ok": True}
            except Exception as e:
                r["update_x"] = {"ok": False, "error": str(e)}
        else:
            r["update_x"] = {"ok": False, "error": "skipped"}

    elif phase == "ctx_info":
        # ── ctx 屬性探查 ──────────────────────────────────────────────────
        r["ctx_attrs"] = [a for a in dir(ctx) if not a.startswith("__")]
        r["ctx_app_id"] = str(ctx.app_id) if hasattr(ctx, "app_id") else None
        r["ctx_user_id"] = str(ctx.user_id) if hasattr(ctx, "user_id") else None
        try:
            sec = ctx.secrets
            r["secrets_type"] = type(sec).__name__
            r["secrets_attrs"] = [a for a in dir(sec) if not a.startswith("__")]
        except Exception as e:
            r["secrets_err"] = str(e)
        try:
            h = ctx.http
            r["http_type"] = type(h).__name__
            r["http_attrs"] = [a for a in dir(h) if not a.startswith("__")]
        except Exception as e:
            r["http_err"] = str(e)
        try:
            ev = ctx.env
            r["env_type"] = type(ev).__name__
            r["env_attrs"] = [a for a in dir(ev) if not a.startswith("__")]
        except Exception as e:
            r["env_err"] = str(e)
        try:
            u = ctx.user
            r["user_attrs"] = [a for a in dir(u) if not a.startswith("__")]
            r["user_type"] = type(u).__name__
        except Exception as e:
            r["user_err"] = str(e)

    ctx.response.json(r)
