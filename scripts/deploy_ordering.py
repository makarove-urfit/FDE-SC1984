"""
雄泉 Ordering Custom App — 部署腳本

從環境變數讀取認證資訊，注入 VFS、編譯並發布到 AI GO 平台。

環境變數：
  AIGO_EMAIL        - AI GO 登入 email
  AIGO_PASSWORD     - AI GO 登入密碼
  ORDERING_APP_ID   - Ordering App 的 UUID（從 AI GO Builder 後台取得）

用法：
  python scripts/deploy_ordering.py
"""
import json, sys, os, urllib.request, urllib.error

sys.path.insert(0, os.path.dirname(__file__))
from ordering_vfs import build_vfs

API_BASE = "https://ai-go.app/api/v1"


def _req(method: str, url: str, headers: dict, data: dict = None, timeout: int = 30) -> tuple:
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def _require_env(key: str) -> str:
    val = os.environ.get(key, "").strip()
    if not val:
        sys.exit(f"❌ 環境變數 {key} 未設定")
    return val


def login(email: str, password: str) -> str:
    status, body = _req("POST", f"{API_BASE}/auth/login",
                        {"Content-Type": "application/json"},
                        {"email": email, "password": password})
    if status != 200:
        sys.exit(f"❌ 登入失敗：{status} {body}")
    token = body.get("access_token", "")
    if not token:
        sys.exit("❌ 登入回應未包含 access_token")
    return token


def ensure_references(h: dict, app_id: str):
    status, body = _req("GET", f"{API_BASE}/refs/apps/{app_id}", h)
    ex = {x["table_name"]: x for x in (body if status == 200 else [])}
    tables = [
        {"table_name": "sale_orders", "columns": ["id", "name", "state", "date_order", "customer_id", "note", "amount_total"], "permissions": ["read", "create", "update"]},
        {"table_name": "sale_order_lines", "columns": ["id", "order_id", "product_id", "product_template_id", "product_uom_qty", "price_unit", "name", "delivery_date"], "permissions": ["read", "create", "update"]},
        {"table_name": "product_templates", "columns": ["id", "name", "default_code", "sale_ok", "active", "categ_id", "list_price", "uom_id"], "permissions": ["read"]},
        {"table_name": "product_categories", "columns": ["id", "name", "parent_id", "active"], "permissions": ["read"]},
        {"table_name": "product_product", "columns": ["id", "product_tmpl_id", "active"], "permissions": ["read"]},
        {"table_name": "customers", "columns": ["id", "name", "email", "ref", "customer_type"], "permissions": ["read", "create"]},
        {"table_name": "uom_uom", "columns": ["id", "name", "active"], "permissions": ["read"]},
        {"table_name": "x_app_settings", "columns": ["id", "key", "value"], "permissions": ["read"]},
        {"table_name": "x_holiday_settings", "columns": ["id", "date", "reason"], "permissions": ["read"]},
        {"table_name": "x_product_product_price_log", "columns": ["id", "product_product_id", "lst_price", "effective_date"], "permissions": ["read"]},
    ]
    for t in tables:
        tn = t["table_name"]
        if tn in ex:
            s2, _ = _req("PATCH", f"{API_BASE}/refs/{ex[tn]['id']}", h,
                         {"columns": t["columns"], "permissions": t["permissions"]})
        else:
            s2, _ = _req("POST", f"{API_BASE}/refs/apps/{app_id}", h, t)
        print(f"  [{tn}] {s2}")


PRICE_LOG_UUID = "390d4f0b-9a2b-4131-a35b-67fce21286be"
HOLIDAY_UUID = "96d01299-1d33-4ca7-b437-4bf5c78dfdcf"


def fetch_price_data(h: dict) -> dict:
    """從 x_product_product_price_log 拉最新參考價，回傳 {product_product_id: {price, effective_date}}。"""
    status, body = _req("GET", f"{API_BASE}/data/objects/{PRICE_LOG_UUID}/records", h, timeout=30)
    if status != 200:
        print(f"  ⚠️ 拉取 x_product_product_price_log 失敗：{status}，價格資料為空")
        return {}
    records = body if isinstance(body, list) else []
    latest: dict = {}
    for rec in records:
        d = rec.get("data") or {}
        pp_id = str(d.get("product_product_id", ""))
        eff = str(d.get("effective_date", ""))
        price = d.get("lst_price")
        if not pp_id or not eff or price is None:
            continue
        try:
            price = float(price)
        except (ValueError, TypeError):
            continue
        if pp_id not in latest or eff > latest[pp_id]["effective_date"]:
            latest[pp_id] = {"price": price, "effective_date": eff}
    print(f"  x_product_product_price_log：{len(records)} 筆記錄，{len(latest)} 個商品有參考價")
    return latest


