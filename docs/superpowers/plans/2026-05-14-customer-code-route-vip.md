# 客戶編碼制度、路線單字母化、公休日 VIP 例外 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落實 spec `docs/superpowers/specs/2026-05-14-customer-code-route-vip-design.md`，把客戶編碼從「路線名稱拼短名」改為由 server-side action 自動發放的不可覆蓋編碼；同時把公休日加上 VIP 例外配送名單。

**Architecture:** 
- 資料：客戶編碼存 `customers.ref`，歷史存 `customers.custom_data.code_history`；路線單字母與計數器存 `customer_tags.custom_data.route_letter` / `next_seq`；VIP 例外存 `x_holiday_settings.custom_data.vip_branch_ids`。
- 寫入路徑：新增 3 個 Admin server-side action（`assign_customer_code`、`reassign_customer_route`、`set_holiday_vip`），前端禁止直接寫 `ref`。
- 漸進遷移：`reportData.ts` 在客戶有 `ref` 時優先用 `ref`，沒有時退回舊邏輯（`region_tag.name + short_name`），給使用者時間手動清資料。

**Tech Stack:** AI GO Custom App 平台、Python 3 sandbox action、React + TypeScript 前端、`vfs/scripts/test_lib.py` 的 `run_action(use_dev=True)` 做 action 測試、`*.selftest.ts` 在瀏覽器跑 pure function assertion。

---

## File Structure

**Modify:**
- `vfs/scripts/db_admin.py:24` — `x_holiday_settings` columns 加 `custom_data`
- `vfs/admin/actions/manifest.json` — 註冊 3 個新 action
- `vfs/admin/src/utils/reportData.ts:58-64` — `customerCode()` 加 `ref` 優先邏輯
- `vfs/admin/src/utils/reportData.selftest.ts` — 加 ref fallback 測試
- `vfs/admin/src/pages/admin/RouteDriversPage.tsx` — form 加 route_letter 欄位、列表顯示 next_seq
- `vfs/admin/src/components/HolidayCalendar.tsx` — popup 加 VIP 多選；`Holiday` type 加 `vip_branch_ids`
- `vfs/admin/src/pages/admin/SettingsPage.tsx` — load branches 給 HolidayCalendar；接 `onUpdateVip`
- `vfs/admin/src/pages/admin/CustomersPage.tsx` — `insertBranchAndContact` 結束後呼叫 `assign_customer_code`；編輯時偵測 route 變更→ `reassign_customer_route`

**Create:**
- `vfs/admin/actions/assign_customer_code.py` — 新分店取號
- `vfs/admin/actions/reassign_customer_route.py` — 搬路線封舊發新
- `vfs/admin/actions/set_holiday_vip.py` — 設定公休日 VIP 名單
- `vfs/scripts/test_customer_code.py` — 上述 3 個 action 的端對端測試腳本

---

## Task 1: 擴充 `x_holiday_settings` 可寫欄位

**Files:**
- Modify: `vfs/scripts/db_admin.py:24`

- [ ] **Step 1: 在 REFS 加入 `custom_data` 欄位**

把第 24 行從：

```python
    {"table_name": "x_holiday_settings",  "columns": ["id", "date", "reason"],                                                                                                                           "permissions": ["read", "create", "update", "delete"]},
```

改成：

```python
    {"table_name": "x_holiday_settings",  "columns": ["id", "date", "reason", "custom_data"],                                                                                                            "permissions": ["read", "create", "update", "delete"]},
```

- [ ] **Step 2: 部署 references（不發布前端）**

執行：

```bash
set -a && source .env && set +a
python3 vfs/scripts/deploy_admin.py --no-publish
```

預期：終端輸出含 `x_holiday_settings ... patched`（或 `created`），步驟 1-2 完成、步驟 3 上傳 VFS、步驟 4 略過。

- [ ] **Step 3: Commit**

```bash
git add vfs/scripts/db_admin.py
git commit -m "feat(db): x_holiday_settings 開放 custom_data，為公休日 VIP 例外名單鋪路"
```

---

## Task 2: Action `assign_customer_code`

**Files:**
- Create: `vfs/admin/actions/assign_customer_code.py`
- Modify: `vfs/admin/actions/manifest.json`
- Create: `vfs/scripts/test_customer_code.py`

- [ ] **Step 1: 寫測試腳本（failing test）**

建立 `vfs/scripts/test_customer_code.py`：

