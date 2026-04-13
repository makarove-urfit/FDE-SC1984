"""
Ordering App 整合測試

用法：
  set -a && source .env && set +a
  python3 scripts/test_ordering.py

需要在 .env 設定：
  ORDERING_TEST_EMAIL     - 測試帳號 email
  ORDERING_TEST_PASSWORD  - 測試帳號密碼
"""
import json, os, sys, urllib.request, urllib.error

API_BASE = "https://ai-go.app/api/v1"
PASS = 0; FAIL = 0


def _req(method, url, headers, body=None, timeout=20):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def ok(label):
    global PASS; PASS += 1; print(f"  ✅ {label}")


def fail(label, detail=""):
    global FAIL; FAIL += 1; print(f"  ❌ {label}{': ' + str(detail) if detail else ''}")


def require_env(key):
    v = os.environ.get(key)
    if not v:
        sys.exit(f"缺少環境變數：{key}，請在 .env 設定後重試")
    return v


def main():
    app_slug = require_env("ORDERING_APP_SLUG")   # e.g. ordering
    test_email = require_env("ORDERING_TEST_EMAIL")
    test_password = require_env("ORDERING_TEST_PASSWORD")

    print("=== Ordering App 整合測試 ===\n")

    # ── 1. Custom app user 登入 ──
    print("[1] 登入測試...")
    s, body = _req("POST", f"{API_BASE}/custom-app-auth/{app_slug}/login",
                   {"Content-Type": "application/json"},
                   {"email": test_email, "password": test_password})
    if s == 200 and body.get("access_token"):
        ok("登入成功")
        token = body["access_token"]
    else:
        fail("登入失敗", f"{s} {body}")
        sys.exit("無法繼續測試")

    uh = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # ── 2. Ping action ──
    print("\n[2] Ping action...")
    s, body = _req("POST", f"{API_BASE}/ext/actions/run/ping", uh, {"params": {}})
    if s == 200 and (body.get("pong") or (body.get("data") or {}).get("pong")):
        ok("ping 回應正常")
    else:
        fail("ping 失敗", f"{s} {body}")

    # ── 3. 查商品（product_templates）──
    print("\n[3] 查商品...")
    s, body = _req("GET", f"{API_BASE}/ext/proxy/product_templates?limit=5", uh)
    if s == 200 and isinstance(body, list) and len(body) > 0:
        ok(f"取到 {len(body)} 筆商品")
        sample_product = body[0]
    else:
        fail("查商品失敗", f"{s} {body}")
        sample_product = None

    # ── 4. place_order action（用第一個商品下測試單）──
    print("\n[4] place_order action...")
    if not sample_product:
        fail("無商品可用，跳過", "")
    else:
        pid = sample_product["id"]
        pname = sample_product.get("name", "test")
        s, body = _req("POST", f"{API_BASE}/ext/actions/run/place_order", uh, {
            "params": {
                "items": [{"product_template_id": pid, "product_name": pname, "qty": 1, "price_unit": 0}],
                "note": "自動化測試單，請忽略",
                "delivery_date": "2026-04-16",
            }
        })
        if s == 200 and (body.get("order_id") or (body.get("data") or {}).get("order_id")):
            result = body.get("data") or body
            ok(f"下單成功：order_id={result.get('order_id')}, order_name={result.get('order_name')}")
        else:
            fail("place_order 失敗", f"{s} {body}")

    # ── 結果 ──
    print(f"\n{'='*30}")
    print(f"結果：{PASS} 通過，{FAIL} 失敗")
    if FAIL > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