def fetch_holiday_data(h: dict) -> list:
    """從 x_holiday_settings 拉未來假日，回傳 ["YYYY-MM-DD", ...]。
    Custom Table（JSONB）只能用 admin bearer 透過 /data/objects/ 存取。"""
    import datetime
    today = datetime.date.today().isoformat()
    status, body = _req("GET", f"{API_BASE}/data/objects/{HOLIDAY_UUID}/records", h, timeout=30)
    if status != 200:
        print(f"  ⚠️ 拉取 x_holiday_settings 失敗：{status}，假日清單為空")
        return []
    records = body if isinstance(body, list) else []
    dates = [
        str(rec.get("data", {}).get("date", ""))
        for rec in records
        if str(rec.get("data", {}).get("date", "")) >= today
    ]
    print(f"  x_holiday_settings：{len(records)} 筆記錄，{len(dates)} 個未來假日")
    return dates


APP_SETTINGS_UUID = "fc8e665a-9156-400d-8c6a-a9c2c6f4574e"


def fetch_app_settings(h: dict) -> dict:
    """從 x_app_settings 拉設定，回傳 {key: value}"""
    status, body = _req("GET", f"{API_BASE}/data/objects/{APP_SETTINGS_UUID}/records", h, timeout=30)
    if status != 200:
        print(f"  ⚠️ 拉取 x_app_settings 失敗：{status}")
        return {}
    records = body if isinstance(body, list) else []
    result = {}
    for rec in records:
        d = rec.get("data") or {}
        k, v = d.get("key"), d.get("value")
        if k and v is not None:
            result[k] = v
    print(f"  x_app_settings：{result}")
    return result


def upload_vfs(h: dict, app_id: str, vfs: dict):
    print(f"  檔案數: {len(vfs)}")
    status, body = _req("PUT", f"{API_BASE}/builder/apps/{app_id}/source", h,
                        {"vfs_state": vfs}, timeout=60)
    print(f"  上傳: {status}")
    if status != 200:
        sys.exit(f"❌ 上傳失敗：{body}")


def fetch_app_slug(h: dict, app_id: str) -> str:
    status, body = _req("GET", f"{API_BASE}/builder/apps/{app_id}", h)
    if status != 200:
        sys.exit(f"❌ 取得 App 資訊失敗：{status}")
    return body.get("slug", app_id)


def compile_app(h: dict, slug: str):
    s2, result = _req("POST", f"{API_BASE}/compile/compile/{slug}?dev=true", h, {}, timeout=60)
    if not result.get("success"):
        sys.exit(f"❌ 編譯失敗：\n{result.get('error', '未知錯誤')}")
    print("  編譯：成功")


def publish_app(h: dict, app_id: str):
    status, body = _req("POST", f"{API_BASE}/builder/apps/{app_id}/publish", h,
                        {"published_assets": {}})
    print(f"  發布: {status}")
    if status not in (200, 201):
        sys.exit(f"❌ 發布失敗：{body}")


def smoke_test_action(app_slug: str):
    """用 custom app user 登入後打 ping，確認 actions 正常。需要 .env 設定 ORDERING_TEST_EMAIL/PASSWORD。"""
    test_email = os.environ.get("ORDERING_TEST_EMAIL")
    test_password = os.environ.get("ORDERING_TEST_PASSWORD")
    if not test_email or not test_password:
        print("  Smoke test：跳過（未設定 ORDERING_TEST_EMAIL / ORDERING_TEST_PASSWORD）")
        return

    auth_url = f"{API_BASE}/custom-app-auth/{app_slug}/login"
    s, body = _req("POST", auth_url, {"Content-Type": "application/json"},
                   {"email": test_email, "password": test_password})
    if s != 200 or not body.get("access_token"):
        print(f"  ⚠️ Smoke test 登入失敗：{s} {body}")
        return

    user_token = body["access_token"]
    uh = {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}
    ps, pb = _req("POST", f"{API_BASE}/ext/actions/run/ping", uh, {"params": {}}, timeout=15)
    if ps == 200 and (pb.get("pong") or (pb.get("data") or {}).get("pong")):
        print("  Smoke test (ping)：✅ actions 正常")
    else:
        print(f"  ⚠️ Smoke test ping 失敗：{ps} {pb}（actions 可能未正確發布）")


def main():
    print("=== 雄泉 Ordering Custom App 部署 ===")
    email = _require_env("AIGO_EMAIL")
    password = _require_env("AIGO_PASSWORD")
    app_id = _require_env("ORDERING_APP_ID")

    print("\n[1/4] 登入...")
    token = login(email, password)
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    print("\n[2/4] 設定 DB References...")
    ensure_references(h, app_id)

    slug = fetch_app_slug(h, app_id)
    print(f"  App slug: {slug}")

    print("\n[3/4] 組裝並上傳 VFS...")
    vfs = build_vfs()
    upload_vfs(h, app_id, vfs)

    print("\n[3.5/4] 編譯驗證...")
    compile_app(h, slug)

    print("\n[4/4] 發布...")
    publish_app(h, app_id)

    print("\n[4.5/4] Smoke test...")
    smoke_test_action(slug)

    print("\n✅ Ordering 部署完成")


if __name__ == "__main__":
    main()
