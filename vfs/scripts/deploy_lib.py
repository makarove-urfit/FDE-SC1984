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


def require_env(key):
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


def ensure_references(h, app_id, refs):
    status, body = _req("GET", f"{API_BASE}/refs/apps/{app_id}", h)
    existing = {x["table_name"]: x for x in (body if status == 200 else [])}
    for t in refs:
        tn = t["table_name"]
        if tn in existing:
            s2, _ = _req("PATCH", f"{API_BASE}/refs/{existing[tn]['id']}", h,
                         {"columns": t["columns"], "permissions": t["permissions"]})
        else:
            s2, _ = _req("POST", f"{API_BASE}/refs/apps/{app_id}", h, t)
        print(f"  [{tn}] {s2}")


def read_vfs(vfs_dir):
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


def publish_app(h, app_id):
    status, body = _req("POST", f"{API_BASE}/builder/apps/{app_id}/publish", h,
                        {"published_assets": {}})
    print(f"  發布: {status}")
    if status not in (200, 201):
        sys.exit(f"❌ 發布失敗：{body}")
