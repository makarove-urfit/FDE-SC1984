"""
資料搬遷：x_price_audit_log → x_product_product_price_log

搬遷邏輯：
  - 來源欄位 product_tmpl_id → 查 product_products 找對應的 product_product_id
  - 來源欄位 new_price → lst_price（取變更後的售價）
  - standard_price = 0（舊 log 未記錄進貨價）
  - updated_at 的日期部分 → effective_date
  - updated_by、updated_at 原樣保留

環境變數：
  AIGO_EMAIL      - AI GO 登入 email
  AIGO_PASSWORD   - AI GO 登入密碼
  ADMIN_APP_ID    - Admin App UUID

用法：
  python scripts/migrate_price_log.py [--dry-run]
"""
import json, sys, os, urllib.request, urllib.error

API_BASE = "https://ai-go.app/api/v1"


def _req(method, url, headers, data=None, timeout=30):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def _require_env(key):
    val = os.environ.get(key, "").strip()
    if not val:
        sys.exit(f"❌ 環境變數 {key} 未設定")
    return val


def login(email, password):
    status, body = _req("POST", f"{API_BASE}/auth/login",
                        {"Content-Type": "application/json"},
                        {"email": email, "password": password})
    if status != 200:
        sys.exit(f"❌ 登入失敗：{status} {body}")
    token = body.get("access_token", "")
    if not token:
        sys.exit("❌ 登入回應未包含 access_token")
    return token


def proxy_get_all(h, app_id, table, limit=1000):
    status, body = _req("GET", f"{API_BASE}/proxy/{app_id}/{table}?limit={limit}", h)
    if status != 200:
        sys.exit(f"❌ 查詢 {table} 失敗：{status} {body}")
    return body if isinstance(body, list) else []


def proxy_post(h, app_id, table, data):
    status, body = _req("POST", f"{API_BASE}/proxy/{app_id}/{table}", h, {"data": data})
    return status, body


def resolve_id(val):
    if isinstance(val, list):
        return str(val[0])
    return str(val) if val else ""


def main():
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("🔍 Dry-run 模式，不實際寫入")

    email    = _require_env("AIGO_EMAIL")
    password = _require_env("AIGO_PASSWORD")
    app_id   = _require_env("ADMIN_APP_ID")

    print("🔑 登入 AI GO...")
    token = login(email, password)
    h = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}

    # 1. 讀取舊 log
    print("📖 讀取 x_price_audit_log...")
    old_logs = proxy_get_all(h, app_id, "x_price_audit_log")
    print(f"   共 {len(old_logs)} 筆")

    if not old_logs:
        print("✅ 無資料需要搬遷")
        return

    # 2. 讀取 product_products，建立 tmpl_id → product_id 對照表
    print("📖 讀取 product_products...")
    products = proxy_get_all(h, app_id, "product_products")
    tmpl_to_pp: dict[str, str] = {}
    for pp in products:
        pp_id = resolve_id(pp.get("id", ""))
        tmpl_id = resolve_id(pp.get("product_tmpl_id", ""))
        if pp_id and tmpl_id:
            tmpl_to_pp[tmpl_id] = pp_id
    print(f"   共 {len(tmpl_to_pp)} 個 template→product 對照")

    # 3. 搬遷
    ok = skipped = failed = 0
    for rec in old_logs:
        tmpl_id  = resolve_id(rec.get("product_tmpl_id", ""))
        pp_id    = tmpl_to_pp.get(tmpl_id, "")
        new_price = float(rec.get("new_price") or 0)
        updated_by = str(rec.get("updated_by") or "")
        updated_at = str(rec.get("updated_at") or "")
        effective_date = updated_at[:10] if updated_at else ""

        if not pp_id:
            print(f"   ⚠️  tmpl_id={tmpl_id} 找不到對應 product_products，略過")
            skipped += 1
            continue

        new_rec = {
            "product_product_id": pp_id,
            "lst_price": new_price,
            "standard_price": 0,  # 舊 log 未記錄進貨價
            "updated_by": updated_by,
            "effective_date": effective_date,
            "updated_at": updated_at,
        }

        if dry_run:
            print(f"   [dry] {tmpl_id} → pp={pp_id} lst_price={new_price} date={effective_date}")
            ok += 1
        else:
            status, body = proxy_post(h, app_id, "x_product_product_price_log", new_rec)
            if status in (200, 201):
                ok += 1
            else:
                print(f"   ❌ 寫入失敗 tmpl_id={tmpl_id}：{status} {body}")
                failed += 1

    print(f"\n{'🔍 Dry-run' if dry_run else '✅'} 結果：成功 {ok}，略過 {skipped}，失敗 {failed}")


if __name__ == "__main__":
    main()