```python
"""End-to-end test for customer code / route / VIP actions.
Run: set -a && source .env && set +a && python3 vfs/scripts/test_customer_code.py
"""
import sys, json, uuid
from test_lib import api_login, post, patch, query, qquery, run_action, ADMIN_APP


def main():
    h = api_login()
    print("✅ login ok")

    # ── 前置：建一個測試用路線 tag（單字母 Z，避免撞線上資料）──
    s, tag = post(h, ADMIN_APP, "customer_tags", {
        "name": f"Z-test-{uuid.uuid4().hex[:6]}",
        "custom_data": {"category": "region", "route_letter": "Z", "next_seq": 1},
    })
    assert s in (200, 201), f"create tag failed: {s} {tag}"
    tag_id = str((tag or {}).get("id") or (tag or {}).get("data", {}).get("id"))
    print(f"✅ test tag created: {tag_id}")

    # ── 建一筆 branch customer（無 code）──
    s, cust = post(h, ADMIN_APP, "customers", {
        "name": f"測試分店-{uuid.uuid4().hex[:6]}",
        "is_company": False,
        "customer_type": "individual",
        "custom_data": {"kind": "branch", "region_tag_id": tag_id},
    })
    assert s in (200, 201), f"create customer failed: {s} {cust}"
    cid = str((cust or {}).get("id") or (cust or {}).get("data", {}).get("id"))
    print(f"✅ test branch created: {cid}")

    # ── Test 1: assign_customer_code ──
    s, r = run_action(h, ADMIN_APP, "assign_customer_code", {
        "customer_id": cid, "route_tag_id": tag_id,
    })
    assert s == 200, f"assign HTTP {s} {r}"
    body = (r or {}).get("result") or r
    assert body.get("success") is True, f"assign body: {body}"
    assert body.get("code") == "Z01", f"expected Z01 got {body.get('code')}"
    print(f"✅ assign_customer_code → {body.get('code')}")

    # ── 驗證 customer.ref 與 code_history ──
    rows = qquery(h, ADMIN_APP, "customers", [{"column": "id", "op": "eq", "value": cid}])
    assert rows, "customer not found after assign"
    c = rows[0]
    assert c.get("ref") == "Z01", f"ref expected Z01 got {c.get('ref')}"
    hist = (c.get("custom_data") or {}).get("code_history") or []
    assert len(hist) == 1 and hist[0]["code"] == "Z01" and hist[0]["until"] is None
    print("✅ ref + code_history correct")

    # ── 驗證 tag.next_seq 已 +1 ──
    rows = qquery(h, ADMIN_APP, "customer_tags", [{"column": "id", "op": "eq", "value": tag_id}])
    assert rows and (rows[0].get("custom_data") or {}).get("next_seq") == 2
    print("✅ next_seq incremented to 2")

    print("🎉 Task 2 tests passed")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 跑測試確認 fails**

```bash
set -a && source .env && set +a && python3 vfs/scripts/test_customer_code.py
```

預期：到 `assign_customer_code` 那行噴 HTTP 404 或 「action not found」，因為 action 尚未存在。

- [ ] **Step 3: 寫 action**

建立 `vfs/admin/actions/assign_customer_code.py`：

```python
def execute(ctx):
    from datetime import datetime, timezone

    p = ctx.params
    customer_id = str(p.get("customer_id") or "").strip()
    route_tag_id = str(p.get("route_tag_id") or "").strip()

    if not customer_id:
        ctx.response.json({"error": "customer_id 為必填"})
        return
    if not route_tag_id:
        ctx.response.json({"error": "route_tag_id 為必填"})
        return

    # 1. 讀 route tag
    tags = ctx.db.query("customer_tags", limit=2000) or []
    tag = next((t for t in tags if str(t.get("id")) == route_tag_id), None)
    if not tag:
        ctx.response.json({"error": f"路線 tag {route_tag_id} 不存在"})
        return
    tag_cd = tag.get("custom_data") or {}
    route_letter = str(tag_cd.get("route_letter") or "").strip().upper()
    if not (len(route_letter) == 1 and "A" <= route_letter <= "Z"):
        ctx.response.json({"error": f"路線 tag 未設定有效的 route_letter（單一 A-Z 字母）"})
        return
    next_seq = int(tag_cd.get("next_seq") or 1)

    # 2. 算出新編碼（≤99 補零、≥100 不補）
    seq_str = f"{next_seq:02d}" if next_seq < 100 else str(next_seq)
    code = f"{route_letter}{seq_str}"

    # 3. 讀客戶（取目前 custom_data 以便 merge）
    customers = ctx.db.query("customers", limit=5000) or []
    cust = next((c for c in customers if str(c.get("id")) == customer_id), None)
    if not cust:
        ctx.response.json({"error": f"客戶 {customer_id} 不存在"})
        return
    if (cust.get("ref") or "").strip():
        ctx.response.json({"error": f"客戶已有編碼 {cust.get('ref')}，請改用 reassign_customer_route"})
        return

    cust_cd = cust.get("custom_data") or {}
    now_iso = datetime.now(timezone.utc).isoformat()
    history = list(cust_cd.get("code_history") or [])
    history.append({
        "code": code,
        "route_tag_id": route_tag_id,
        "since": now_iso,
        "until": None,
    })
    new_cd = {**cust_cd, "code_history": history, "region_tag_id": route_tag_id}

    # 4. 先 update tag（樂觀鎖：把 next_seq +1）
    new_tag_cd = {**tag_cd, "next_seq": next_seq + 1}
    try:
        ctx.db.update("customer_tags", route_tag_id, {"custom_data": new_tag_cd})
    except Exception as e:
        ctx.response.json({"error": f"更新 next_seq 失敗：{e}"})
        return

    # 5. 再 update customer（ref + custom_data）
    try:
        ctx.db.update("customers", customer_id, {"ref": code, "custom_data": new_cd})
    except Exception as e:
        # 客戶更新失敗 → tag 已 +1，該號碼跳號（符合「不回收」原則，可接受）
        ctx.response.json({"error": f"更新客戶失敗（號碼 {code} 跳號）：{e}"})
        return

    ctx.response.json({"success": True, "code": code, "seq": next_seq})
```

- [ ] **Step 4: 註冊到 manifest**

修改 `vfs/admin/actions/manifest.json`，在最後一個 `}` 前加入（注意前一筆要加逗號）：

```json
  "assign_customer_code": {
    "description": "為 branch 客戶從指定路線取下一個流水號發放編碼（寫入 customers.ref + custom_data.code_history，並把 tag.next_seq +1）"
  },
```

- [ ] **Step 5: 上傳 VFS**

```bash
set -a && source .env && set +a
python3 vfs/scripts/deploy_admin.py --no-publish
```

- [ ] **Step 6: 跑測試確認 pass**

```bash
python3 vfs/scripts/test_customer_code.py
```

預期：5 個 ✅ 全綠、最後 `🎉 Task 2 tests passed`。

- [ ] **Step 7: Commit**

```bash
git add vfs/admin/actions/assign_customer_code.py vfs/admin/actions/manifest.json vfs/scripts/test_customer_code.py
git commit -m "feat(admin): assign_customer_code action — 路線計數器發號，編碼集中由 server 把關"
```

---

## Task 3: Action `reassign_customer_route`

**Files:**
- Create: `vfs/admin/actions/reassign_customer_route.py`
- Modify: `vfs/admin/actions/manifest.json`
- Modify: `vfs/scripts/test_customer_code.py`

- [ ] **Step 1: 在測試腳本追加 reassign 測試**

在 `vfs/scripts/test_customer_code.py` 的 `print("🎉 Task 2 tests passed")` 之前插入：

```python
    # ── 前置：再建一個目標路線 tag（Y）──
    s, tag2 = post(h, ADMIN_APP, "customer_tags", {
        "name": f"Y-test-{uuid.uuid4().hex[:6]}",
        "custom_data": {"category": "region", "route_letter": "Y", "next_seq": 50},
    })
    assert s in (200, 201)
    tag2_id = str((tag2 or {}).get("id") or (tag2 or {}).get("data", {}).get("id"))
    print(f"✅ second test tag created: {tag2_id}")

    # ── Test 2: reassign_customer_route ──
    s, r = run_action(h, ADMIN_APP, "reassign_customer_route", {
        "customer_id": cid, "new_route_tag_id": tag2_id,
    })
    assert s == 200, f"reassign HTTP {s} {r}"
    body = (r or {}).get("result") or r
    assert body.get("success") is True
    assert body.get("old_code") == "Z01" and body.get("new_code") == "Y50", f"reassign body: {body}"
    print(f"✅ reassign_customer_route Z01 → Y50")

    # ── 驗證 history 兩筆、舊筆 until 已封 ──
    rows = qquery(h, ADMIN_APP, "customers", [{"column": "id", "op": "eq", "value": cid}])
    c = rows[0]
    assert c.get("ref") == "Y50"
    hist = (c.get("custom_data") or {}).get("code_history") or []
    assert len(hist) == 2
    assert hist[0]["code"] == "Z01" and hist[0]["until"] is not None
    assert hist[1]["code"] == "Y50" and hist[1]["until"] is None
    print("✅ code_history 封存 Z01、新增 Y50")

    # ── 驗證舊路線 next_seq 不回退、新路線 +1 ──
    rows = qquery(h, ADMIN_APP, "customer_tags", [{"column": "id", "op": "in", "value": [tag_id, tag2_id]}])
    by_id = {str(r["id"]): r for r in rows}
    assert (by_id[tag_id].get("custom_data") or {}).get("next_seq") == 2, "舊路線 next_seq 不應回退"
    assert (by_id[tag2_id].get("custom_data") or {}).get("next_seq") == 51
    print("✅ 舊路線 next_seq=2 不回退、新路線 next_seq=51")
