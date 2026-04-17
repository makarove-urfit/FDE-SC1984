"""
雄泉 Admin Custom App — 部署腳本

從環境變數讀取認證資訊，注入 VFS、編譯並發布到 AI GO 平台。

環境變數：
  AIGO_EMAIL      - AI GO 登入 email
  AIGO_PASSWORD   - AI GO 登入密碼
  ADMIN_APP_ID    - Admin App 的 UUID（從 AI GO Builder 後台取得）

用法：
  python scripts/deploy_admin.py
"""
import json, sys, os, urllib.request, urllib.error

sys.path.insert(0, os.path.dirname(__file__))
from v5_css import get_app_css, get_confirm_dialog, get_print_provider, get_data_provider, get_date_picker_with_counts
from pages import dashboard, purchase_list, stock, delivery, procurement, sales_orders

HOLIDAY_UUID = "96d01299-1d33-4ca7-b437-4bf5c78dfdcf"

API_BASE = "https://ai-go.app/api/v1"


def fetch_holiday_data(h: dict) -> list:
    """從 x_holiday_settings 拉假日日期清單，回傳 ['YYYY-MM-DD', ...]"""
    status, body = _req("GET", f"{API_BASE}/data/objects/{HOLIDAY_UUID}/records", h, timeout=30)
    if status != 200:
        print(f"  ⚠️ 拉取 x_holiday_settings 失敗：{status}，前端將無假日標示")
        return []
    records = body if isinstance(body, list) else []
    dates = [r.get("data", {}).get("date") for r in records]
    dates = sorted(d for d in dates if d)
    print(f"  x_holiday_settings：{len(dates)} 個假日")
    return dates


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
        {"table_name": "sale_orders", "columns": ["id", "name", "state", "date_order", "customer_id", "note", "amount_untaxed", "amount_tax", "amount_total", "created_at", "client_order_ref"], "permissions": ["read", "update"]},
        {"table_name": "sale_order_lines", "columns": ["id", "order_id", "product_id", "product_template_id", "product_uom_qty", "price_unit", "name", "delivery_date", "qty_delivered", "price_subtotal", "sequence"], "permissions": ["read", "update"]},
        {"table_name": "customers", "columns": ["id", "name", "email", "phone", "customer_type", "ref", "contact_address", "short_name"], "permissions": ["read", "update"]},
        {"table_name": "product_templates", "columns": ["id", "name", "default_code", "sale_ok", "active", "categ_id", "list_price", "standard_price", "uom_id"], "permissions": ["read", "update"]},
        {"table_name": "suppliers", "columns": ["id", "name", "ref", "phone", "contact_address", "vat", "status", "supplier_type", "active", "contact_person", "email"], "permissions": ["read", "create", "update"]},
        {"table_name": "product_supplierinfo", "columns": ["id", "supplier_id", "product_tmpl_id", "product_id", "price", "min_qty", "product_code"], "permissions": ["read", "create"]},
        {"table_name": "purchase_orders", "columns": ["id", "name", "state", "supplier_id", "date_order", "amount_total"], "permissions": ["read", "create", "update"]},
        {"table_name": "purchase_order_lines", "columns": ["id", "order_id", "product_id", "product_qty", "price_unit", "price_subtotal"], "permissions": ["read", "create", "update"]},
        {"table_name": "stock_quants", "columns": ["id", "product_id", "quantity", "reserved_quantity", "location_id"], "permissions": ["read", "create", "update"]},
        {"table_name": "product_products", "columns": ["id", "product_tmpl_id", "default_code", "barcode", "active"], "permissions": ["read", "create"]},
        {"table_name": "hr_employees", "columns": ["id", "name", "active", "job_title", "mobile_phone", "department_id"], "permissions": ["read"]},
        {"table_name": "stock_locations", "columns": ["id", "name", "usage", "active"], "permissions": ["read", "create"]},
        {"table_name": "uom_uom", "columns": ["id", "name", "active"], "permissions": ["read"]},
    ]
    for t in tables:
        tn = t["table_name"]
        if tn in ex:
            s2, _ = _req("PATCH", f"{API_BASE}/refs/{ex[tn]['id']}", h,
                         {"columns": t["columns"], "permissions": t["permissions"]})
        else:
            s2, _ = _req("POST", f"{API_BASE}/refs/apps/{app_id}", h, t)
        print(f"  [{tn}] {s2}")


