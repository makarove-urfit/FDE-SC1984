# 分店統一編號 + 統編防呆檢核 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓分店可設定自己的統一編號，並把客戶建檔/編輯收斂到 server-side action，硬擋重複統編與格式錯誤。

**Architecture:** 帶統編的客戶寫入全部改走 2 個 server-side action（`create_customer_bundle` 改造、`update_customer` 新增）。Action 內做「格式 + 檢查碼驗證 → 跨表查重 → 寫入 → 並發退讓檢查」。前端 `CustomersPage.tsx` 的三處表單加統編欄位、送出改呼叫 action。

**Tech Stack:** Python（AI GO action 沙箱，單檔 `execute(ctx)`）、React/TSX、AI GO 平台 proxy API。

**設計來源：** `docs/superpowers/specs/2026-05-19-branch-vat-dedup-design.md`

---

## 重要前提（每個 Task 都適用）

- **嚴禁修改 `demo/` 資料夾。**
- AI GO action 是獨立單檔，**沒有跨檔 import 機制** —— 共用函式（檢查碼驗證）需在每個 action 檔各放一份，且必須**保持一致**。
- 部署測試流程：`set -a && source .env && set +a` 後執行 `python3 vfs/scripts/deploy_admin.py --no-publish`（只上傳不發布），再以 `use_dev=true` 跑 action 測試。確認無誤才不帶旗標重跑一次發布。
- 客戶數量上限：`ctx.db.query("customers", limit=5000)`，沿用 `assign_customer_code.py` 既有慣例。
- Commit message 說明「為什麼」。禁止 `--no-verify`。

## 檔案結構

| 檔案 | 動作 | 責任 |
|---|---|---|
| `vfs/admin/actions/create_customer_bundle.py` | 改造 | 新增客戶（總公司+分店+聯絡人+負責人）或對既有總公司加分店；統編驗證+查重+並發退讓 |
| `vfs/admin/actions/update_customer.py` | 新增 | 編輯單筆客戶；若改統編則驗證+查重+並發退讓 |
| `vfs/admin/actions/manifest.json` | 修改 | 註冊 `update_customer` |
| `vfs/admin/src/utils/vat.ts` | 新增 | 前端統編格式即時提示（友善第一層，非權威） |
| `vfs/admin/src/pages/admin/CustomersPage.tsx` | 修改 | 三處表單加統編欄位、送出改走 action、列表顯示分店統編 |
| `vfs/scripts/test_vat_checksum.py` | 新增 | 檢查碼純函式本地單元測試 |
| `vfs/scripts/test_customer_vat.py` | 新增 | action 端對端測試（比照 `test_customer_code.py`） |
| `ARCHITECTURE.md` | 修改 | 更新 §0.1 / §0.123 統編敘述 |

---

## Task 1: 統編檢查碼驗證純函式（本地 TDD）

把台灣統一編號檢查碼演算法做成純函式，放進 `create_customer_bundle.py` 模組層級，並以本地單元測試驗證。後續 Task 3/4 直接沿用。

**Files:**
- Modify: `vfs/admin/actions/create_customer_bundle.py`（在檔首加模組層級函式）
- Test: `vfs/scripts/test_vat_checksum.py`

- [ ] **Step 1: 寫失敗測試**

Create `vfs/scripts/test_vat_checksum.py`:

```python
"""統編檢查碼純函式單元測試（本地、不需平台）。
Run: python3 vfs/scripts/test_vat_checksum.py
"""
import os, importlib.util

ACTION_FILE = os.path.join(os.path.dirname(__file__), "..", "admin", "actions", "create_customer_bundle.py")


def _load_validator():
    spec = importlib.util.spec_from_file_location("create_customer_bundle", ACTION_FILE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod._validate_vat_format


def main():
    validate = _load_validator()

    # 合法統編（檢查碼相符）
    ok, err = validate("04595257")  # 台積電
    assert ok is True, f"04595257 應為合法統編，err={err}"

    # 合法統編（第 7 碼為 7 的特例）
    ok, err = validate("12345675")
    assert ok is True, f"12345675 應透過第7碼特例判為合法，err={err}"

    # 非法：檢查碼不符
    ok, err = validate("12345678")
    assert ok is False, "12345678 檢查碼不符，應為非法"
    assert "檢查碼" in err

    # 非法：非 8 位
    ok, err = validate("1234567")
    assert ok is False and "8 位" in err

    # 非法：含非數字
    ok, err = validate("1234567X")
    assert ok is False and "8 位" in err

    # 非法：空值
    ok, err = validate("")
    assert ok is False and "必填" in err

    # 前後空白應被容忍（trim 後判斷）
    ok, err = validate("  04595257  ")
    assert ok is True, f"前後空白應 trim，err={err}"

    print("🎉 test_vat_checksum 全數通過")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `python3 vfs/scripts/test_vat_checksum.py`
Expected: FAIL — `AttributeError: module 'create_customer_bundle' has no attribute '_validate_vat_format'`

- [ ] **Step 3: 加入檢查碼函式**

在 `vfs/admin/actions/create_customer_bundle.py` **檔案最上方**（`def execute` 之前）加入：

```python
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
```

- [ ] **Step 4: 執行測試確認通過**

Run: `python3 vfs/scripts/test_vat_checksum.py`
Expected: PASS — `🎉 test_vat_checksum 全數通過`

- [ ] **Step 5: Commit**

```bash
git add vfs/scripts/test_vat_checksum.py vfs/admin/actions/create_customer_bundle.py
git commit -m "feat(admin): 統編檢查碼驗證純函式，防呆需要可靠的格式關卡"
```

---

## Task 2: 端對端測試腳本 `test_customer_vat.py`

比照 `test_customer_code.py` 寫 action 端對端測試。此測試在 Task 3/4 完成、Task 5 部署前**會失敗**——這是 action 層的紅燈。

**Files:**
- Test: `vfs/scripts/test_customer_vat.py`

- [ ] **Step 1: 寫測試腳本**

Create `vfs/scripts/test_customer_vat.py`:

```python
"""End-to-end test for create_customer_bundle + update_customer 統編防呆。
Run: set -a && source .env && set +a && python3 vfs/scripts/test_customer_vat.py
"""
from test_lib import api_login, qquery, run_action, ADMIN_APP