```

- [ ] **Step 2: 跑測試確認新測試 fails**

```bash
python3 vfs/scripts/test_customer_code.py
```

預期：Task 2 的 ✅ 全綠，新追加的 `reassign_customer_route` 觸發 HTTP 404 或 「action not found」。

- [ ] **Step 3: 寫 action**

建立 `vfs/admin/actions/reassign_customer_route.py`：

```python
def execute(ctx):
    from datetime import datetime, timezone

    p = ctx.params
    customer_id = str(p.get("customer_id") or "").strip()
    new_route_tag_id = str(p.get("new_route_tag_id") or "").strip()

    if not customer_id:
        ctx.response.json({"error": "customer_id 為必填"})
        return
    if not new_route_tag_id:
        ctx.response.json({"error": "new_route_tag_id 為必填"})
        return

    # 1. 讀客戶
    customers = ctx.db.query("customers", limit=5000) or []
    cust = next((c for c in customers if str(c.get("id")) == customer_id), None)
    if not cust:
        ctx.response.json({"error": f"客戶 {customer_id} 不存在"})
        return
    old_code = (cust.get("ref") or "").strip()
    if not old_code:
        ctx.response.json({"error": "客戶尚未發放編碼，請改用 assign_customer_code"})
        return
    cust_cd = cust.get("custom_data") or {}
    old_route_tag_id = str(cust_cd.get("region_tag_id") or "")
    if old_route_tag_id == new_route_tag_id:
        ctx.response.json({"success": True, "old_code": old_code, "new_code": old_code, "noop": True})
        return

    # 2. 讀新路線 tag、算新編碼
    tags = ctx.db.query("customer_tags", limit=2000) or []
    new_tag = next((t for t in tags if str(t.get("id")) == new_route_tag_id), None)
    if not new_tag:
        ctx.response.json({"error": f"路線 tag {new_route_tag_id} 不存在"})
        return
    new_tag_cd = new_tag.get("custom_data") or {}
    route_letter = str(new_tag_cd.get("route_letter") or "").strip().upper()
    if not (len(route_letter) == 1 and "A" <= route_letter <= "Z"):
        ctx.response.json({"error": "新路線未設定有效的 route_letter"})
        return
    next_seq = int(new_tag_cd.get("next_seq") or 1)
    seq_str = f"{next_seq:02d}" if next_seq < 100 else str(next_seq)
    new_code = f"{route_letter}{seq_str}"

    # 3. 更新 history：舊筆封 until、新筆 append
    now_iso = datetime.now(timezone.utc).isoformat()
    history = list(cust_cd.get("code_history") or [])
    if history and history[-1].get("until") is None:
        history[-1] = {**history[-1], "until": now_iso}
    history.append({
        "code": new_code,
        "route_tag_id": new_route_tag_id,
        "since": now_iso,
        "until": None,
    })
    new_cd = {**cust_cd, "code_history": history, "region_tag_id": new_route_tag_id}

    # 4. tag.next_seq +1（舊路線不動）
    updated_tag_cd = {**new_tag_cd, "next_seq": next_seq + 1}
    try:
        ctx.db.update("customer_tags", new_route_tag_id, {"custom_data": updated_tag_cd})
    except Exception as e:
        ctx.response.json({"error": f"更新新路線 next_seq 失敗：{e}"})
        return

    # 5. 客戶 ref + custom_data
    try:
        ctx.db.update("customers", customer_id, {"ref": new_code, "custom_data": new_cd})
    except Exception as e:
        ctx.response.json({"error": f"更新客戶失敗（號碼 {new_code} 跳號）：{e}"})
        return

    ctx.response.json({"success": True, "old_code": old_code, "new_code": new_code})
```

- [ ] **Step 4: 註冊 manifest**

在 `vfs/admin/actions/manifest.json` 加：

```json
  "reassign_customer_route": {
    "description": "客戶搬路線：封存舊編碼（code_history.until）、從新路線取號發放、新路線 next_seq +1（舊路線不回退）"
  },
