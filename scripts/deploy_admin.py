"""
雄泉 Admin Custom App — 部署腳本

讀取 vfs/admin/ 目錄下的所有檔案，上傳 VFS 並發布到 AI GO 平台。
所有資料（假日、custom table UUID）均由前端 runtime 從資料庫拉取，不在此 bake。

環境變數（.env）：
  AIGO_EMAIL      - AI GO 登入 email
  AIGO_PASSWORD   - AI GO 登入密碼
  ADMIN_APP_ID    - Admin App 的 UUID

用法：
  set -a && source .env && set +a
  python3 scripts/deploy_admin.py
"""
import json, sys, os, urllib.request, urllib.error

API_BASE = "https://ai-go.app/api/v1"
VFS_DIR = os.path.join(os.path.dirname(__file__), "..", "vfs", "admin")

REFS = [
    {"table_name": "sale_orders", "columns": ["id", "name", "state", "date_order", "customer_id", "note", "amount_untaxed", "amount_tax", "amount_total", "created_at", "client_order_ref"], "permissions": ["read", "update"]},
    {"table_name": "sale_order_lines", "columns": ["id", "order_id", "product_id", "product_template_id", "product_uom_qty", "price_unit", "name", "delivery_date", "qty_delivered", "price_subtotal", "sequence"], "permissions": ["read", "update"]},
    {"table_name": "customers", "columns": ["id", "name", "email", "phone", "customer_type", "ref", "contact_address", "short_name"], "permissions": ["read", "update"]},
    {"table_name": "product_templates", "columns": ["id", "name", "default_code", "sale_ok", "active", "categ_id", "list_price", "standard_price", "uom_id"], "permissions": ["read", "update"]},
    {"table_name": "product_categories", "columns": ["id", "name", "parent_id"], "permissions": ["read", "create", "update", "delete"]},
    {"table_name": "suppliers", "columns": ["id", "name", "ref", "phone", "contact_address", "vat", "status", "supplier_type", "active", "contact_person", "email"], "permissions": ["read", "create", "update"]},
    {"table_name": "product_supplierinfo", "columns": ["id", "supplier_id", "product_tmpl_id", "product_id", "price", "min_qty", "product_code"], "permissions": ["read", "create"]},
    {"table_name": "purchase_orders", "columns": ["id", "name", "state", "supplier_id", "date_order", "amount_total"], "permissions": ["read", "create", "update"]},
    {"table_name": "purchase_order_lines", "columns": ["id", "order_id", "product_id", "product_qty", "price_unit", "price_subtotal"], "permissions": ["read", "create", "update"]},
    {"table_name": "stock_quants", "columns": ["id", "product_id", "quantity", "reserved_quantity", "location_id"], "permissions": ["read", "create", "update"]},
    {"table_name": "product_products", "columns": ["id", "product_tmpl_id", "default_code", "barcode", "active", "standard_price", "lst_price"], "permissions": ["read", "update"]},
    {"table_name": "hr_employees", "columns": ["id", "name", "active", "job_title", "mobile_phone", "department_id"], "permissions": ["read"]},
    {"table_name": "stock_locations", "columns": ["id", "name", "usage", "active"], "permissions": ["read", "create"]},
    {"table_name": "uom_uom", "columns": ["id", "name", "active"], "permissions": ["read"]},
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
    print("=== 雄泉 Admin Custom App 部署 ===")
    email = _require_env("AIGO_EMAIL")
    password = _require_env("AIGO_PASSWORD")
    app_id = _require_env("ADMIN_APP_ID")

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

    print("\n✅ Admin 部署完成")


if __name__ == "__main__":
    main()
