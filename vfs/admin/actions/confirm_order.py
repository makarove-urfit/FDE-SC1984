def execute(ctx):
    p = ctx.params or {}
    order_ids = p.get("order_ids") or ([p["order_id"]] if p.get("order_id") else [])
    if not order_ids:
        ctx.response.json({"error": "order_ids required"})
        return

    locs = ctx.db.query("stock_locations", limit=200) or []
    src_loc = next((l for l in locs if (l.get("usage") == "internal")), None)
    dst_loc = next((l for l in locs if (l.get("usage") == "customer")), None)
    src_id = src_loc["id"] if src_loc else (locs[0]["id"] if locs else None)
    dst_id = dst_loc["id"] if dst_loc else (locs[1]["id"] if len(locs) > 1 else src_id)

    # picking_type_id 是 NOT NULL UUID。優先序：existing outgoing → 任何 existing → 現有 picking → 自建
    sample_pt_id = None
    try:
        pts = ctx.db.query("stock_picking_types", limit=50) or []
        out_pt = next((t for t in pts if t.get("code") == "outgoing"), None)
        sample_pt_id = (out_pt or (pts[0] if pts else None) or {}).get("id")
    except Exception:
        pass
    if not sample_pt_id:
        try:
            existing_pickings = ctx.db.query("stock_pickings", limit=5) or []
            for p in existing_pickings:
                if p.get("picking_type_id"):
                    sample_pt_id = p["picking_type_id"]; break
        except Exception:
            pass
    if not sample_pt_id:
        try:
            r = ctx.db.insert("stock_picking_types", {"name": "出貨", "code": "outgoing", "active": True}) or {}
            sample_pt_id = r.get("id") or (r.get("data") or {}).get("id")
        except Exception:
            pass

    variants = ctx.db.query("product_products", limit=5000) or []
    variant_to_tmpl = {}
    tmpl_to_variant = {}
    for v in variants:
        vid = str(v.get("id") or "")
        tid = str(v.get("product_tmpl_id") or "")
        if vid and tid:
            variant_to_tmpl[vid] = tid
            tmpl_to_variant.setdefault(tid, vid)

    all_quants = ctx.db.query("stock_quants", limit=10000) or []
    quants_by_pid = {}
    for q in all_quants:
        pid = str(q.get("product_id") or "")
        if not pid:
            continue
        quants_by_pid.setdefault(pid, []).append(q)

    price_logs = ctx.db.query_object("x_product_product_price_log", limit=10000) or []
    latest_price = {}
    for r in price_logs:
        pid = str(r.get("product_product_id") or "")
        eff = r.get("effective_date") or r.get("updated_at") or ""
        if not pid:
            continue
        cur = latest_price.get(pid)
        if (cur is None) or (eff > cur[0]):
            latest_price[pid] = (eff, r.get("lst_price"))

    results = []
    errors = []

    for raw_oid in order_ids:
        oid = str(raw_oid)
        try:
            orders = ctx.db.query("sale_orders", id=oid, limit=1) or []
            if not orders:
                errors.append({"order_id": oid, "error": "order not found"})
                continue
            order = orders[0]
            if (order.get("state") or "draft") != "draft":
                errors.append({"order_id": oid, "error": f"state is {order.get('state')}, skip"})
                continue

            lines = ctx.db.query("sale_order_lines", order_id=oid, limit=500) or []
            if not lines:
                errors.append({"order_id": oid, "error": "no lines"})
                continue

            def variants_of(line_pid):
                pid = str(line_pid or "")
                if pid in variant_to_tmpl:
                    return [pid]
                return [v for v, t in variant_to_tmpl.items() if t == pid]

            line_variants = {}
            for l in lines:
                raw = l.get("product_id") or l.get("product_template_id")
                req = float(l.get("product_uom_qty") or 0)
                if not raw or req <= 0:
                    continue
                vids = variants_of(raw)
                line_variants[l["id"]] = vids

            for l in lines:
                req = float(l.get("product_uom_qty") or 0)
                vids = line_variants.get(l["id"]) or []
                if req <= 0 or not vids:
                    continue
                remain = req
                for v in vids:
                    if remain <= 0:
                        break
                    for q in quants_by_pid.get(v, []):
                        if remain <= 0:
                            break
                        qqty = float(q.get("quantity") or 0)
                        if qqty <= 0:
                            continue
                        deduct = min(qqty, remain)
                        ctx.db.update("stock_quants", q["id"], {"quantity": qqty - deduct})
                        q["quantity"] = qqty - deduct
                        remain -= deduct

            if not sample_pt_id:
                errors.append({"order_id": oid, "error": "no stock_picking_types available; cannot create picking"})
                continue
            picking_payload = {
                "name": f"WH/OUT/{order.get('name') or oid}",
                "state": "draft",
                "customer_id": order.get("customer_id"),
                "sale_id": oid,
                "scheduled_date": order.get("date_order"),
                "location_id": src_id,
                "location_dest_id": dst_id,
                "picking_type_id": sample_pt_id,
            }
            picking = ctx.db.insert("stock_pickings", picking_payload) or {}
            picking_id = picking.get("id") or picking.get("data", {}).get("id")

            move_results = []
            for l in lines:
                raw = l.get("product_id") or l.get("product_template_id")
                if not raw:
                    continue
                vids = line_variants.get(l["id"]) or variants_of(raw)
                move_pid = vids[0] if vids else str(raw)
                ordered_qty = float(l.get("product_uom_qty") or 0)
                delivered_qty = float(l.get("qty_delivered") or 0) or ordered_qty
                lp = latest_price.get(move_pid) or latest_price.get(str(raw))
                price = float(lp[1]) if (lp and lp[1] is not None) else float(l.get("price_unit") or 0)
                line_note = ((l.get("custom_data") or {}).get("note") or "") if isinstance(l.get("custom_data"), dict) else ""
                move_payload = {
                    "name": l.get("name") or "",
                    "state": "draft",
                    "product_id": move_pid,
                    "product_uom_qty": ordered_qty,
                    "quantity": delivered_qty,
                    "price_unit": price,
                    "picking_id": picking_id,
                    "sale_line_id": l.get("id"),
                    "location_id": src_id,
                    "location_dest_id": dst_id,
                    "custom_data": {"note": line_note},
                }
                m = ctx.db.insert("stock_moves", move_payload) or {}
                move_results.append({"line_id": l.get("id"), "move_id": m.get("id") or m.get("data", {}).get("id"), "price_unit": price})

            ctx.db.update("sale_orders", oid, {"state": "sale"})
            results.append({"order_id": oid, "picking_id": picking_id, "moves": move_results})

        except Exception as e:
            msg = str(e)
            # 抓最有意義的根因（NOT NULL / column / constraint），避免被 sqlalchemy 包裝訊息淹沒
            short = msg
            for marker in ["null value", "violates", "DataError", "DatatypeMismatch", "UndefinedColumn"]:
                idx = msg.find(marker)
                if idx >= 0:
                    short = msg[idx:idx+300]; break
            errors.append({"order_id": oid, "error": short[:400]})

    ctx.response.json({
        "confirmed": len(results),
        "errors": len(errors),
        "results": results,
        "error_details": errors,
    })