```

- [ ] **Step 5: 上傳 VFS**

```bash
python3 vfs/scripts/deploy_admin.py --no-publish
```

- [ ] **Step 6: 跑測試確認 pass**

```bash
python3 vfs/scripts/test_customer_code.py
```

預期：全部 ✅，包含 `Z01 → Y50`、`code_history 封存 Z01、新增 Y50`、`舊路線 next_seq=2 不回退`。

- [ ] **Step 7: Commit**

```bash
git add vfs/admin/actions/reassign_customer_route.py vfs/admin/actions/manifest.json vfs/scripts/test_customer_code.py
git commit -m "feat(admin): reassign_customer_route — 搬路線時封舊號發新號，舊路線計數器不回退以實踐「永不重用」"
```

---

## Task 4: Action `set_holiday_vip`

**Files:**
- Create: `vfs/admin/actions/set_holiday_vip.py`
- Modify: `vfs/admin/actions/manifest.json`
- Modify: `vfs/scripts/test_customer_code.py`

- [ ] **Step 1: 在測試腳本追加 VIP 測試**

在 `print("🎉 Task 2 tests passed")` 前面再追加：

```python
    # ── 前置：建一個測試假日 ──
    s, hol = post(h, ADMIN_APP, "x_holiday_settings", {
        "data": {"date": "2099-12-31", "reason": "測試假日"}
    })
    # x_ 表 insert response 可能是 {data: {...}} 也可能是 flat
    hid = str((hol or {}).get("id") or (hol or {}).get("data", {}).get("id"))
    assert hid, f"create holiday failed: {s} {hol}"
    print(f"✅ test holiday created: {hid}")

    # ── Test 3: set_holiday_vip ──
    s, r = run_action(h, ADMIN_APP, "set_holiday_vip", {
        "holiday_id": hid,
        "vip_branch_ids": [cid],
    })
    assert s == 200, f"vip HTTP {s} {r}"
    body = (r or {}).get("result") or r
    assert body.get("success") is True
    print("✅ set_holiday_vip 寫入")

    # ── 驗證 custom_data.vip_branch_ids ──
    rows = qquery(h, ADMIN_APP, "x_holiday_settings", [{"column": "id", "op": "eq", "value": hid}])
    assert rows, "holiday not found"
    saved = (rows[0].get("custom_data") or rows[0].get("data", {}).get("custom_data") or {})
    assert saved.get("vip_branch_ids") == [cid], f"vip_branch_ids saved: {saved}"
    print("✅ vip_branch_ids 持久化正確")

    # ── 覆寫測試（傳空陣列應清空）──
    s, r = run_action(h, ADMIN_APP, "set_holiday_vip", {
        "holiday_id": hid, "vip_branch_ids": [],
    })
    assert s == 200 and ((r or {}).get("result") or r).get("success") is True
    rows = qquery(h, ADMIN_APP, "x_holiday_settings", [{"column": "id", "op": "eq", "value": hid}])
    saved = (rows[0].get("custom_data") or rows[0].get("data", {}).get("custom_data") or {})
    assert saved.get("vip_branch_ids") == []
    print("✅ 空陣列覆寫成功")
```

- [ ] **Step 2: 跑測試確認新區塊 fails**

```bash
python3 vfs/scripts/test_customer_code.py
```

預期：之前的測試 ✅，新區塊在 `set_holiday_vip` 觸發 404。

- [ ] **Step 3: 寫 action**

建立 `vfs/admin/actions/set_holiday_vip.py`：

```python
def execute(ctx):
    p = ctx.params
    holiday_id = str(p.get("holiday_id") or "").strip()
    vip_ids = p.get("vip_branch_ids")

    if not holiday_id:
        ctx.response.json({"error": "holiday_id 為必填"})
        return
    if not isinstance(vip_ids, list):
        ctx.response.json({"error": "vip_branch_ids 必須為陣列"})
        return

    # 正規化：全部轉字串、去空、去重（保留順序）
    seen = set()
    normalized = []
    for v in vip_ids:
        s = str(v or "").strip()
        if s and s not in seen:
            seen.add(s)
            normalized.append(s)

    # 讀現有 row（用 query_object：x_ 表專用）
    rows = ctx.db.query_object("x_holiday_settings", limit=2000) or []
    row = next((r for r in rows if str(r.get("id")) == holiday_id), None)
    if not row:
        ctx.response.json({"error": f"假日 {holiday_id} 不存在"})
        return
    cd = row.get("custom_data") or {}
    new_cd = {**cd, "vip_branch_ids": normalized}

    try:
        ctx.db.update("x_holiday_settings", holiday_id, {"custom_data": new_cd})
    except Exception as e:
        ctx.response.json({"error": f"更新失敗：{e}"})
        return

    ctx.response.json({"success": True, "count": len(normalized)})
```

- [ ] **Step 4: 註冊 manifest**

```json
  "set_holiday_vip": {
    "description": "覆寫公休日 VIP 例外配送名單（x_holiday_settings.custom_data.vip_branch_ids）"
  },
```

- [ ] **Step 5: 上傳 VFS + 跑測試**

```bash
python3 vfs/scripts/deploy_admin.py --no-publish
python3 vfs/scripts/test_customer_code.py
```

預期：所有 ✅ 全綠。

- [ ] **Step 6: Commit**

```bash
git add vfs/admin/actions/set_holiday_vip.py vfs/admin/actions/manifest.json vfs/scripts/test_customer_code.py
git commit -m "feat(admin): set_holiday_vip — 每個公休日各自管 VIP 例外配送名單"
```

---

## Task 5: `customerCode()` 加 `ref` 優先邏輯（with selftest）

**Files:**
- Modify: `vfs/admin/src/utils/reportData.ts:58-64`
- Modify: `vfs/admin/src/utils/reportData.selftest.ts:14-18`

- [ ] **Step 1: 在 selftest 新增 fallback 測試（failing）**

修改 `vfs/admin/src/utils/reportData.selftest.ts` line 14 附近，把 customerCode 區塊改為：

```ts
  // ── customerCode ──
  assert(customerCode({ ref: 'C51', short_name: '皇家', custom_data: { region_tag_id: 't1' } }, { t1: { name: '北區' } }) === 'C51', 'customerCode 有 ref → 直接用 ref');
  assert(customerCode({ ref: '', short_name: '炸料', custom_data: { region_tag_id: 't1' } }, { t1: { name: 'F33' } }) === 'F33炸料', 'customerCode 無 ref → 路線+簡稱（舊邏輯 fallback）');
  assert(customerCode({ short_name: '炸料', custom_data: { region_tag_id: 't1' } }, { t1: { name: 'F33' } }) === 'F33炸料', 'customerCode 路線+簡稱');
  assert(customerCode({ name: '梵某餐廳', custom_data: { region_tag_id: 't2' } }, { t2: { name: 'F60' } }) === 'F60梵某餐', 'customerCode 無 short_name 取 name 前 3 字');
  assert(customerCode({ short_name: '五股' }, {}) === '五股', 'customerCode 無 region_tag_id 只回簡稱');
  assert(customerCode({ short_name: '五股', custom_data: { region_tag_id: 'gone' } }, {}) === '五股', 'customerCode tag 已刪除 → fallback 到簡稱');
  assert(customerCode(undefined, {}) === '', 'customerCode undefined 客戶 → 空字串');
