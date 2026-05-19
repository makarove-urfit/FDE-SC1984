# ── 統編驗證共用邏輯 ──
# 注意：AI GO action 無跨檔 import，update_customer.py 須持一份完全一致的副本。
_VAT_WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1]


def _validate_vat_format(vat):
    """台灣統一編號格式 + 檢查碼驗證。回傳 (ok: bool, err: str)。"""
    v = (vat or "").strip()
    if not v:
        return False, "統編為必填"
    if len(v) != 8 or not v.isdigit():
        return False, f"統編須為 8 位數字（收到「{vat}」）"
    total = 0
    for i in range(8):
        product = int(v[i]) * _VAT_WEIGHTS[i]
        total += product // 10 + product % 10
    if total % 5 == 0:
        return True, ""
    if v[6] == "7" and (total + 1) % 5 == 0:
        return True, ""
    return False, f"「{v}」不是有效的統一編號（檢查碼不符）"


def _conflict_label(c):
    """組出衝突客戶的可讀標示。"""
    name = (c.get("name") or "").strip() or "（未命名客戶）"
    ref = (c.get("ref") or "").strip()
    return f"{name}（編碼 {ref}）" if ref else name


def _find_vat_owner(customers, vat, exclude_id=None):
    """在 customers 清單中找出已使用該統編的客戶，回傳客戶 dict 或 None。"""
    v = (vat or "").strip()
    if not v:
        return None
    ex = str(exclude_id or "")
    for c in customers:
        if str(c.get("id")) == ex:
            continue
        if (c.get("vat") or "").strip() == v:
            return c
    return None


