"""清理路線管理頁殘留的測試資料。

為什麼需要：E2E / 診斷腳本多次中斷，try/finally 清理沒跑完，
留下一堆 Z-test-* / Y-test-* 路線及其下的測試客戶（孤兒風險）。

預設 dry-run（只列不刪）。確認清單無誤後加 --apply 才真正刪除。
刪除順序：先刪掛在測試路線下的客戶，再刪路線本身，避免孤兒。

Run:
  set -a && source .env && set +a
  python3 vfs/scripts/cleanup_test_routes.py            # dry-run
  python3 vfs/scripts/cleanup_test_routes.py --apply    # 真正刪除
"""
import re, sys
from test_lib import api_login, run_action, _req, ADMIN_APP, API_BASE

APPLY = "--apply" in sys.argv

# 確定是測試垃圾的路線名 pattern
TEST_PATTERNS = [
    re.compile(r"^Z-test-"),
    re.compile(r"^Y-test-"),
    re.compile(r"^Z-diag-"),
    re.compile(r"^Zdiag2-"),
    re.compile(r"^__del_test__$"),
    re.compile(r"^__e2e_updated__$"),
    re.compile(r"^__test_.*___upd$"),
]
# 需人工判斷的舊路線（無代號的遺留用法）
LEGACY_NAMES = {"G", "C", "B18", "A10"}


def is_test(name):
    return any(p.search(name) for p in TEST_PATTERNS)


def _id(v):
    if isinstance(v, list):
        return str(v[0]) if v else ""
    return str(v) if v is not None else ""


def query_all(h, table):
    """proxy limit 上限 500，分頁抓完整表。"""
    rows, offset = [], 0
    while True:
        s, b = _req("GET", f"{API_BASE}/proxy/{ADMIN_APP}/{table}?limit=500&offset={offset}", h)
        if s != 200 or not isinstance(b, list) or not b:
            if s != 200:
                print(f"⚠️ query {table} offset={offset} 失敗：{s} {str(b)[:200]}", file=sys.stderr)
            break
        rows += b
        if len(b) < 500:
            break
        offset += 500
    return rows


def main():
    h = api_login()
    print(f"✅ login ok  ({'APPLY 真正刪除' if APPLY else 'DRY-RUN 只列不刪'})\n")

    tags = query_all(h, "customer_tags")
    customers = query_all(h, "customers")
    print(f"讀取：{len(tags)} 條路線、{len(customers)} 筆客戶\n")

    # tag_id -> list of (customer_id, customer_name, ref)
    by_tag = {}
    for c in customers:
        tid = _id((c.get("custom_data") or {}).get("region_tag_id"))
        if tid:
            by_tag.setdefault(tid, []).append(
                (str(c.get("id")), str(c.get("name") or ""), str(c.get("ref") or ""))
            )

    test_tags, legacy_tags = [], []
    for t in tags:
        name = str(t.get("name") or "")
        if is_test(name):
            test_tags.append(t)
        elif name in LEGACY_NAMES:
            legacy_tags.append(t)

    # ── 測試路線 ──
    print("=" * 60)
    print(f"🗑️  測試路線（{len(test_tags)} 條）— 連同下列客戶一併刪除")
    print("=" * 60)
    del_customer_ids = []
    for t in test_tags:
        tid = str(t.get("id"))
        custs = by_tag.get(tid, [])
        print(f"  [{tid}] {t.get('name')}  → 掛 {len(custs)} 筆客戶")
        for cid, cname, ref in custs:
            print(f"        - [{cid}] {cname}  ref={ref or '(無)'}")
            del_customer_ids.append(cid)

    # ── 舊路線（需判斷）──
    print()
    print("=" * 60)
    print(f"❓ 舊路線（{len(legacy_tags)} 條）— 不刪，僅列出供你判斷")
    print("=" * 60)
    for t in legacy_tags:
        tid = str(t.get("id"))
        custs = by_tag.get(tid, [])
        flag = "← 有真實客戶，建議保留" if custs else "← 空的，可刪"
        print(f"  [{tid}] {t.get('name')}  → 掛 {len(custs)} 筆客戶  {flag}")
        for cid, cname, ref in custs:
            print(f"        - [{cid}] {cname}  ref={ref or '(無)'}")

    print()
    print(f"小計：將刪除 {len(test_tags)} 條測試路線 + {len(del_customer_ids)} 筆測試客戶")

    if not APPLY:
        print("\n（dry-run，未刪除任何資料。確認無誤後加 --apply 重跑。）")
        return

    # ── 真正刪除：走 crud_delete action（proxy DELETE 對這兩表回 403）──
    # 先刪客戶再刪路線，避免孤兒。
    print("\n開始刪除…")

    def bulk_delete(table, ids):
        if not ids:
            return 0
        s, r = run_action(h, ADMIN_APP, "crud_delete", {"table": table, "ids": ids})
        body = (r or {}).get("result") or r or {}
        if s != 200 or "error" in body:
            print(f"  ⚠️ crud_delete {table} 失敗：HTTP {s} {str(body)[:200]}")
            return 0
        for e in body.get("error_details") or []:
            print(f"  ⚠️ 刪 {table} {e.get('id')} 失敗：{e.get('error')}")
        return int(body.get("deleted") or 0)

    tag_ids = [str(t.get("id")) for t in test_tags]
    ok_c = bulk_delete("customers", del_customer_ids)
    ok_t = bulk_delete("customer_tags", tag_ids)
    print(f"\n✅ 完成：刪除 {ok_c}/{len(del_customer_ids)} 客戶、{ok_t}/{len(test_tags)} 路線")


if __name__ == "__main__":
    main()