def get_db_ts() -> str:
    return r'''const API_BASE = (window as any).__API_BASE__ || '/api/v1';
const APP_ID = (window as any).__APP_ID__ || '';
function _h(): Record<string,string> {
  const h: Record<string,string> = {'Content-Type':'application/json'};
  const t = (window as any).__APP_TOKEN__ || '';
  if (t) h['Authorization'] = 'Bearer '+t;
  return h;
}
async function _r(resp: Response): Promise<any> {
  if (!resp.ok) { const b=await resp.json().catch(()=>({})); throw new Error(b.detail||'API Error ('+resp.status+')'); }
  return resp.json();
}
export async function query(table:string, opts?:{limit?:number;offset?:number}): Promise<any[]> {
  const p=new URLSearchParams(); if(opts?.limit)p.set('limit',String(opts.limit)); if(opts?.offset)p.set('offset',String(opts.offset));
  const qs=p.toString()?'?'+p.toString():'';
  return _r(await fetch(API_BASE+'/proxy/'+APP_ID+'/'+table+qs,{headers:_h(),credentials:'include'}));
}
export async function update(table:string,id:string,data:Record<string,any>): Promise<any> {
  return _r(await fetch(API_BASE+'/proxy/'+APP_ID+'/'+table+'/'+id,{method:'PATCH',headers:_h(),credentials:'include',body:JSON.stringify({data})}));
}
export async function insert(table:string,data:Record<string,any>): Promise<any> {
  return _r(await fetch(API_BASE+'/proxy/'+APP_ID+'/'+table,{method:'POST',headers:_h(),credentials:'include',body:JSON.stringify({data})}));
}
export async function insertCustom(slug:string,data:Record<string,any>): Promise<any> {
  return _r(await fetch(API_BASE+'/data/objects/'+slug+'/records',{method:'POST',headers:_h(),credentials:'include',body:JSON.stringify({data})}));
}
export async function queryCustom(slug:string): Promise<any[]> {
  const resp=await fetch(API_BASE+'/data/objects/'+slug+'/records',{headers:_h(),credentials:'include'});
  if(!resp.ok) return [];
  return resp.json();
}
'''