def execute(ctx):
    import uuid, re

    EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
    p = ctx.params

    headquarters_id = str(p.get("headquarters_id") or "").strip()
    headquarters_name = (p.get("headquarters_name") or "").strip()
    branches = p.get("branches")

    if not isinstance(branches, list) or len(branches) == 0:
        ctx.response.json({"error": "至少需要一間分店"})
        return

    create_hq = not headquarters_id
    if create_hq and not headquarters_name:
        ctx.response.json({"error": "公司名稱為必填"})
        return

    hq_vat = (p.get("vat") or "").strip()
    hq_email = (p.get("email") or "").strip()
    payment_term = (p.get("payment_term") or "").strip()
    salesperson_id = p.get("salesperson_id") or ""
    invoice_format = (p.get("invoice_format") or "").strip()
    owner_name = (p.get("owner_name") or "").strip()

    if hq_email and not EMAIL_RE.match(hq_email):
        ctx.response.json({"error": "公司 Email 格式不正確"})
        return

    # ── 第一階段：先驗證全部，全過才寫 ──

    # 1a. 統編格式 + 檢查碼
    if create_hq:
        ok, err = _validate_vat_format(hq_vat)
        if not ok:
            ctx.response.json({"error": f"公司統編：{err}"})
            return

    norm_branches = []
    for idx, b in enumerate(branches):
        bname = (b.get("branch_name") or "").strip()
        if not bname:
            ctx.response.json({"error": f"第 {idx + 1} 間分店店名為必填"})
            return
        bvat = (b.get("vat") or "").strip()
        ok, err = _validate_vat_format(bvat)
        if not ok:
            ctx.response.json({"error": f"分店「{bname}」統編：{err}"})
            return
        bcontact_email = (b.get("contact_email") or "").strip()
        if bcontact_email and not EMAIL_RE.match(bcontact_email):
            ctx.response.json({"error": f"分店「{bname}」聯絡人 Email 格式不正確"})
            return
        norm_branches.append({
            "branch_name": bname,
            "vat": bvat,
            "phone": (b.get("phone") or "").strip(),
            "contact_address": (b.get("contact_address") or "").strip(),
            "region_tag_id": b.get("region_tag_id") or "",
            "contact_name": (b.get("contact_name") or "").strip(),
            "contact_phone": (b.get("contact_phone") or "").strip(),
            "contact_email": bcontact_email,
        })

    # 1b. 查重（比對既有 customers）
    customers = ctx.db.query("customers", limit=5000) or []
    to_check = []
    if create_hq:
        to_check.append(("公司", headquarters_name, hq_vat))
    for nb in norm_branches:
        to_check.append(("分店", nb["branch_name"], nb["vat"]))

    for kind_label, name_label, vat_val in to_check:
        dup = _find_vat_owner(customers, vat_val)
        if dup:
            ctx.response.json({"error": f"{kind_label}「{name_label}」的統編 {vat_val} 已被「{_conflict_label(dup)}」使用，無法重複建檔"})
            return

    # 1c. 本批之內互撞
    seen = {}
    for _, name_label, vat_val in to_check:
        if vat_val in seen:
            ctx.response.json({"error": f"本次新增的「{seen[vat_val]}」與「{name_label}」統編皆為 {vat_val}，不可重複"})
            return
        seen[vat_val] = name_label

    # ── 第二階段：全部通過，開始 insert ──
    created_ids = []

    # 既有總公司模式：驗證該總公司確實存在（ARCHITECTURE §0.1 要求應用層自驗 parent）
    if not create_hq:
        hq_exists = any(str(c.get("id")) == headquarters_id for c in customers)
        if not hq_exists:
            ctx.response.json({"error": f"指定的總公司 {headquarters_id} 不存在"})
            return

    if create_hq:
        hq_data = {
            "name": headquarters_name,
            "customer_type": "company",
            "is_company": True,
            "vat": hq_vat,
            "custom_data": {"kind": "headquarters", "invoice_format": invoice_format},
        }
        if hq_email:
            hq_data["email"] = hq_email
        if payment_term:
            hq_data["payment_term"] = payment_term
        if salesperson_id:
            hq_data["salesperson_id"] = salesperson_id
        hq = ctx.db.insert("customers", hq_data)
        if not hq or not hq.get("id"):
            ctx.response.json({"error": "建立公司記錄失敗"})
            return
        hq_id = str(hq["id"])
        created_ids.append(hq_id)
    else:
        hq_id = headquarters_id

    branch_results = []
    for nb in norm_branches:
        invite_token = str(uuid.uuid4())
        branch_custom = {
            "kind": "branch",
            "parent_customer_id": hq_id,
            "invite_token": invite_token,
        }
        if nb["contact_email"]:
            branch_custom["contact_email"] = nb["contact_email"]
        if nb["region_tag_id"]:
            branch_custom["region_tag_id"] = nb["region_tag_id"]
        branch_data = {
            "name": nb["branch_name"],
            "customer_type": "individual",
            "is_company": False,
            "vat": nb["vat"],
            "custom_data": branch_custom,
        }
        if nb["contact_address"]:
            branch_data["contact_address"] = nb["contact_address"]
        if nb["phone"]:
            branch_data["phone"] = nb["phone"]
        branch = ctx.db.insert("customers", branch_data)
        if not branch or not branch.get("id"):
            ctx.response.json({"error": f"建立分店「{nb['branch_name']}」失敗"})
            return
        branch_id = str(branch["id"])
        created_ids.append(branch_id)

        contact_id = None
        if nb["contact_name"]:
            contact_data = {
                "name": nb["contact_name"],
                "customer_type": "individual",
                "is_company": False,
                "custom_data": {"kind": "role", "role": "contact", "parent_customer_id": branch_id},
            }
            if nb["contact_phone"]:
                contact_data["phone"] = nb["contact_phone"]
            c = ctx.db.insert("customers", contact_data)
            if c and c.get("id"):
                contact_id = str(c["id"])
                created_ids.append(contact_id)

        if nb["region_tag_id"]:
            try:
                ctx.db.insert("customer_tag_rel", {"customer_id": branch_id, "tag_id": nb["region_tag_id"]})
            except Exception:
                pass

        branch_results.append({
            "branch_id": branch_id,
            "region_tag_id": nb["region_tag_id"],
            "contact_id": contact_id,
            "invite_token": invite_token,
        })

    owner_id = None
    if create_hq and owner_name:
        owner_data = {
            "name": owner_name,
            "customer_type": "individual",
            "is_company": False,
            "custom_data": {"kind": "role", "role": "owner", "parent_customer_id": hq_id},
        }
        o = ctx.db.insert("customers", owner_data)
        if o and o.get("id"):
            owner_id = str(o["id"])
            created_ids.append(owner_id)

    # ── 第三階段：並發退讓檢查 ──
    # 平台無 unique constraint：寫入後 re-query，若同統編出現多筆，
    # 以 id 字典序最小者為保留者，其餘退讓 → 本 bundle 刪除全部已建記錄。
    post = ctx.db.query("customers", limit=5000) or []
    for _, _, vat_val in to_check:
        rows = [c for c in post if (c.get("vat") or "").strip() == vat_val]
        if len(rows) > 1:
            keeper = sorted(str(c.get("id")) for c in rows)[0]
            mine = {cid for cid in created_ids} & {str(c.get("id")) for c in rows}
            if any(cid != keeper for cid in mine):
                for cid in created_ids:
                    try:
                        ctx.db.remove("customers", cid)
                    except Exception:
                        pass
                ctx.response.json({"error": f"統編 {vat_val} 發生並發建檔衝突，本次建檔已取消，請重試"})
                return

    ctx.response.json({
        "success": True,
        "headquarters_id": hq_id,
        "branches": branch_results,
        "owner_id": owner_id,
    })
