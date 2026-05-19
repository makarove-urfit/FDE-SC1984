# ── 統編驗證共用邏輯 ──
# 注意：此區塊與 create_customer_bundle.py 的同名函式必須保持完全一致。
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


def execute(ctx):
    p = ctx.params
    customer_id = str(p.get("customer_id") or "").strip()
    fields = p.get("fields")

    if not customer_id:
        ctx.response.json({"error": "customer_id 為必填"})
        return
    if not isinstance(fields, dict) or not fields:
        ctx.response.json({"error": "fields 為必填且須為物件"})
        return

    customers = ctx.db.query("customers", limit=5000) or []
    cust = next((c for c in customers if str(c.get("id")) == customer_id), None)
    if not cust:
        ctx.response.json({"error": f"客戶 {customer_id} 不存在"})
        return

    kind = ((cust.get("custom_data") or {}).get("kind") or "").strip()
    old_vat = (cust.get("vat") or "").strip()
    vat_changing = "vat" in fields
    new_vat = (fields.get("vat") or "").strip() if vat_changing else old_vat

    if vat_changing and new_vat != old_vat:
        # 總公司 / 分店統編必填且須合法；其他 kind 有填才驗格式
        if kind in ("headquarters", "branch") or new_vat:
            ok, err = _validate_vat_format(new_vat)
            if not ok:
                ctx.response.json({"error": err})
                return
        # 查重（排除自己）
        if new_vat:
            dup = next(
                (c for c in customers
                 if str(c.get("id")) != customer_id and (c.get("vat") or "").strip() == new_vat),
                None,
            )
            if dup:
                ctx.response.json({"error": f"統編 {new_vat} 已被「{_conflict_label(dup)}」使用，無法重複建檔"})
                return

    # 寫入
    try:
        ctx.db.update("customers", customer_id, fields)
    except Exception as e:
        ctx.response.json({"error": f"更新客戶失敗：{e}"})
        return

    # 並發退讓：若同統編出現多筆且自己非保留者 → 把 vat 回退為原值
    if vat_changing and new_vat and new_vat != old_vat:
        post = ctx.db.query("customers", limit=5000) or []
        rows = [c for c in post if (c.get("vat") or "").strip() == new_vat]
        if len(rows) > 1:
            keeper = sorted(str(c.get("id")) for c in rows)[0]
            if customer_id != keeper:
                try:
                    ctx.db.update("customers", customer_id, {"vat": old_vat})
                except Exception:
                    pass
                ctx.response.json({"error": f"統編 {new_vat} 發生並發建檔衝突，已回退，請重試"})
                return

    ctx.response.json({"success": True})