def _vat_ok(v):
    """與 action 端 _validate_vat_format 等價的本地檢查（測試自用）。"""
    if len(v) != 8 or not v.isdigit():
        return False
    w = [1, 2, 1, 2, 1, 2, 4, 1]
    t = sum((int(v[i]) * w[i]) // 10 + (int(v[i]) * w[i]) % 10 for i in range(8))
    return t % 5 == 0 or (v[6] == "7" and (t + 1) % 5 == 0)


def _gen_valid_vats(n, used):
    """產生 n 個合法且未被使用的統編，從高位數往下找以避開線上資料。"""
    out, cand = [], 99999999
    while len(out) < n and cand > 90000000:
        s = str(cand)
        if _vat_ok(s) and s not in used:
            out.append(s)
        cand -= 1
    assert len(out) == n, "無法產生足夠的測試統編"
    return out


def _body(r):
    return (r or {}).get("result") or r or {}


def main():
    h = api_login()
    print("✅ login ok")

    # 蒐集現有統編，避開衝突
    existing = qquery(h, ADMIN_APP, "customers", [])
    used = {(c.get("vat") or "").strip() for c in existing if (c.get("vat") or "").strip()}
    v1, v2, v3 = _gen_valid_vats(3, used)
    print(f"✅ 測試統編：{v1} {v2} {v3}")

    created = []
    try:
        # ── Test 1: 合法統編新增客戶（總公司 + 分店）──
        s, r = run_action(h, ADMIN_APP, "create_customer_bundle", {
            "headquarters_name": f"統編測試公司-{v1}",
            "vat": v1,
            "branches": [{"branch_name": f"統編測試分店-{v2}", "vat": v2}],
        })
        b = _body(r)
        assert s == 200 and b.get("success") is True, f"建檔應成功：{s} {b}"
        hq_id = str(b["headquarters_id"])
        branch_id = str(b["branches"][0]["branch_id"])
        created += [hq_id, branch_id]
        print(f"✅ 合法統編建檔成功 hq={hq_id} branch={branch_id}")

        # 驗證分店 vat 寫入自己那列
        rows = qquery(h, ADMIN_APP, "customers", [{"column": "id", "op": "eq", "value": branch_id}])
        assert rows and (rows[0].get("vat") or "").strip() == v2, f"分店 vat 應為 {v2}：{rows}"
        print("✅ 分店統編寫入分店自己那列")

        # ── Test 2: 重複統編硬擋（用 v1 再建）──
        s, r = run_action(h, ADMIN_APP, "create_customer_bundle", {
            "headquarters_name": "重複統編公司",
            "vat": v1,
            "branches": [{"branch_name": "重複統編分店", "vat": v3}],
        })
        b = _body(r)
        assert "error" in b and "已被" in b["error"], f"重複統編應被擋：{b}"
        print(f"✅ 重複統編被硬擋：{b['error']}")

        # ── Test 3: 非法檢查碼被擋 ──
        s, r = run_action(h, ADMIN_APP, "create_customer_bundle", {
            "headquarters_name": "非法統編公司",
            "vat": "12345678",
            "branches": [{"branch_name": "x", "vat": v3}],
        })
        b = _body(r)
        assert "error" in b and "統一編號" in b["error"], f"非法檢查碼應被擋：{b}"
        print("✅ 非法檢查碼被擋")

        # ── Test 4: 分店空統編被擋（必填）──
        s, r = run_action(h, ADMIN_APP, "create_customer_bundle", {
            "headquarters_name": "缺統編公司",
            "vat": v3,
            "branches": [{"branch_name": "缺統編分店", "vat": ""}],
        })
        b = _body(r)
        assert "error" in b and "必填" in b["error"], f"分店空統編應被擋：{b}"
        print("✅ 分店空統編被擋")

        # ── Test 5: 同次新增多分店統編互撞被擋 ──
        s, r = run_action(h, ADMIN_APP, "create_customer_bundle", {
            "headquarters_name": "互撞公司",
            "vat": v3,
            "branches": [
                {"branch_name": "互撞分店A", "vat": v3},
                {"branch_name": "互撞分店B", "vat": v3},
            ],
        })
        b = _body(r)
        assert "error" in b, f"本批互撞應被擋：{b}"
        print("✅ 同批統編互撞被擋")

        # ── Test 6: update_customer 改統編成重複 → 擋 ──
        s, r = run_action(h, ADMIN_APP, "update_customer", {
            "customer_id": branch_id,
            "fields": {"vat": v1},  # v1 已被總公司用
        })
        b = _body(r)
        assert "error" in b and "已被" in b["error"], f"編輯改成重複統編應被擋：{b}"
        print("✅ 編輯改成重複統編被擋")

        # ── Test 7: update_customer 改成合法新統編 → 成功 ──
        s, r = run_action(h, ADMIN_APP, "update_customer", {
            "customer_id": branch_id,
            "fields": {"vat": v3},
        })
        b = _body(r)
        assert s == 200 and b.get("success") is True, f"編輯改合法新統編應成功：{b}"
        rows = qquery(h, ADMIN_APP, "customers", [{"column": "id", "op": "eq", "value": branch_id}])
        assert (rows[0].get("vat") or "").strip() == v3, f"vat 應更新為 {v3}：{rows}"
        print("✅ 編輯改合法新統編成功")

        # ── Test 8: 對既有總公司加分店（headquarters_id 模式）──
        s, r = run_action(h, ADMIN_APP, "create_customer_bundle", {
            "headquarters_id": hq_id,
            "branches": [{"branch_name": f"加掛分店-{v2}", "vat": v2}],
        })
        b = _body(r)
        assert s == 200 and b.get("success") is True, f"加掛分店應成功：{b}"
        created.append(str(b["branches"][0]["branch_id"]))
        print("✅ 對既有總公司加分店成功")

        print("🎉 test_customer_vat 全數通過")

    finally:
        if created:
            try:
                s, r = run_action(h, ADMIN_APP, "crud_delete", {"table": "customers", "ids": created})
                print(f"🧹 cleanup customers: {_body(r)}")
            except Exception as e:
                print(f"⚠️ cleanup: {e}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Commit**

```bash
git add vfs/scripts/test_customer_vat.py
git commit -m "test(admin): 統編防呆端對端測試，先立紅燈再實作 action"
```

---

## Task 3: 改造 `create_customer_bundle.py`

整檔重寫：支援 `branches` 陣列、`headquarters_id` 模式（加分店）、統編「先驗全部、全過才寫」、並發退讓。`_validate_vat_format`（Task 1 已加）保留不動。

**Files:**
- Modify: `vfs/admin/actions/create_customer_bundle.py`

- [ ] **Step 1: 整檔覆寫**

把 `vfs/admin/actions/create_customer_bundle.py` 全檔內容換成：

```python
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
```

- [ ] **Step 2: 編譯檢查（本地語法）**

Run: `python3 -c "import ast; ast.parse(open('vfs/admin/actions/create_customer_bundle.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 3: 重跑檢查碼單元測試（確保 Task 1 函式未被破壞）**

Run: `python3 vfs/scripts/test_vat_checksum.py`
Expected: PASS — `🎉 test_vat_checksum 全數通過`

- [ ] **Step 4: Commit**

```bash
git add vfs/admin/actions/create_customer_bundle.py
git commit -m "feat(admin): create_customer_bundle 收編統編驗證查重，硬擋重複建檔"
```

---

## Task 4: 新增 `update_customer.py` action

編輯客戶的 server-side action。改統編時做驗證+查重+並發退讓。

**Files:**
- Create: `vfs/admin/actions/update_customer.py`
- Modify: `vfs/admin/actions/manifest.json`

- [ ] **Step 1: 建立 action 檔**

Create `vfs/admin/actions/update_customer.py`:

```python
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
```

- [ ] **Step 2: 註冊到 manifest.json**

在 `vfs/admin/actions/manifest.json` 的 `create_customer_bundle` 條目後加入（注意前一條目尾端補逗號）：

```json
  "update_customer": {
    "description": "編輯單筆客戶；若更動統編則做格式檢查碼驗證、跨表查重（排除自己）與並發退讓"
  },
```

- [ ] **Step 3: 編譯檢查**

Run: `python3 -c "import ast, json; ast.parse(open('vfs/admin/actions/update_customer.py').read()); json.load(open('vfs/admin/actions/manifest.json')); print('OK')"`
Expected: `OK`

- [ ] **Step 4: 驗證兩份 `_validate_vat_format` 一致**

Run:
```bash
python3 -c "
import re
def grab(f):
    s = open(f).read()
    a = s.index('def _validate_vat_format')
    b = s.index('\n\n\n', a)
    return s[a:b]
x = grab('vfs/admin/actions/create_customer_bundle.py')
y = grab('vfs/admin/actions/update_customer.py')
assert x == y, '兩份 _validate_vat_format 不一致！'
print('一致 OK')
"
```
Expected: `一致 OK`

- [ ] **Step 5: Commit**

```bash
git add vfs/admin/actions/update_customer.py vfs/admin/actions/manifest.json
git commit -m "feat(admin): 新增 update_customer action，編輯改統編也走查重防呆"
```

---

## Task 5: 部署 action 並跑端對端測試至綠

**Files:** 無（部署與測試）

- [ ] **Step 1: 上傳 VFS（不發布）**

Run: `set -a && source .env && set +a && python3 vfs/scripts/deploy_admin.py --no-publish`
Expected: 步驟 1-4 成功，最後印出 `⏭️  略過發布（--no-publish）`

- [ ] **Step 2: 跑端對端測試**

Run: `set -a && source .env && set +a && python3 vfs/scripts/test_customer_vat.py`
Expected: PASS — `🎉 test_customer_vat 全數通過`，且最後印出 `🧹 cleanup customers`

- [ ] **Step 3: 若失敗——系統性除錯**

依測試輸出定位失敗的 Test 編號，回對應 action 檔修正，重跑 Step 1-2。最多 3 次仍失敗則停下重新評估設計。

- [ ] **Step 4: Commit（若 Step 3 有修正）**

```bash
git add vfs/admin/actions/
git commit -m "fix(admin): 修正統編 action 實測發現的問題"
```

---

## Task 6: 前端統編格式提示 helper `vat.ts`

前端的「友善第一層提示」，非權威——真正的擋以 action 回應為準。

**Files:**
- Create: `vfs/admin/src/utils/vat.ts`

- [ ] **Step 1: 建立 helper**

Create `vfs/admin/src/utils/vat.ts`:

```typescript
// 統一編號格式提示（前端友善檢查；權威驗證在 server-side action）
const WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1];

/** 回傳格式錯誤訊息；格式正確時回傳空字串。 */
export function vatFormatHint(vat: string): string {
  const v = (vat || '').trim();
  if (!v) return '';
  if (!/^\d{8}$/.test(v)) return '統編須為 8 位數字';
  let total = 0;
  for (let i = 0; i < 8; i++) {
    const product = Number(v[i]) * WEIGHTS[i];
    total += Math.floor(product / 10) + (product % 10);
  }
  const ok = total % 5 === 0 || (v[6] === '7' && (total + 1) % 5 === 0);
  return ok ? '' : '統編檢查碼不正確';
}
```

- [ ] **Step 2: Commit**

```bash
git add vfs/admin/src/utils/vat.ts
git commit -m "feat(admin): 前端統編格式提示 helper，送出前先給友善回饋"
```

---

## Task 7: 前端表單加統編欄位（三處）+ 列表顯示

**Files:**
- Modify: `vfs/admin/src/pages/admin/CustomersPage.tsx`

- [ ] **Step 1: 型別與初值加 `vat`**

`CustomersPage.tsx` 將 `BranchEntry` 型別（約 line 25-28）改為：

```typescript
type BranchEntry = {
  branch_name: string; vat: string; phone: string; contact_address: string; region_tag_id: string;
  contact_name: string; contact_phone: string; contact_email: string;
};
```

`EMPTY_BRANCH`（約 line 30-33）改為：

```typescript
const EMPTY_BRANCH: BranchEntry = {
  branch_name: '', vat: '', phone: '', contact_address: '', region_tag_id: '',
  contact_name: '', contact_phone: '', contact_email: '',
};
```

`EMPTY_EDIT_BRANCH`（約 line 44-46）改為：

```typescript
const EMPTY_EDIT_BRANCH = {
  name: '', vat: '', short_name: '', phone: '', contact_address: '', region_tag_id: '', contact_email: '',
};
```

- [ ] **Step 2: import vat helper**

在檔首 import 區（`import { planRouteChange } ...` 之後）加入：

```typescript
import { vatFormatHint } from '../../utils/vat';
```

- [ ] **Step 3: 新增客戶表單——分店區塊加統編欄位**

在 `branchEntries.map` 的店名/市話 grid（約 line 845-856），把店名那一格之後、市話那一格之前不動，改成在該 grid **下方**新增一列統編。將 line 856 的 `</div>`（grid 收尾）之後、地址 `<div>` 之前插入：

```tsx
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">統編 <span className="text-red-500">*</span></label>
                        <input type="text" value={b.vat} onChange={fb(i, 'vat')}
                          placeholder="8 位數字" className={inputCls} />
                        {b.vat.trim() && vatFormatHint(b.vat) && (
                          <p className="text-xs text-red-500 mt-1">{vatFormatHint(b.vat)}</p>
                        )}
                      </div>
```

- [ ] **Step 4: 加分店 Modal 加統編欄位**

在 `addBranchTarget` modal 的店名/市話 grid（約 line 922-935）收尾 `</div>` 之後、地址 `<div>` 之前插入：

```tsx
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">統編 <span className="text-red-500">*</span></label>
                <input type="text" value={addBranchForm.vat}
                  onChange={e => setAddBranchForm(p => ({ ...p, vat: e.target.value }))}
                  placeholder="8 位數字" className={inputCls} />
                {addBranchForm.vat.trim() && vatFormatHint(addBranchForm.vat) && (
                  <p className="text-xs text-red-500 mt-1">{vatFormatHint(addBranchForm.vat)}</p>
                )}
              </div>
```

- [ ] **Step 5: 編輯分店 Modal 加統編欄位**

在編輯分店表單，店名 `<div>`（約 line 637-639）之後、採購單顯示簡稱 `<div>` 之前插入：

```tsx
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">統編 <span className="text-red-500">*</span></label>
                    <input type="text" value={editBranch.vat} onChange={e => setEditBranch(p => ({ ...p, vat: e.target.value }))} className={inputCls} />
                    {editBranch.vat.trim() && vatFormatHint(editBranch.vat) && (
                      <p className="text-xs text-red-500 mt-1">{vatFormatHint(editBranch.vat)}</p>
                    )}
                  </div>
```

- [ ] **Step 6: `openEditBranch` 帶入 vat**

`openEditBranch` 函式（約 line 177-188）的 `setEditBranch({...})` 呼叫，把 `name: b.name || '',` 之後加一行，使物件變成：

```typescript
    setEditBranch({
      name: b.name || '',
      vat: b.vat || '',
      short_name: b.short_name || '',
      phone: b.phone || '',
      contact_address: b.contact_address || '',
      region_tag_id: String(cd.region_tag_id || ''),
      contact_email: String(cd.contact_email || ''),
    });
```

- [ ] **Step 7: 總公司新增/編輯統編欄位補必填紅星**

新增表單總公司統編 label（約 line 770）改為：
```tsx
                      <label className="block text-sm font-medium text-gray-700 mb-1">統編 <span className="text-red-500">*</span></label>
```
編輯總公司統編 label（約 line 600）同樣補上 `<span className="text-red-500">*</span>`。

- [ ] **Step 8: 列表分店列顯示統編**

分店列（約 line 546）目前是空的 `<td className="px-4 py-2" colSpan={2}></td>`，改為：

```tsx
                              <td className="px-4 py-2 text-xs text-gray-500" colSpan={2}>
                                {b.vat ? <span>統編 {b.vat}</span> : <span className="text-gray-300">無統編</span>}
                              </td>
```

- [ ] **Step 9: 編譯驗證**

Run: `cd vfs/admin && npx tsc --noEmit`
Expected: 無錯誤（若專案無此指令，改用 `npm run build` 的型別檢查步驟）

- [ ] **Step 10: Commit**

```bash
git add vfs/admin/src/pages/admin/CustomersPage.tsx
git commit -m "feat(admin): 分店表單三處加統編欄位，列表顯示分店統編"
```

---

## Task 8: 前端送出改走 action

把 `submit` / `submitAddBranch` / `saveEdit` 改成呼叫 server-side action，移除直連 `db.insert`/`db.update` customers。

**Files:**
- Modify: `vfs/admin/src/pages/admin/CustomersPage.tsx`

- [ ] **Step 1: 改寫 `submit`**

把 `submit` 函式（約 line 381-428）整個換成：

```typescript
  const submit = async () => {
    if (!companyForm.headquarters_name.trim()) { setFormError('公司名稱為必填'); return; }
    if (companyForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyForm.email.trim())) {
      setFormError('公司 Email 格式不正確'); return;
    }
    if (vatFormatHint(companyForm.vat)) { setFormError(`公司統編：${vatFormatHint(companyForm.vat)}`); return; }
    if (!companyForm.vat.trim()) { setFormError('公司統編為必填'); return; }
    const validBranches = branchEntries.filter(b => b.branch_name.trim());
    if (validBranches.length === 0) { setFormError('至少需要一間分店（請至少填一個店名）'); return; }
    for (const b of validBranches) {
      if (!b.vat.trim()) { setFormError(`分店「${b.branch_name}」統編為必填`); return; }
      if (vatFormatHint(b.vat)) { setFormError(`分店「${b.branch_name}」統編：${vatFormatHint(b.vat)}`); return; }
      if (b.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.contact_email.trim())) {
        setFormError(`分店「${b.branch_name}」的聯絡 Email格式不正確`); return;
      }
    }
    setSaving(true); setFormError('');
    try {
      const res = await db.runAction('create_customer_bundle', {
        headquarters_name: companyForm.headquarters_name.trim(),
        vat: companyForm.vat.trim(),
        email: companyForm.email.trim(),
        payment_term: companyForm.payment_term,
        salesperson_id: companyForm.salesperson_id,
        invoice_format: companyForm.invoice_format,
        owner_name: companyForm.owner_name.trim(),
        branches: validBranches.map(b => ({
          branch_name: b.branch_name.trim(),
          vat: b.vat.trim(),
          phone: b.phone.trim(),
          contact_address: b.contact_address.trim(),
          region_tag_id: b.region_tag_id,
          contact_name: b.contact_name.trim(),
          contact_phone: b.contact_phone.trim(),
          contact_email: b.contact_email.trim(),
        })),
      });
      if (res?.error) { setFormError(res.error); setSaving(false); return; }
      await assignCodesForBranches(res?.branches || []);
      setShowForm(false);
      setCompanyForm({ ...EMPTY_COMPANY });
      setBranchEntries([{ ...EMPTY_BRANCH }]);
      await load();
    } catch (e: any) {
      setFormError(e?.message || '新增失敗');
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 2: 加入 `assignCodesForBranches` helper 並移除 `insertBranchAndContact`**

刪除整個 `insertBranchAndContact` 函式（約 line 337-379）。在同位置新增：

```typescript
  // bundle action 已建好分店；此處依各分店路線自動發放客戶編碼（失敗不阻斷）
  const assignCodesForBranches = async (
    branches: { branch_id: string; region_tag_id: string }[],
  ) => {
    for (const br of branches) {
      if (!br.region_tag_id || !br.branch_id) continue;
      try {
        const r = await db.runAction('assign_customer_code', {
          customer_id: String(br.branch_id),
          route_tag_id: String(br.region_tag_id),
        });
        if (r?.error) {
          alert(`分店已建立，但客戶編碼自動發放失敗：${r.error}\n請至客戶頁手動補發。`);
        }
      } catch (e: any) {
        alert(`分店已建立，但客戶編碼自動發放失敗：${e?.message || e}\n請至客戶頁手動補發。`);
      }
    }
  };
```

- [ ] **Step 3: 改寫 `submitAddBranch`**

把 `submitAddBranch` 函式（約 line 430-448）整個換成：

```typescript
  const submitAddBranch = async () => {
    if (!addBranchTarget) return;
    if (!addBranchForm.branch_name.trim()) { setAddBranchError('店名為必填'); return; }
    if (!addBranchForm.vat.trim()) { setAddBranchError('統編為必填'); return; }
    if (vatFormatHint(addBranchForm.vat)) { setAddBranchError(`統編：${vatFormatHint(addBranchForm.vat)}`); return; }
    if (addBranchForm.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addBranchForm.contact_email.trim())) {
      setAddBranchError('聯絡 Email格式不正確'); return;
    }
    setAddBranchSaving(true); setAddBranchError('');
    try {
      const res = await db.runAction('create_customer_bundle', {
        headquarters_id: String(addBranchTarget.id),
        branches: [{
          branch_name: addBranchForm.branch_name.trim(),
          vat: addBranchForm.vat.trim(),
          phone: addBranchForm.phone.trim(),
          contact_address: addBranchForm.contact_address.trim(),
          region_tag_id: addBranchForm.region_tag_id,
          contact_name: addBranchForm.contact_name.trim(),
          contact_phone: addBranchForm.contact_phone.trim(),
          contact_email: addBranchForm.contact_email.trim(),
        }],
      });
      if (res?.error) { setAddBranchError(res.error); setAddBranchSaving(false); return; }
      await assignCodesForBranches(res?.branches || []);
      setExpandedHq(prev => new Set([...prev, addBranchTarget.id]));
      setAddBranchTarget(null);
      setAddBranchForm({ ...EMPTY_BRANCH });
      await load();
    } catch (e: any) {
      setAddBranchError(e?.message || '新增失敗');
    } finally {
      setAddBranchSaving(false);
    }
  };
```

- [ ] **Step 4: 改寫 `saveEdit` 的寫入路徑**

在 `saveEdit`（約 line 244-323）中，把兩處 `await db.update('customers', record.id, {...})` 改為 `await db.runAction('update_customer', { customer_id: String(record.id), fields: {...} })`，並檢查回傳 `error`。

總公司分支（原 line 252-259）改為：

```typescript
        if (vatFormatHint(editHq.vat)) { setEditError(`統編：${vatFormatHint(editHq.vat)}`); setEditSaving(false); return; }
        if (!editHq.vat.trim()) { setEditError('統編為必填'); setEditSaving(false); return; }
        const hqRes = await db.runAction('update_customer', {
          customer_id: String(record.id),
          fields: {
            name: editHq.name.trim(),
            vat: editHq.vat.trim(),
            email: editHq.email.trim(),
            payment_term: editHq.payment_term,
            salesperson_id: editHq.salesperson_id,
            custom_data: { ...(record.custom_data || {}), invoice_format: editHq.invoice_format },
          },
        });
        if (hqRes?.error) { setEditError(hqRes.error); setEditSaving(false); return; }
```

分店分支（原 line 283-289 的 `db.update`）改為：

```typescript
        if (!editBranch.vat.trim()) { setEditError('統編為必填'); setEditSaving(false); return; }
        if (vatFormatHint(editBranch.vat)) { setEditError(`統編：${vatFormatHint(editBranch.vat)}`); setEditSaving(false); return; }
        const brRes = await db.runAction('update_customer', {
          customer_id: String(record.id),
          fields: {
            name: editBranch.name.trim(),
            vat: editBranch.vat.trim(),
            short_name: editBranch.short_name.trim() || null,
            phone: editBranch.phone.trim(),
            contact_address: editBranch.contact_address.trim(),
            custom_data: newCustomData,
          },
        });
        if (brRes?.error) { setEditError(brRes.error); setEditSaving(false); return; }
```

> 註：分店分支的統編必填檢查須放在 `planRouteChange` 的 `window.confirm` **之前**，避免使用者確認搬路線後才被擋。把上述兩行 `editBranch.vat` 檢查移到 `const plan = planRouteChange(...)` 之前。

- [ ] **Step 5: 編譯驗證**

Run: `cd vfs/admin && npx tsc --noEmit`
Expected: 無錯誤。特別確認沒有殘留對已刪除 `insertBranchAndContact` 的呼叫。

- [ ] **Step 6: Commit**

```bash
git add vfs/admin/src/pages/admin/CustomersPage.tsx
git commit -m "feat(admin): 客戶建檔/編輯收斂到 server-side action，統編防呆權威落地"
```

---

## Task 9: 更新 `ARCHITECTURE.md`

**Files:**
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: 改寫 §0.1 分店敘述**

把 §0.1 表格中 `branch` 那列的「分店（營運據點，**共用公司統編**）」改為「分店（營運據點，**各自獨立統編**）」。

在 §0.1「真實 vs 虛擬」說明段落後，加一句註記：

```markdown
  > **註（2026-05）**：分店改為各自設定獨立統編後，branch 在稅務上已是獨立法人。
  > 「真實/虛擬」的 `kind IN ('headquarters','independent')` filter 暫未調整；
  > 若報表需把分店計入真實客戶數，另案處理。
```

- [ ] **Step 2: 改寫 §0.123 屬性繼承規則**

把 §0.123 的這一行：

```markdown
  - 統編 `vat`：存在 headquarters；branch/role 查詢時向上追
```

改為：

```markdown
  - 統編 `vat`：headquarters / branch / independent 各自存自己那列；role 不存統編（不再繼承）
```

- [ ] **Step 3: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: 同步 ARCHITECTURE 統編規則為各 kind 獨立，不再繼承"
```

---

## Task 10: 全流程瀏覽器實測與發布

**Files:** 無（部署與驗收）

- [ ] **Step 1: 上傳 VFS（不發布）**

Run: `set -a && source .env && set +a && python3 vfs/scripts/deploy_admin.py --no-publish`
Expected: 步驟 1-4 成功。

- [ ] **Step 2: 重跑端對端測試**

Run: `set -a && source .env && set +a && python3 vfs/scripts/test_customer_vat.py`
Expected: PASS — `🎉 test_customer_vat 全數通過`

- [ ] **Step 3: 發布**

Run: `set -a && source .env && set +a && python3 vfs/scripts/deploy_admin.py`
Expected: 印出 `✅ Admin 部署完成`

- [ ] **Step 4: 瀏覽器實測**

開啟 Admin runtime 的客戶頁，逐項驗收：
1. 新增客戶：總公司 + 分店各填統編 → 建檔成功，列表分店列顯示統編。
2. 重複統編：再建一筆用相同統編 → 被擋，畫面顯示「已被 XXX 使用」。
3. 亂打統編（如 `12345678`）→ 欄位下方紅字提示，且送出被擋。
4. 對既有總公司「+ 分店」→ 填統編建檔成功。
5. 編輯分店：把統編改成另一筆已存在的 → 被擋。
6. 編輯一筆舊（無統編）分店 → 必須補上統編才能存檔。

- [ ] **Step 5: 確認無誤後完成**

若 Step 4 任一項失敗，回對應 Task 修正、重跑 Step 1-3。全部通過即完成。

---

## Self-Review 備註

- **Spec 覆蓋**：N1 分店統編（Task 3/4/7）、N2 檢查碼（Task 1）、N3 重複硬擋（Task 3/4）、N4 必填（Task 3/4/7/8）皆有對應 Task。§5.3 並發退讓於 Task 3/4 實作。§6 前端、§7 文件與測試、§4.4 共用邏輯一致性（Task 4 Step 4）皆涵蓋。
- **已知殘留限制**：並發退讓在「兩 request 重疊且其一 re-query 過早」的極端情況仍可能雙雙保留（spec §5.3 已述）；客戶數 > 5000 時 `limit=5000` 查重會漏（沿用 `assign_customer_code` 既有限制）。
- **型別一致性**：`create_customer_bundle` 回傳 `branches: [{branch_id, region_tag_id, contact_id, invite_token}]`，前端 `assignCodesForBranches` 取用 `branch_id` / `region_tag_id`，一致。