```

- [ ] **Step 2: 跑 selftest 確認新增 case fails**

啟動現有部署環境後，在瀏覽器 console：

```js
(await import('/src/utils/reportData.selftest.ts')).runReportDataSelfTest()
```

預期：第一行 assert 失敗（❌ 噴 'customerCode 有 ref → 直接用 ref'），因為現行 `customerCode` 還沒讀 `ref`。

- [ ] **Step 3: 修改 `customerCode()`**

`vfs/admin/src/utils/reportData.ts` line 58-64 改為：

```ts
export function customerCode(cust: any | undefined, tagsById: Record<string, any>): string {
  if (!cust) return '';
  const ref = String(cust?.ref || '').trim();
  if (ref) return ref;
  const tagId = _id(cust?.custom_data?.region_tag_id);
  const route = tagId ? String(tagsById[tagId]?.name || '') : '';
  const short = String(cust?.short_name || '').trim() || String(cust?.name || '').slice(0, 3);
  return `${route}${short}`;
}
```

- [ ] **Step 4: 重新部署前端 VFS + 跑 selftest**

```bash
python3 vfs/scripts/deploy_admin.py --no-publish
```

部署完畢後，在瀏覽器（runtime 頁面）console 跑：

```js
(await import('/src/utils/reportData.selftest.ts')).runReportDataSelfTest()
```

預期：全部 ✅ 含 `🎉 reportData helpers self-test passed`。

- [ ] **Step 5: Commit**

```bash
git add vfs/admin/src/utils/reportData.ts vfs/admin/src/utils/reportData.selftest.ts
git commit -m "feat(admin): customerCode 優先讀 customers.ref，舊資料 fallback 走 region_tag+short_name"
```

---

## Task 6: `RouteDriversPage` 加 route_letter 欄位

**Files:**
- Modify: `vfs/admin/src/pages/admin/RouteDriversPage.tsx`

- [ ] **Step 1: 擴充 Tag type 與 EMPTY**

把第 5-12 行改為：

```ts
type Tag = {
  id: string; name: string;
  defaultDriverId: string;
  routeLetter: string;
  nextSeq: number;
  _cd: Record<string, any>;
};
type Employee = { id: string; name: string; userId: string };

const EMPTY = { name: '', defaultDriverId: '', routeLetter: '' };
```

- [ ] **Step 2: load() 讀 route_letter / next_seq**

把第 42-50 行（`.map((r: any) => {...}`）改為：

```ts
        .map((r: any) => {
          const cd = (r.custom_data && typeof r.custom_data === 'object') ? r.custom_data : {};
          return {
            id: String(r.id),
            name: String(r.name || ''),
            defaultDriverId: String(cd.default_driver_id || ''),
            routeLetter: String(cd.route_letter || '').toUpperCase(),
            nextSeq: Number(cd.next_seq || 1),
            _cd: cd,
          };
        })
```

- [ ] **Step 3: openEdit 帶入 routeLetter**

把 line 78-82 改為：

```ts
  const openEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setForm({ name: tag.name, defaultDriverId: tag.defaultDriverId, routeLetter: tag.routeLetter });
    setFormErr(''); setShowForm(true);
  };