def build_vfs(holiday_data: list = None) -> dict:
    vfs = {}
    vfs["package.json"] = json.dumps({
        "name": "xiong-quan-admin", "private": True, "version": "4.0.0", "type": "module",
        "dependencies": {"react": "^18.2.0", "react-dom": "^18.2.0", "react-router-dom": "^6.22.0"},
        "devDependencies": {"@types/react": "^18.2.0", "@types/react-dom": "^18.2.0", "typescript": "^5.0.0"}
    }, indent=2)
    vfs["src/main.tsx"] = (
        'import React from "react";\n'
        'import ReactDOM from "react-dom/client";\n'
        'import { HashRouter } from "react-router-dom";\n'
        'import App from "./App";\n'
        'import ErrorBoundary from "./components/ErrorBoundary";\n'
        'const rootEl = (window as any).__CUSTOM_APP_ROOT__ || document.getElementById("root");\n'
        'if (rootEl) {\n'
        '  const el = rootEl as HTMLElement;\n'
        '  el.style.overflowY = "auto";\n'
        '  el.style.height = "100%";\n'
        '}\n'
        'ReactDOM.createRoot(rootEl!).render(<React.StrictMode><ErrorBoundary><HashRouter><App /></HashRouter></ErrorBoundary></React.StrictMode>);\n'
    )
    vfs["src/components/ErrorBoundary.tsx"] = r"""import React from "react";

interface State { error: Error | null; }

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh", padding: "24px",
          fontFamily: "sans-serif", gap: "12px", textAlign: "center",
        }}>
          <div style={{ fontSize: "40px" }}>⚠️</div>
          <h2 style={{ fontSize: "18px", color: "#111" }}>發生錯誤，請重新整理</h2>
          <p style={{ fontSize: "13px", color: "#6b7280", maxWidth: "320px" }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px", background: "#2563eb", color: "#fff",
              border: "none", borderRadius: "8px", fontSize: "14px",
              fontWeight: 600, cursor: "pointer",
            }}
          >重新整理</button>
        </div>
      );
    }
    return this.props.children;
  }
}
"""
    vfs["src/App.tsx"] = (
        'import { Routes, Route, Navigate } from "react-router-dom";\n'
        'import DataProvider from "./data/DataProvider";\n'
        'import DashboardPage from "./pages/admin/DashboardPage";\n'
        'import PurchaseListPage from "./pages/admin/PurchaseListPage";\n'
        'import ProcurementPage from "./pages/admin/ProcurementPage";\n'
        'import StockPage from "./pages/admin/StockPage";\n'
        'import SalesOrdersPage from "./pages/admin/SalesOrdersPage";\n'
        'import DeliveryPage from "./pages/admin/DeliveryPage";\n'
        '\n'
        'export default function App() {\n'
        '  return (\n'
        '    <DataProvider>\n'
        '    <Routes>\n'
        '      <Route path="/" element={<DashboardPage />} />\n'
        '      <Route path="/admin" element={<DashboardPage />} />\n'
        '      <Route path="/admin/purchase-list" element={<PurchaseListPage />} />\n'
        '      <Route path="/admin/procurement" element={<ProcurementPage />} />\n'
        '      <Route path="/admin/stock" element={<StockPage />} />\n'
        '      <Route path="/admin/sales-orders" element={<SalesOrdersPage />} />\n'
        '      <Route path="/admin/delivery" element={<DeliveryPage />} />\n'
        '      <Route path="*" element={<Navigate to="/" replace />} />\n'
        '    </Routes>\n'
        '    </DataProvider>\n'
        '  );\n'
        '}\n'
    )
    vfs["src/App.css"] = get_app_css()
    vfs["src/db.ts"] = get_db_ts()
    vfs["src/components/ConfirmDialog.tsx"] = get_confirm_dialog()
    vfs["src/components/PrintProvider.tsx"] = get_print_provider()
    vfs["src/components/DatePickerWithCounts.tsx"] = get_date_picker_with_counts()
    vfs["src/data/DataProvider.tsx"] = get_data_provider()
    vfs["src/pages/admin/DashboardPage.tsx"] = dashboard()
    vfs["src/pages/admin/PurchaseListPage.tsx"] = purchase_list()
    vfs["src/pages/admin/ProcurementPage.tsx"] = procurement()
    vfs["src/pages/admin/StockPage.tsx"] = stock()
    vfs["src/pages/admin/SalesOrdersPage.tsx"] = sales_orders()
    vfs["src/pages/admin/DeliveryPage.tsx"] = delivery()
    vfs["src/pages/_manifest.json"] = json.dumps({"/": {"title": "管理後台", "order": 0}},
                                                   ensure_ascii=False, indent=2)
    vfs["src/holiday_data.json"] = json.dumps(holiday_data or [], ensure_ascii=False)
    vfs["src/data.json"] = "{}"
    vfs["src/db.json"] = "{}"
    vfs["actions/manifest.json"] = json.dumps({}, indent=2)
    return vfs


def upload_vfs(h: dict, app_id: str, vfs: dict):
    print(f"  檔案數: {len(vfs)}")
    status, body = _req("PUT", f"{API_BASE}/builder/apps/{app_id}/source", h,
                        {"vfs_state": vfs}, timeout=60)
    print(f"  上傳: {status}")
    if status != 200:
        sys.exit(f"❌ 上傳失敗：{body}")


def compile_app(h: dict, app_id: str):
    """編譯並驗證，失敗直接中止（不發布有錯誤的版本）"""
    status, body = _req("GET", f"{API_BASE}/builder/apps/{app_id}", h)
    if status != 200:
        sys.exit(f"❌ 取得 App 資訊失敗：{status}")
    slug = body.get("slug", app_id)

    s2, result = _req("POST", f"{API_BASE}/compile/compile/{slug}", h, {}, timeout=60)
    if not result.get("success"):
        sys.exit(f"❌ 編譯失敗：\n{result.get('error', '未知錯誤')}")
    print("  編譯：成功")


def publish_app(h: dict, app_id: str):
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

    print("\n[2.5/4] 拉取假日資料...")
    holiday_data = fetch_holiday_data(h)

    print("\n[3/4] 組裝並上傳 VFS...")
    vfs = build_vfs(holiday_data)
    upload_vfs(h, app_id, vfs)

    print("\n[3.5/4] 編譯驗證...")
    compile_app(h, app_id)

    print("\n[4/4] 發布...")
    publish_app(h, app_id)

    print("\n✅ Admin 部署完成")


if __name__ == "__main__":
    main()
