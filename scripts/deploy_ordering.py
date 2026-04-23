"""
雄泉 Ordering Custom App — 部署腳本

讀取 vfs/ordering/ 目錄下的所有檔案，上傳 VFS 並發布到 AI GO 平台。
所有動態資料（假日、截止時間、參考價格）由 get_config action 在 runtime 從資料庫拉取。

環境變數（.env）：
  AIGO_EMAIL        - AI GO 登入 email
  AIGO_PASSWORD     - AI GO 登入密碼
  ORDERING_APP_ID   - Ordering App 的 UUID

用法：
  set -a && source .env && set +a
  python3 scripts/deploy_ordering.py
"""
import json, sys, os, urllib.request, urllib.error

API_BASE = "https://ai-go.app/api/v1"
VFS_DIR = os.path.join(os.path.dirname(__file__), "..", "vfs", "ordering")

REFS = [
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


def ensure_references(h, app_id):
    status, body = _req("GET", f"{API_BASE}/refs/apps/{app_id}", h)
    existing = {x["table_name"]: x for x in (body if status == 200 else [])}
    for t in REFS:
        tn = t["table_name"]
        if tn in existing:
            s2, _ = _req("PATCH", f"{API_BASE}/refs/{existing[tn]['id']}", h,
                         {"columns": t["columns"], "permissions": t["permissions"]})
        else:
            s2, _ = _req("POST", f"{API_BASE}/refs/apps/{app_id}", h, t)
        print(f"  [{tn}] {s2}")


def read_vfs(vfs_dir):
    """遞迴讀取 vfs_dir 下所有檔案，回傳 {相對路徑: 內容} dict。"""
    vfs = {}
    for root, _, files in os.walk(vfs_dir):
        for fname in files:
            full = os.path.join(root, fname)
            rel = os.path.relpath(full, vfs_dir).replace(os.sep, "/")
            with open(full, "r", encoding="utf-8") as f:
                vfs[rel] = f.read()
    return vfs


def upload_vfs(h, app_id, vfs):
    print(f"  檔案數: {len(vfs)}")
    status, body = _req("PUT", f"{API_BASE}/builder/apps/{app_id}/source", h,
                        {"vfs_state": vfs}, timeout=60)
    print(f"  上傳: {status}")
    if status != 200:
        sys.exit(f"❌ 上傳失敗：{body}")


def compile_app(h, app_id):
    status, body = _req("GET", f"{API_BASE}/builder/apps/{app_id}", h)
    if status != 200:
        sys.exit(f"❌ 取得 App 資訊失敗：{status}")
    slug = body.get("slug", app_id)
    s2, result = _req("POST", f"{API_BASE}/compile/compile/{slug}", h, {}, timeout=60)
    if not result.get("success"):
        sys.exit(f"❌ 編譯失敗：\n{result.get('error', '未知錯誤')}")
    print("  編譯：成功")


def publish_app(h, app_id):
    status, body = _req("POST", f"{API_BASE}/builder/apps/{app_id}/publish", h,
                        {"published_assets": {}})
    print(f"  發布: {status}")
    if status not in (200, 201):
        sys.exit(f"❌ 發布失敗：{body}")


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

    print("\n[3/4] 讀取並上傳 VFS...")
    vfs = read_vfs(VFS_DIR)
    upload_vfs(h, app_id, vfs)

    print("\n[3.5/4] 編譯驗證...")
    compile_app(h, app_id)

    print("\n[4/4] 發布...")
    publish_app(h, app_id)

    print("\n✅ Ordering 部署完成")


if __name__ == "__main__":
    main()