```

- [ ] **Step 4: submit() 驗證並寫入 route_letter，初始化 next_seq**

把 line 84-110 的 submit 改為：

```ts
  const submit = async () => {
    if (!form.name.trim()) { setFormErr('名稱為必填'); return; }
    const letter = form.routeLetter.trim().toUpperCase();
    if (!/^[A-Z]$/.test(letter)) { setFormErr('路線代號必須是 1 個英文字母（A-Z）'); return; }
    // 唯一性檢查（編輯時排除自己）
    if (tags.some(t => t.id !== editingId && t.routeLetter === letter)) {
      setFormErr(`路線代號 ${letter} 已被其他路線使用`); return;
    }
    setSaving(true); setFormErr('');
    try {
      const existingTag = tags.find(t => t.id === editingId);
      const cd: Record<string, any> = {
        ...(existingTag?._cd || {}),
        category: 'region',
        single_select: true,
        route_letter: letter,
        next_seq: Number((existingTag?._cd || {}).next_seq) || 1,
      };
      if (form.defaultDriverId) {
        cd.default_driver_id = form.defaultDriverId;
      } else {
        delete cd.default_driver_id;
      }
      const payload = { name: form.name.trim(), custom_data: cd };
      if (editingId) {
        await db.update('customer_tags', editingId, payload);
      } else {
        await db.insert('customer_tags', payload);
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      setFormErr(e?.message || (editingId ? '更新失敗' : '新增失敗'));
    } finally { setSaving(false); }
  };
```

- [ ] **Step 5: 表格多兩欄（代號 / 已發 / 下一號）**

把 line 145-176 的 `<table>` 區塊改為：

```tsx
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-4 py-2.5 text-left">路線名稱</th>
                    <th className="px-4 py-2.5 text-left">代號</th>
                    <th className="px-4 py-2.5 text-left">已發 / 下一號</th>
                    <th className="px-4 py-2.5 text-left">預設司機</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {tags.map(tag => (
                    <tr key={tag.id} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{tag.name}</td>
                      <td className="px-4 py-2.5 font-mono text-blue-700">{tag.routeLetter || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">
                        已發 {Math.max(tag.nextSeq - 1, 0)} / 下一號 {tag.routeLetter}{String(tag.nextSeq).padStart(2, '0')}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {tag.defaultDriverId && empName(tag.defaultDriverId) ? (
                          <span className="inline-block px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                            {empName(tag.defaultDriverId)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">未指定</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right space-x-1">
                        <button onClick={() => openEdit(tag)}
                          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">編輯</button>
                        <button onClick={() => del(tag)}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">刪除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
```

- [ ] **Step 6: 表單加 route_letter 輸入**

在表單 line 197 `<div>` 後（「路線名稱」欄位下面、「預設司機」之前）插入：

```tsx
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  路線代號 <span className="text-red-500">*</span>
                </label>
                <input type="text" value={form.routeLetter} maxLength={1}
                  onChange={e => setForm(p => ({ ...p, routeLetter: e.target.value.toUpperCase() }))}
                  placeholder="如：A、C、G"
                  className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg uppercase font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-gray-400 mt-1">單一英文字母，作為客戶編碼前綴（如 G43 的 G）。建立後不建議修改</p>
              </div>
```

- [ ] **Step 7: 部署 + 瀏覽器手測**

```bash
python3 vfs/scripts/deploy_admin.py --no-publish
```

在瀏覽器（dev runtime URL）：

1. 進「路線預設司機」頁
2. 新增一筆「路線代號 = A」，驗證列表新增、`已發 0 / 下一號 A01`
3. 嘗試再新增「路線代號 = A」，驗證錯誤訊息「已被其他路線使用」
4. 點編輯，路線代號欄位應預填 `A`

- [ ] **Step 8: Commit**

```bash
git add vfs/admin/src/pages/admin/RouteDriversPage.tsx
git commit -m "feat(admin): 路線管理頁加 route_letter 欄位與唯一性檢查，避免「路線名稱塞流水號」的舊用法"
```

---

## Task 7: `HolidayCalendar` 加 VIP 多選

**Files:**
- Modify: `vfs/admin/src/components/HolidayCalendar.tsx`

- [ ] **Step 1: 擴充 `Holiday` type 與 Props**

把 line 3-12 改為：

```ts
export type Holiday = { id: string; date: string; reason: string; vip_branch_ids?: string[] };

export type BranchOption = { id: string; label: string };

interface Props {
  holidays: Holiday[];
  busy: boolean;
  branchOptions: BranchOption[];
  onAdd: (date: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onUpdateReason: (id: string, reason: string) => Promise<void>;
  onUpdateVip: (id: string, branchIds: string[]) => Promise<void>;
  onImportMondays: () => Promise<void>;
}
```

- [ ] **Step 2: 解構 props 加新欄位、加 state**

把 line 56 改為：

```ts
export default function HolidayCalendar({ holidays, busy, branchOptions, onAdd, onRemove, onUpdateReason, onUpdateVip, onImportMondays }: Props) {
```

把 line 60-61 之後加入：

```ts
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [editReason, setEditReason] = useState('');
  const [editVip, setEditVip] = useState<string[]>([]);
```

- [ ] **Step 3: 開啟編輯時初始化 vip 名單**

把 line 96-99 改為：

```ts
    if (cell.holiday) {
      setEditing(cell.holiday);
      setEditReason(cell.holiday.reason);
      setEditVip([...(cell.holiday.vip_branch_ids || [])]);
    } else {
      await onAdd(cell.iso);
    }
```

- [ ] **Step 4: closeEdit 重置 vip、saveEdit 寫 vip**

把 line 104-110 改為：

```ts
  const closeEdit = () => { setEditing(null); setEditReason(''); setEditVip([]); };
  const saveEdit = async () => {
    if (!editing) return;
    const trimmed = editReason.trim() || '公休';
    if (trimmed !== editing.reason) await onUpdateReason(editing.id, trimmed);
    const prev = (editing.vip_branch_ids || []).slice().sort();
    const curr = editVip.slice().sort();
    if (JSON.stringify(prev) !== JSON.stringify(curr)) {
      await onUpdateVip(editing.id, editVip);
    }
    closeEdit();
  };
```

- [ ] **Step 5: popup 加 VIP 區塊**

在 line 274 `</div>` 之後（即「休假原因」`input` 那個 `<div>` 結束之後），插入：

```tsx
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                VIP 例外配送名單（這天仍要送這些分店）
              </div>
              <select
                multiple
                value={editVip}
                onChange={(e) => {
                  const opts = Array.from(e.target.selectedOptions).map(o => o.value);
                  setEditVip(opts);
                }}
                style={{
                  width: '100%',
                  minHeight: '120px',
                  padding: '6px 8px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                  background: '#f9fafb',
                  color: '#111827',
                  boxSizing: 'border-box',
                }}
              >
                {branchOptions.map(b => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                按住 Ctrl/⌘ 點選可多選；已選 {editVip.length} 家
              </div>
            </div>
```

- [ ] **Step 6: 提示文字更新**

把 line 222-223 的 `<p>` 改為：

```tsx
      <p className="text-xs text-gray-400 mt-3">
        點空白日 → 直接新增為「公休」；點紅色日 → 開啟編輯視窗，可改原因、設定 VIP 例外名單或取消假日。
      </p>
```

- [ ] **Step 7: Commit（不部署，等 SettingsPage 接好再一起測）**

```bash
git add vfs/admin/src/components/HolidayCalendar.tsx
git commit -m "feat(admin): HolidayCalendar 編輯 popup 加 VIP 例外多選，逐假日獨立指定"
```

---

## Task 8: `SettingsPage` 載入 branches、接 `onUpdateVip`

**Files:**
- Modify: `vfs/admin/src/pages/admin/SettingsPage.tsx`

- [ ] **Step 1: import 多兩個 type**

把 line 4 改為：

```ts
import HolidayCalendar, { Holiday, BranchOption } from '../../components/HolidayCalendar';
```

- [ ] **Step 2: 新增 branches state + loader**

把 line 19 之後追加：

```ts
  const [branches, setBranches] = useState<BranchOption[]>([]);
```

在 `load()` 中 `Promise.all` 加 `db.query('customers')`：把 line 26-29 改為：

```ts
      const [rawSettings, rawHols, rawCustomers] = await Promise.all([
        db.queryCustom('x_app_settings'),
        db.queryCustom('x_holiday_settings'),
        db.query('customers'),
      ]);
```

- [ ] **Step 3: 過濾 branches 並排序（按 ref，再按 name）**

在 line 32（`co =` 那行之前）插入：

```ts
      const branchOpts: BranchOption[] = (rawCustomers || [])
        .filter((c: any) => (c?.custom_data?.kind === 'branch'))
        .map((c: any) => {
          const code = String(c?.ref || '').trim();
          const name = String(c?.short_name || c?.name || '');
          return { id: String(c.id), label: code ? `${code} ${name}` : `（未發碼）${name}` };
        })
        .sort((a: BranchOption, b: BranchOption) => a.label.localeCompare(b.label, 'zh-Hant'));
      setBranches(branchOpts);
```

- [ ] **Step 4: holiday 載入時帶 vip_branch_ids**

把 line 43-45 改為：

```ts
      const hs: Holiday[] = (rawHols||[]).map((r:any) => {
        const d = r.data||r;
        const cd = (d.custom_data && typeof d.custom_data === 'object') ? d.custom_data : {};
        return {
          id: String(r.id||d.id),
          date: String(d.date||''),
          reason: String(d.reason||d.label||'公休'),
          vip_branch_ids: Array.isArray(cd.vip_branch_ids) ? cd.vip_branch_ids.map(String) : [],
        };
      })
        .filter(h => h.date)
        .sort((a,b) => a.date.localeCompare(b.date));
      setHolidays(hs);
```

- [ ] **Step 5: 新增 onUpdateVip handler**

把 line 94-95（`updHolidayReason` 結束後）插入：

```ts
  const updHolidayVip = async (id: string, branchIds: string[]) => {
    setBusy(true);
    try { await db.runAction('set_holiday_vip', { holiday_id: id, vip_branch_ids: branchIds }); await load(); }
    catch(e:any) { alert(e?.message||'VIP 名單更新失敗'); } finally { setBusy(false); }
  };
```

- [ ] **Step 6: 把 props 傳給 HolidayCalendar**

把 line 165-172 改為：

```tsx
            <HolidayCalendar
              holidays={holidays}
              busy={busy}
              branchOptions={branches}
              onAdd={addHoliday}
              onRemove={delHoliday}
              onUpdateReason={updHolidayReason}
              onUpdateVip={updHolidayVip}
              onImportMondays={importMondays}
            />
```

- [ ] **Step 7: 部署 + 瀏覽器手測**

```bash
python3 vfs/scripts/deploy_admin.py --no-publish
```

瀏覽器：

1. 進「系統設定」→ 假日管理區塊
2. 點空白日新增一個未來假日
3. 點該紅色日 → popup 應出現「VIP 例外配送名單」多選清單，內容是所有 branch
4. 選 2~3 家 → 按儲存
5. 重整頁面，再點同一天 → 多選器應預選那 2~3 家

- [ ] **Step 8: Commit**

```bash
git add vfs/admin/src/pages/admin/SettingsPage.tsx
git commit -m "feat(admin): 系統設定頁載入分店清單，公休日 popup 可指定當日 VIP 例外配送"
```

---

## Task 9: `CustomersPage` 串接 assign_customer_code + reassign_customer_route

**Files:**
- Modify: `vfs/admin/src/pages/admin/CustomersPage.tsx`

- [ ] **Step 1: `insertBranchAndContact` 加 assign 呼叫**

把 line 295-321 的 `insertBranchAndContact` 整段改為：

```ts
  const insertBranchAndContact = async (parentHqId: string, b: BranchEntry) => {
    const inviteToken = crypto.randomUUID();
    const branch = await db.insert('customers', {
      name: b.branch_name.trim(),
      is_company: false,
      customer_type: 'individual',
      ...(b.phone ? { phone: b.phone } : {}),
      ...(b.contact_address ? { contact_address: b.contact_address } : {}),
      custom_data: {
        kind: 'branch',
        parent_customer_id: String(parentHqId),
        invite_token: inviteToken,
        ...(b.contact_email.trim() ? { contact_email: b.contact_email.trim() } : {}),
        ...(b.region_tag_id ? { region_tag_id: b.region_tag_id } : {}),
      },
    });
    // 若有指定路線，自動發放客戶編碼
    if (b.region_tag_id) {
      try {
        await db.runAction('assign_customer_code', {
          customer_id: String(branch.id),
          route_tag_id: String(b.region_tag_id),
        });
      } catch (e: any) {
        // 不阻斷主流程（編碼可後續手動補發），但需通知使用者
        console.error('[assign_customer_code] failed:', e);
        alert(`分店「${b.branch_name}」已建立，但客戶編碼自動發放失敗：${e?.message || e}\n請至客戶頁手動補發。`);
      }
    }
    if (b.contact_name.trim()) {
      await db.insert('customers', {
        name: b.contact_name.trim(),
        is_company: false,
        customer_type: 'individual',
        ...(b.contact_phone ? { phone: b.contact_phone } : {}),
        custom_data: { kind: 'role', role: 'contact', parent_customer_id: String(branch.id) },
      });
    }
    return branch;
  };
```

- [ ] **Step 2: 找到「編輯分店」儲存路徑**

執行：

```bash
grep -n "編輯\|saveBranch\|updateBranch\|region_tag_id" /home/username/桌面/fde-sc1984/vfs/admin/src/pages/admin/CustomersPage.tsx | head -40
```

- [ ] **Step 3: 在編輯分店儲存時偵測 route 變更**

在「儲存編輯分店」的函式內（路線變更的位置由 Step 2 確認），找到 `await db.update('customers', branchId, {...})` 的呼叫位置，在 update 之前讀取舊資料中的 `custom_data.region_tag_id`，若新 `region_tag_id` 與舊不同且兩者皆有值，則：

```ts
        // 偵測路線變更：彈確認 dialog，呼叫 reassign action 取代直接 update region_tag_id
        if (oldRegionTagId && newRegionTagId && oldRegionTagId !== newRegionTagId) {
          const ok = confirm(
            `將為此分店重新發放客戶編碼（新路線下一個流水號），舊編碼 ${oldCode || '(無)'} 會被封存。\n確定要搬路線？`
          );
          if (!ok) return;
          try {
            const r = await db.runAction('reassign_customer_route', {
              customer_id: String(branchId),
              new_route_tag_id: String(newRegionTagId),
            });
            alert(`已重新發碼：${r?.old_code} → ${r?.new_code}`);
          } catch (e: any) {
            alert(`搬路線失敗：${e?.message || e}`);
            return;
          }
          // reassign action 已寫入 region_tag_id，後續 update 不要重複覆寫 region_tag_id
          // → 從 update payload 移除 region_tag_id 後再執行普通 update
        }
```

**注意**：此步驟需依 Step 2 找到的實際變數名稱（`oldRegionTagId`、`newRegionTagId`、`branchId`、`oldCode`）做替換。若編輯流程不存在「修改路線」UI，則本步驟改為「在分店列表加一顆『搬路線』按鈕」獨立入口。

- [ ] **Step 4: 客戶列表顯示 ref**

找到分店列表 render 區塊（搜尋 `b.branch_name` 或 `分店`），在 row 內加上：

```tsx
<span className="font-mono text-blue-700 text-xs mr-2">{c.ref || '（未發碼）'}</span>
```

放在分店名稱前面。

- [ ] **Step 5: 部署 + 瀏覽器手測**

```bash
python3 vfs/scripts/deploy_admin.py --no-publish
```

瀏覽器：

1. 進「客戶管理」頁
2. 點「新增公司」，建立一個測試公司含 1 個分店、路線選某條已有 `route_letter` 的路線（Task 6 建好的 A 路線）
3. 送出後，回列表應看見該分店的 `ref` 顯示為 `A01`（或對應流水號）
4. （若 Step 3 接通了搬路線）編輯該分店 → 改路線 → 出現 confirm → 按確認 → alert 顯示 `old → new`

- [ ] **Step 6: Commit**

```bash
git add vfs/admin/src/pages/admin/CustomersPage.tsx
git commit -m "feat(admin): 新增分店自動發碼、搬路線走 reassign action，編碼集中由 server 把關"
```

---

## Task 10: End-to-End 瀏覽器驗證

無檔案修改，純手動驗證 spec 的核心使用情境。

- [ ] **Step 1: 建立完整鏈路（路線→公司→分店→編碼）**

瀏覽器 dev runtime URL：

1. 路線預設司機頁 → 新增路線：名稱 `北區`、代號 `N`、預設司機任選
2. 客戶管理頁 → 新增公司「測試 E2E 公司」+ 分店「測試 E2E 分店」+ 路線選 `N`
3. 預期：列表分店那行顯示 `N01`

- [ ] **Step 2: 驗證搬路線**

1. 再新增一條路線：代號 `S`、`next_seq` 隨意（Task 6 預設 1）
2. 編輯「測試 E2E 分店」→ 把路線從 `N` 改成 `S`
3. confirm dialog 出現 → 確認 → alert 顯示 `N01 → S01`
4. 重整頁面 → 列表分店 ref 顯示 `S01`
5. 在 SQL/proxy 直接 query 該客戶 → `custom_data.code_history` 應有兩筆（N01 已 `until` 封存、S01 生效中）

- [ ] **Step 3: 驗證 N 路線不回退**

1. 客戶頁再新增一個分店到 `N` 路線
2. 預期：分配到 `N02`（不是 N01，N01 已被前一個分店用過、永不重用）

- [ ] **Step 4: 驗證公休日 VIP**

1. 系統設定頁 → 假日管理區塊 → 點未來某日新增公休
2. 點該紅色日 → popup → VIP 多選器 → 選「S01 測試 E2E 分店」
3. 儲存 → 重新整理頁面 → 再點同日 → 多選器應預選 S01

- [ ] **Step 5: 驗證採購單 fallback（舊資料相容性）**

1. 在 DB 找一筆既有未發碼的 branch 客戶（`ref` 為空、`custom_data.region_tag_id` 指向舊 `F33` 之類的 tag）
2. 給它建一張採購單
3. 列印採購單 → 客戶代號欄應仍顯示 `F33炸料`（舊邏輯 fallback 生效）

- [ ] **Step 6: 全部通過後 publish**

```bash
python3 vfs/scripts/deploy_admin.py
```

預期：完整 4 步驟跑完（含步驟 4 publish），終端最後出現 `published`。

- [ ] **Step 7: 上線後最後一次驗證（同 Step 1-5 跑一遍 production URL）**

確認 production runtime 行為與 dev 一致。

- [ ] **Step 8: 收尾 commit（如果上面驗證流程有 bug fix）**

若 Step 1-7 過程中發現任何 bug 需要補修，補完後：

```bash
git add -p
git commit -m "fix(admin): <具體說明> — Task 10 E2E 驗證發現的問題"
```

若無修補，跳過此步。

---

## Task 11: 清理測試資料（可選）

**Files:** 無

- [ ] **Step 1: 清掉 Z / Y 測試路線與相關客戶**

`test_customer_code.py` 留下的測試客戶 / tag / 假日不會自動清。若要清：

```bash
set -a && source .env && set +a
python3 -c "
from vfs.scripts.test_lib import api_login, qquery, _req, ADMIN_APP, API_BASE
h = api_login()
# 找測試 tag（name 以 Z-test- / Y-test- 開頭）
tags = qquery(h, ADMIN_APP, 'customer_tags', [{'column': 'name', 'op': 'ilike', 'value': '%-test-%'}])
for t in tags:
    print('would delete tag:', t.get('id'), t.get('name'))
# 真要刪：取消註解
# for t in tags:
#     _req('DELETE', f'{API_BASE}/proxy/{ADMIN_APP}/customer_tags/{t[\"id\"]}', h)
"
```

- [ ] **Step 2: 若有刪，commit 清理紀錄（可選）**

清理只是 DB 操作、不動 code，通常不需要 commit。若要紀錄，加一筆 ops note 即可。

---

## Self-Review Checklist（plan 作者執行）

跑過一次，確認以下 spec 需求都有對應 task：

- [x] N1 公休日 VIP 例外（逐假日獨立）→ Task 1（DB）+ Task 4（action）+ Task 7（component）+ Task 8（page wiring）+ Task 10 Step 4（驗證）
- [x] N2.1 編碼格式 `<路線單字母><流水號>` → Task 2 action 內 `route_letter + zfill(2)`
- [x] N2.2 路線單字母存 `customer_tags` 不混塞流水號 → Task 6（form + 唯一性檢查）
- [x] N2.3 流水號每路線獨立、永不重用 → Task 2（取號 +1）+ Task 3（搬路線時舊 tag.next_seq 不動）+ Task 10 Step 3（驗證）
- [x] N2.4 兩位數補零、≥100 自然往上長 → Task 2 Step 3 `seq_str = f"{n:02d}" if n < 100 else str(n)`
- [x] N2.5 搬家用 reassign + history → Task 3 action
- [x] N2.6 編碼不可由前端寫入 → 前端僅透過 `runAction` 寫；Task 5 fallback 唯一直接讀的點
- [x] N3 舊資料手動處理 + fallback → Task 5（`customerCode` ref 優先邏輯）
- [x] 部署順序 → Task 1（schema 先）→ Task 2-4（actions）→ Task 5-9（前端）→ Task 10（publish）

**Placeholder scan:** 已掃過，所有「實作 / 補上 / 細節」之類字眼皆替換為實際 code。Task 9 Step 2-3 因現有 CustomersPage 編輯流程位置需在執行時 grep 確認，已提供具體 grep 指令與替換策略。

**Type consistency:**
- `BranchOption` 在 Task 7（component）與 Task 8（page）皆使用同名 type，從 component export。
- action 回傳格式 `{success, code}` / `{success, old_code, new_code}` 在 plan 與 spec section 4 一致。
- `customer_tags.custom_data.next_seq` / `route_letter` 在 Task 2、Task 3、Task 6 命名一致。

完成。
