"""
雄泉下單系統 — VFS 檔案內容（整合最新功能版）

包含：
- 日期選擇（明天起 30 天，排除假日）
- LINE OAuth（透過 AI GO 內建 custom-app-oauth）
- Email/密碼登入
- Shadow DOM 相容 CSS（:host, :root）
- 無 Zustand、無 Tailwind、無 Express 後端依賴

由 deploy_ordering.py 匯入使用。
"""
import json


def build_vfs(price_data: dict = None, holiday_dates: list = None, app_settings: dict = None) -> dict:
    """回傳完整的 VFS dict。
    price_data: {product_id: {price, effective_date}}
    holiday_dates: ["YYYY-MM-DD", ...] 未來假日列表（deploy 時用 admin bearer 拉，bake 進 JSON）
    app_settings: {key: value}

    x_holiday_settings 是 Custom Table（JSONB），custom-app-user bearer 無法存取
    /data/objects/ — 必須在部署時用 admin bearer 拉取後烘焙成靜態 JSON。
    """
    vfs = {}
    vfs["src/price_data.json"] = json.dumps(price_data or {}, ensure_ascii=False)
    vfs["src/holiday_data.json"] = json.dumps(holiday_dates or [], ensure_ascii=False)
    vfs["src/app_settings.json"] = json.dumps(app_settings or {}, ensure_ascii=False)

    # ── package.json ──
    vfs["package.json"] = json.dumps({
        "name": "xiong-quan-ordering",
        "private": True,
        "version": "2.0.0",
        "type": "module",
        "dependencies": {
            "react": "^18.2.0",
            "react-dom": "^18.2.0",
            "lucide-react": "^0.460.0"
        },
        "devDependencies": {
            "@types/react": "^18.2.0",
            "@types/react-dom": "^18.2.0",
            "typescript": "^5.0.0"
        }
    }, indent=2)

    # ── src/main.tsx ──
    vfs["src/main.tsx"] = r'''import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./App.css";

const rootEl = (window as any).__CUSTOM_APP_ROOT__ || document.getElementById("root");
ReactDOM.createRoot(rootEl!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
'''

    # ── src/App.tsx ──（以 currentPath state 取代 React Router，避免 Shadow DOM 路由問題）
    vfs["src/App.tsx"] = r'''import React, { useState, useEffect } from "react";
import LoginPage from "./pages/LoginPage";
import CatalogPage from "./pages/CatalogPage";
import CartPage from "./pages/CartPage";
import OrdersPage from "./pages/OrdersPage";
import BottomNav from "./components/BottomNav";
import * as db from "./db";
import APP_SETTINGS from "./app_settings.json";
import HOLIDAY_DATA from "./holiday_data.json";

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function getFirstAvailableDate(holidays: Set<string>): string {
  const today = new Date();
  for (let i = 1; i <= 60; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const ymd = toYMD(d);
    if (!holidays.has(ymd)) return ymd;
  }
  return toYMD(new Date(today.setDate(today.getDate() + 1)));
}

const APP_SLUG = (window as any).__APP_SLUG__ || "";
const STORAGE_KEY = `custom_app_auth_${APP_SLUG}`;
const CART_KEY = `cart_${APP_SLUG}`;

function loadUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.access_token) (window as any).__APP_TOKEN__ = data.access_token;
    return data.user || null;
  } catch { return null; }
}

export interface CartItem {
  productId: string;         // product_template.id
  productProductId?: string; // product_product.id（用於 priceMap 查詢）
  deliveryDate: string;
  qty: number;
  name?: string;
  defaultCode?: string;
  uomId?: string;
}

function loadCart(): CartItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    if (Array.isArray(raw)) return raw as CartItem[];
    // 從舊格式 Record<string,number> 遷移
    return Object.entries(raw as Record<string, number>)
      .filter(([, q]) => q > 0)
      .map(([productId, qty]) => ({ productId, deliveryDate: "", qty }));
  } catch { return []; }
}

export interface AppUser {
  id: string;
  email: string;
  display_name?: string;
}

const VALID_PATHS = ["/order", "/cart", "/orders"];

function getPath(): string {
  const h = window.location.hash.replace(/^#/, "");
  return VALID_PATHS.includes(h) ? h : "/order";
}

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState<string>(getPath);
  const [cart, setCart] = useState<CartItem[]>(loadCart);
  const [uomMap, setUomMap] = useState<Record<string, string>>({});
  const HOLIDAY_SET = new Set<string>(HOLIDAY_DATA as string[]);
  const [holidays] = useState<Set<string>>(HOLIDAY_SET);
  const [deliveryDate, setDeliveryDate] = useState<string>(() => getFirstAvailableDate(HOLIDAY_SET));
  const cutoffTime: string = (APP_SETTINGS as any).order_cutoff_time || "";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get("oauth_token");
    if (oauthToken) {
      try {
        const decoded = JSON.parse(atob(oauthToken));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(decoded));
        if (decoded.access_token) (window as any).__APP_TOKEN__ = decoded.access_token;
        if (decoded.user) setUser(decoded.user);
        window.history.replaceState({}, "", window.location.pathname);
      } catch {}
    } else {
      const u = loadUser();
      if (u) setUser(u);
    }
    setLoading(false);
  }, []);

  // 登入後載入計量單位對照表
  useEffect(() => {
    if (!user) return;
    db.query("uom_uom", { filters: [{ column: "active", op: "eq", value: true }] })
      .then(res => {
        const map: Record<string, string> = {};
        for (const u of Array.isArray(res) ? res : []) map[String(u.id)] = u.name;
        setUomMap(map);
      }).catch(() => {});
  }, [user]);

  // hash routing：同步 URL hash ↔ state
  const navigate = (path: string) => {
    window.location.hash = path;
    setCurrentPath(path);
  };
  useEffect(() => {
    const onHash = () => setCurrentPath(getPath());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const handleLogin = (u: AppUser) => setUser(u);

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CART_KEY);
    (window as any).__APP_TOKEN__ = "";
    setUser(null);
    setCart([]);
    setUomMap({});
    navigate("/order");
  };

  const addToCart = (productId: string, qty: number, delivDate: string, meta?: { name?: string; defaultCode?: string; uomId?: string; productProductId?: string }) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.productId === productId && i.deliveryDate === delivDate);
      if (idx >= 0) {
        const newQty = Number((prev[idx].qty + qty).toFixed(2));
        if (newQty <= 0) return prev.filter((_, i) => i !== idx);
        return prev.map((item, i) => i === idx ? { ...item, qty: newQty } : item);
      }
      if (qty > 0) return [...prev, { productId, deliveryDate: delivDate, qty: Number(qty.toFixed(2)), ...meta }];
      return prev;
    });
  };

  const setCartExact = (productId: string, exactQty: number, delivDate: string) => {
    setCart(prev => {
      const next = Number(exactQty.toFixed(2));
      if (next <= 0 || isNaN(next)) return prev.filter(i => !(i.productId === productId && i.deliveryDate === delivDate));
      const idx = prev.findIndex(i => i.productId === productId && i.deliveryDate === delivDate);
      if (idx >= 0) return prev.map((item, i) => i === idx ? { ...item, qty: next } : item);
      return [...prev, { productId, deliveryDate: delivDate, qty: next }];
    });
  };

  const clearCartDate = (date: string) => setCart(prev => prev.filter(i => i.deliveryDate !== date));
  const clearCart = () => setCart([]);

  // cart 變更時同步存 localStorage
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const cartCount = new Set(cart.map(i => i.deliveryDate)).size;

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
      <p>載入中...</p>
    </div>
  );

  if (!user) return <LoginPage onLogin={handleLogin} />;

  const pages: Record<string, React.ReactNode> = {
    "/order": <CatalogPage cart={cart} addToCart={addToCart} setCartExact={setCartExact} uomMap={uomMap} deliveryDate={deliveryDate} setDeliveryDate={setDeliveryDate} holidays={holidays} />,
    "/cart": <CartPage cart={cart} addToCart={addToCart} setCartExact={setCartExact} clearCartDate={clearCartDate} onNavigate={navigate} setDeliveryDate={setDeliveryDate} uomMap={uomMap} user={user} />,
    "/orders": <OrdersPage user={user!} cutoffTime={cutoffTime} />,
  };

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <h1>雄泉鮮食</h1>
        <button className="logout-btn" onClick={handleLogout}>登出</button>
      </header>
      <main className="app-page">{pages[currentPath] || pages["/order"]}</main>
      <BottomNav currentPath={currentPath} onNavigate={navigate} cartCount={cartCount} />
    </div>
  );
}
'''

    # ── src/App.css ──（Shadow DOM 相容，:host, :root）
    vfs["src/App.css"] = r''':host, :root {
  --primary: #16a34a;
  --primary-dark: #15803d;
  --danger: #ef4444;
  --text: #111827;
  --text-muted: #6b7280;
  --bg: #f9fafb;
  --bg-card: #ffffff;
  --border: #e5e7eb;
  --radius: 12px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif;
  color: var(--text);
}

html, :host {
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* App shell */
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}

.app-topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid var(--border);
}

.app-topbar h1 {
  font-size: 18px;
  font-weight: 700;
  color: var(--primary);
}

.logout-btn {
  font-size: 12px;
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
}

.app-page {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 72px;
}

/* Bottom nav */
.bottom-nav {
  flex-shrink: 0;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  background: #fff;
  border-top: 1px solid var(--border);
  z-index: 100;
}

.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 0;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
}

.nav-item.active { color: var(--primary); }

.nav-icon-wrap { position: relative; display: inline-flex; }

.cart-badge {
  position: absolute;
  top: -6px;
  right: -8px;
  background: var(--danger);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-label { font-size: 11px; }

/* Loading */
.loading-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 16px;
  color: var(--text-muted);
}

.page-loading {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Login */
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px 16px;
  background: var(--bg);
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: #fff;
  border-radius: var(--radius);
  padding: 32px 24px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
}

.login-logo {
  font-size: 48px;
  text-align: center;
  margin-bottom: 12px;
}

.login-card h2 {
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}

.login-subtitle {
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
  margin-bottom: 24px;
}

.login-input {
  display: block;
  width: 100%;
  padding: 10px 14px;
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 15px;
  background: #fff;
  color: var(--text);
}

.login-error {
  color: var(--danger);
  font-size: 13px;
  margin-bottom: 12px;
}

.login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 12px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 8px;
  text-decoration: none;
}

.login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.login-btn.line-btn { background: #06c755; }

.login-toggle {
  text-align: center;
  font-size: 13px;
  color: var(--primary);
  cursor: pointer;
  margin-top: 8px;
}

/* Catalog */
.catalog-page { padding: 0; }

.catalog-sticky {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--bg);
  padding: 12px 12px 0;
  border-bottom: 1px solid var(--border);
}

.search-bar {
  display: block;
  width: 100%;
  padding: 10px 14px;
  margin-bottom: 10px;
  border: 1px solid var(--border);
  border-radius: 24px;
  font-size: 14px;
  background: #fff;
  color: var(--text);
  box-sizing: border-box;
}

.date-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  margin-bottom: 10px;
}
.date-label {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}
.date-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}
.date-chips::-webkit-scrollbar { display: none; }
.date-chips-loading {
  padding: 6px 4px 0;
  font-size: 12px;
  color: var(--text-muted);
}
.date-chip {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-muted);
  white-space: nowrap;
  margin-top: 6px;
}
.date-chip-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: 8px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  pointer-events: none;
}

.date-chip.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
  font-weight: 600;
}

.cat-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 10px;
  scrollbar-width: none;
}

.cat-tabs::-webkit-scrollbar { display: none; }

.cat-tab {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: #fff;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-muted);
}

.cat-tab.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.product-grid { display: flex; flex-direction: column; gap: 8px; padding: 12px; }

.product-card {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: var(--radius);
  padding: 10px 12px;
  border: 1px solid var(--border);
  gap: 8px;
}

.product-info { flex: 1; min-width: 0; overflow: hidden; }
.product-code { font-size: 11px; color: var(--text-muted); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.product-name { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.product-price-block { text-align: right; flex-shrink: 0; }
.product-price { font-size: 15px; font-weight: 600; color: var(--primary); display: block; }
.price-date { font-size: 11px; color: var(--text-muted); display: block; }

.qty-control { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

.qty-btn {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: #fff;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
}

.qty-btn.add { background: var(--primary); color: #fff; border-color: var(--primary); }

.qty-input {
  width: 48px;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 4px;
  font-size: 14px;
  background: #fff;
  color: var(--text);
}

.qty-unit { font-size: 12px; color: var(--text-muted); width: 2em; min-width: 2em; }

.empty-msg { text-align: center; color: var(--text-muted); padding: 32px 0; }

/* Cart */
.cart-page { padding: 12px; }

.cart-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }

.cart-item {
  background: #fff;
  border-radius: var(--radius);
  padding: 12px 16px;
  border: 1px solid var(--border);
}

.cart-item-info { margin-bottom: 8px; }
.cart-item-info .product-name { font-weight: 500; }
.cart-price-summary { font-size: 12px; color: var(--text-muted); display: block; margin-top: 2px; }
.cart-price-summary strong { color: var(--primary); }
.cart-total {
  display: flex; justify-content: space-between; align-items: center;
  background: #fff; border-radius: var(--radius); padding: 12px 16px;
  border: 1px solid var(--border); font-size: 15px;
}
.cart-total strong { font-size: 18px; color: var(--primary); }

.date-select-wrap {
  background: #fff;
  border-radius: var(--radius);
  padding: 12px 16px;
  border: 1px solid var(--border);
  margin-bottom: 12px;
}

.date-select-wrap label {
  display: block;
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.date-selected {
  font-size: 14px;
  font-weight: 600;
  color: var(--primary);
  margin: 0;
}

.cart-note {
  background: #fff;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  margin-bottom: 12px;
  overflow: hidden;
}

.cart-note textarea {
  display: block;
  width: 100%;
  padding: 10px 14px;
  border: none;
  font-size: 14px;
  resize: none;
  font-family: inherit;
  background: #fff;
  color: var(--text);
}

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.empty-cart { text-align: center; padding: 48px 0; color: var(--text-muted); }
.empty-cart p { font-size: 20px; margin-bottom: 16px; }

.result-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 24px;
}

.result-card {
  text-align: center;
  background: #fff;
  border-radius: var(--radius);
  padding: 32px 24px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
}

.result-icon { font-size: 48px; margin-bottom: 12px; }
.result-card h2 { margin-bottom: 8px; }
.result-order { color: var(--text-muted); margin-bottom: 20px; }
.result-btn {
  display: block;
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 8px;
  background: var(--primary);
  color: #fff;
}

.result-btn.secondary { background: #fff; color: var(--text-muted); border: 1px solid var(--border); }

/* Toast */
.toast-msg {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--text);
  color: #fff;
  padding: 10px 20px;
  border-radius: 24px;
  font-size: 14px;
  z-index: 9999;
  pointer-events: none;
}

.toast-msg.error { background: var(--danger); }

/* Orders */
.orders-page { padding: 12px; }

.orders-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.orders-header h2 { font-size: 18px; font-weight: 700; }

.refresh-btn {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  color: var(--text-muted);
}

.order-list { display: flex; flex-direction: column; gap: 8px; }

.order-card {
  background: #fff;
  border-radius: var(--radius);
  padding: 14px 16px;
  border: 1px solid var(--border);
}

.order-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.order-name { font-weight: 600; font-size: 15px; }
.order-state {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  color: #fff;
}

.order-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 13px; color: var(--text-muted); margin-top: 4px; }
.order-remark { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.order-lines { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
.order-lines th { text-align: left; padding: 4px 0; color: var(--text-muted); font-weight: 600; border-bottom: 1px solid var(--border); }
.order-lines td { padding: 5px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
.order-lines tr:last-child td { border-bottom: none; }
.order-lines td:nth-child(2), .order-lines td:nth-child(3) { text-align: right; padding-right: 4px; white-space: nowrap; }
.order-lines th:nth-child(2), .order-lines th:nth-child(3) { text-align: right; }

.error-box {
  display: flex;
  gap: 8px;
  color: var(--danger);
  padding: 10px 14px;
  background: rgba(239,68,68,0.08);
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 14px;
}

/* Skeleton loading */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton-line {
  display: block;
  height: 14px;
  border-radius: 6px;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  width: 100%;
  margin-bottom: 6px;
}

.skeleton-line.short { width: 40%; }

.skeleton-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

.product-card.skeleton { pointer-events: none; }

/* CartPage date groups */
.date-group {
  background: #fff;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow: hidden;
  margin-bottom: 12px;
}

.date-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f0fdf4;
  border-bottom: 1px solid #bbf7d0;
  padding: 10px 14px;
  font-weight: 700;
  font-size: 14px;
  color: #166534;
}

.date-group-items { border-bottom: 1px solid var(--border); }

.date-group-footer {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* OrdersPage sort FAB */
.sort-fab {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  gap: 8px;
  padding: 8px 0 4px;
  background: var(--bg);
}

.sort-fab-btn {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: #fff;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.sort-fab-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

/* OrdersPage date group headers */
.order-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: #374151;
}

.order-group-divider {
  flex: 1;
  height: 1px;
  background: var(--border);
}

.past-orders-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0 16px;
  color: var(--text-muted);
  font-size: 12px;
}

.past-orders-divider-line {
  flex: 1;
  height: 1px;
  background: var(--border);
}
'''

    # ── src/auth.ts ──
    vfs["src/auth.ts"] = r'''const API_BASE = (window as any).__API_BASE__ || "/api/v1";
const APP_SLUG = (window as any).__APP_SLUG__ || "";

export interface AppUser {
  id: string;
  email: string;
  display_name?: string;
}

const STORAGE_KEY = `custom_app_auth_${APP_SLUG}`;

export async function getCurrentUser(): Promise<AppUser | null> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.access_token) (window as any).__APP_TOKEN__ = data.access_token;
    return data.user || null;
  } catch { return null; }
}
'''

    # ── src/db.ts ──
    vfs["src/db.ts"] = r'''const API_BASE = (window as any).__API_BASE__ || '/api/v1';
const APP_SLUG = (window as any).__APP_SLUG__ || '';
const proxyBase = API_BASE + '/ext/proxy/';

function _h(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = (window as any).__APP_TOKEN__ || '';
  if (t) h['Authorization'] = 'Bearer ' + t;
  return h;
}

async function _r(resp: Response): Promise<any> {
  if (!resp.ok) {
    const b = await resp.json().catch(() => ({}));
    throw new Error(b.detail || 'API Error (' + resp.status + ')');
  }
  return resp.json();
}

export async function query(table: string, opts?: { limit?: number; offset?: number; filters?: any[] }): Promise<any[]> {
  if (opts?.filters) {
    const body: any = { filters: opts.filters };
    if (opts.limit) body.limit = opts.limit;
    if (opts.offset) body.offset = opts.offset;
    return _r(await fetch(proxyBase + table + '/query', {
      method: 'POST', headers: _h(), credentials: 'include', body: JSON.stringify(body),
    }));
  }
  const p = new URLSearchParams();
  if (opts?.limit) p.set('limit', String(opts.limit));
  if (opts?.offset) p.set('offset', String(opts.offset));
  const qs = p.toString() ? '?' + p.toString() : '';
  return _r(await fetch(proxyBase + table + qs, { headers: _h(), credentials: 'include' }));
}

export async function insert(table: string, data: Record<string, any>): Promise<any> {
  return _r(await fetch(proxyBase + table, {
    method: 'POST', headers: _h(), credentials: 'include', body: JSON.stringify(data),
  }));
}

export async function fetchById(table: string, id: string): Promise<any | null> {
  const resp = await fetch(proxyBase + table + '/' + id, { headers: _h(), credentials: 'include' });
  if (!resp.ok) {
    console.error(`[db.fetchById] ${table}/${id} → ${resp.status}`, await resp.text().catch(() => ''));
    return null;
  }
  return resp.json();
}

export async function update(table: string, id: string, data: Record<string, any>): Promise<any> {
  return _r(await fetch(proxyBase + table + '/' + id, {
    method: 'PATCH', headers: _h(), credentials: 'include', body: JSON.stringify({ data }),
  }));
}

export async function queryCustom(slug: string): Promise<any[]> {
  const resp = await fetch(API_BASE + '/data/objects/' + slug + '/records', {
    headers: _h(), credentials: 'include',
  });
  if (!resp.ok) return [];
  return resp.json();
}

export async function runAction(actionName: string, params: Record<string, any> = {}): Promise<any> {
  const appId = (window as any).__APP_ID__ || '';
  const isExternal = !!(window as any).__IS_EXTERNAL__;
  const actionUrl = isExternal
    ? API_BASE + '/ext/actions/run/' + actionName
    : API_BASE + '/actions/run/' + appId + '/' + actionName;
  const resp = await fetch(actionUrl, {
    method: 'POST', headers: _h(), credentials: 'include',
    body: JSON.stringify({ params }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.detail || 'Action Error (' + resp.status + ')');
  }
  const result = await resp.json();
  if (result && result.status === 'error') throw new Error(result.message || 'Action Error');
  return result.data ?? result;
}
'''


    # src/api.ts 是 runtime 注入的 SDK，不放進 VFS

    # src/action.ts：SDK stub，標記 /* @ai-go-sdk */，內容與 AI GO 官方 SDK 一致，不自行修改
    vfs["src/action.ts"] = r'''/* @ai-go-sdk */
/**
 * Server-Side Action SDK — 供 Custom App 呼叫後端 Python Action
 * 透過 fetch 直接呼叫後端 API，觸發後端安全沙箱執行 Action。
 * 使用前需先在「開發」Tab 的 actions/ 目錄中建立 Action。
 */

const API_BASE = (window as any).__API_BASE__ || '/api/v1';

function _getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = (window as any).__APP_TOKEN__ || '';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}

/**
 * 呼叫後端 Action
 * @param actionName Action 名稱（需與 actions/ 目錄中的檔名一致）
 * @param params 傳入 Action 的參數
 * @returns {{ data, file }} — data 為 Action 回傳的 JSON，file 為檔案物件（若有）
 */
export async function runAction(
  actionName: string,
  params: Record<string, any> = {}
): Promise<any> {
  const appId = (window as any).__APP_ID__ || '';
  const isExternal = !!(window as any).__IS_EXTERNAL__;
  const actionUrl = isExternal
    ? API_BASE + '/ext/actions/run/' + actionName
    : API_BASE + '/actions/run/' + appId + '/' + actionName;
  const resp = await fetch(actionUrl, {
    method: 'POST',
    headers: _getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ params }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.detail || 'Action Error (' + resp.status + ')');
  }

  const result = await resp.json();
  if (result && result.status === 'error') {
    throw new Error(result.message || 'Action Error');
  }

  return {
    data: result.data || result,
    file: result.file || undefined,
  };
}

/**
 * 下載檔案（原生瀏覽器下載）
 * @param file 檔案物件，包含 content_base64, filename, mime_type 欄位
 */
export function downloadFile(file: any) {
  if (!file || !file.content_base64) return;

  // 將 base64 轉為 Blob 並觸發原生下載
  const byteChars = atob(file.content_base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: file.mime_type || 'application/octet-stream' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
'''

    # ── src/pages/LoginPage.tsx ──
    vfs["src/pages/LoginPage.tsx"] = r'''import React, { useState, useEffect } from "react";
import { AppUser } from "../App";

const API_BASE = (window as any).__API_BASE__ || "/api/v1";
const APP_SLUG = (window as any).__APP_SLUG__ || "";
const STORAGE_KEY = `custom_app_auth_${APP_SLUG}`;

interface Props { onLogin: (u: AppUser) => void; }

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasLine, setHasLine] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/custom-app-oauth/${APP_SLUG}/auth-providers`)
      .then(r => r.json())
      .then((data: any[]) => setHasLine(data.some(p => p.provider === "line")))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const endpoint = isRegister ? "register" : "login";
    const body: any = { email, password };
    if (isRegister) body.display_name = displayName || email.split("@")[0];
    try {
      const resp = await fetch(`${API_BASE}/custom-app-auth/${APP_SLUG}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || "登入失敗");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      (window as any).__APP_TOKEN__ = data.access_token;
      onLogin(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">🐟</div>
        <h2>雄泉鮮食</h2>
        <p className="login-subtitle">{isRegister ? "建立帳號" : "客戶登入"}</p>
        <form onSubmit={handleSubmit}>
          {isRegister && (
            <input type="text" placeholder="顯示名稱" value={displayName}
              onChange={e => setDisplayName(e.target.value)} className="login-input" />
          )}
          <input type="email" placeholder="Email" value={email} required
            onChange={e => setEmail(e.target.value)} className="login-input" />
          <input type="password" placeholder="密碼" value={password} required minLength={6}
            onChange={e => setPassword(e.target.value)} className="login-input" />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "處理中..." : isRegister ? "註冊" : "登入"}
          </button>
        </form>
        {hasLine && (
          <a href={`${API_BASE}/custom-app-oauth/${APP_SLUG}/line/authorize`} className="login-btn line-btn">
            LINE 登入
          </a>
        )}
        <p className="login-toggle" onClick={() => { setIsRegister(!isRegister); setError(""); }}>
          {isRegister ? "已有帳號？點此登入" : "沒有帳號？點此註冊"}
        </p>
      </div>
    </div>
  );
}
'''

    # ── src/pages/CatalogPage.tsx ──（per-category 自動分批載完 + server-side 搜尋）
    vfs["src/pages/CatalogPage.tsx"] = r"""
import React, { useState, useEffect, useRef, useCallback } from "react";
import * as db from "../db";
import { Minus, Plus } from "lucide-react";
import PRICE_DATA from "../price_data.json";
import { CartItem } from "../App";

interface Category { id: string; name: string; active: boolean; }
interface Product { id: string; name: string; default_code: string | null; categ_id: string | null; uom_id?: string | null; sale_ok: boolean; active: boolean; }
interface CatData { ids: string[]; offset: number; hasMore: boolean; loading: boolean; }
interface PriceInfo { price: number; effective_date: string; }

const priceMap: Record<string, PriceInfo> = PRICE_DATA as any;
const DAY_NAMES = ["日","一","二","三","四","五","六"];

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function getAvailableDates(holidays: Set<string>, lookahead = 30): string[] {
  const result: string[] = [];
  const today = new Date();
  for (let i = 1; i <= lookahead; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const ymd = toYMD(d);
    if (!holidays.has(ymd)) result.push(ymd);
  }
  return result;
}
function fmtDateChip(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  return `${m}/${d}（週${DAY_NAMES[dt.getDay()]}）`;
}
function fmtPriceDate(iso: string): string {
  const parts = iso.split("-");
  return parts.length < 3 ? iso : `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

interface Props {
  cart: CartItem[];
  addToCart: (id: string, qty: number, deliveryDate: string, meta?: { name?: string; defaultCode?: string; uomId?: string; productProductId?: string }) => void;
  setCartExact: (id: string, qty: number, deliveryDate: string) => void;
  uomMap: Record<string, string>;
  deliveryDate: string;
  setDeliveryDate: (d: string) => void;
  holidays: Set<string>;
}

function SkeletonCard() {
  return (
    <div className="product-card skeleton">
      <div className="product-info">
        <span className="skeleton-line short" />
        <span className="skeleton-line" />
      </div>
      <div className="qty-control"><div className="skeleton-btn" /></div>
    </div>
  );
}

function ProductCard({ p, cart, addToCart, setCartExact, uomMap, deliveryDate, tmplToProd }: {
  p: Product; cart: CartItem[];
  addToCart: (id: string, qty: number, deliveryDate: string, meta?: { name?: string; defaultCode?: string; uomId?: string; productProductId?: string }) => void;
  setCartExact: (id: string, qty: number, deliveryDate: string) => void;
  uomMap: Record<string, string>;
  deliveryDate: string;
  tmplToProd: Record<string, string>;
}) {
  const productProductId = tmplToProd[p.id];
  const priceInfo = priceMap[productProductId ?? p.id];
  const qty = cart.find(i => i.productId === p.id && i.deliveryDate === deliveryDate)?.qty ?? 0;
  return (
    <div className="product-card">
      <div className="product-info">
        <span className="product-code">{p.default_code || ""}</span>
        <span className="product-name">{p.name}</span>
      </div>
      <div className="product-price-block">
        {priceInfo && <>
          <span className="product-price">${priceInfo.price}</span>
          <span className="price-date">參考 {fmtPriceDate(priceInfo.effective_date)}</span>
        </>}
      </div>
      <div className="qty-control">
        <button className="qty-btn" disabled={qty === 0}
          onClick={() => { if (qty > 0) addToCart(p.id, -1, deliveryDate, { name: p.name, defaultCode: p.default_code, uomId: p.uom_id, productProductId }); }}
        ><Minus size={14} /></button>
        <input type="number" step="1" min="0" className="qty-input" value={qty}
          onChange={e => {
            const v = Math.max(0, parseInt(e.target.value, 10) || 0);
            setCartExact(p.id, v, deliveryDate);
          }} />
        <button className="qty-btn add" onClick={() => addToCart(p.id, 1, deliveryDate, { name: p.name, defaultCode: p.default_code, uomId: p.uom_id, productProductId })}
        ><Plus size={14} /></button>
        <span className="qty-unit">{uomMap[p.uom_id ?? ""] || "件"}</span>
      </div>
    </div>
  );
}

export default function CatalogPage({ cart, addToCart, setCartExact, uomMap, deliveryDate, setDeliveryDate, holidays }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Product[] | null>(null); // null = 無搜尋
  const [searchLoading, setSearchLoading] = useState(false);
  const [tmplToProd, setTmplToProd] = useState<Record<string, string>>({}); // product_tmpl_id → product_product.id

  useEffect(() => {
    db.query("product_product", { filters: [{ column: "active", op: "eq", value: true }] })
      .then(rows => {
        const m: Record<string, string> = {};
        for (const r of Array.isArray(rows) ? rows : []) {
          if (r.product_tmpl_id && r.id) m[String(r.product_tmpl_id)] = String(r.id);
        }
        setTmplToProd(m);
      }).catch(() => {});
  }, []);
  const [catLoading, setCatLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const flush = useCallback(() => setTick(t => t + 1), []);
  const availableDates = getAvailableDates(holidays);

  const poolRef = useRef<Map<string, Product>>(new Map());
  const catDataRef = useRef<Record<string, CatData>>({});
  const catsRef = useRef<Category[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 取某分類的下一批；完成後若 hasMore 自動繼續（不等 scroll）
  const fetchCat = useCallback((catId: string) => {
    const d = catDataRef.current[catId] ?? { ids: [], offset: 0, hasMore: true, loading: false };
    if (d.loading || !d.hasMore) return;
    catDataRef.current[catId] = { ...d, loading: true };
    flush();
    db.query("product_templates", {
      filters: [
        { column: "active", op: "eq", value: true },
        { column: "sale_ok", op: "eq", value: true },
        { column: "categ_id", op: "eq", value: catId },
      ],
      offset: d.offset,
      // limit 不指定，由 server 決定；回傳空陣列才停止
    }).then(res => {
      const batch: Product[] = Array.isArray(res) ? res : [];
      for (const p of batch) poolRef.current.set(p.id, p);
      const next: CatData = {
        ids: [...d.ids, ...batch.map(p => p.id)],
        offset: d.offset + batch.length,
        hasMore: batch.length > 0,
        loading: false,
      };
      catDataRef.current[catId] = next;
      // 自動繼續下一批，不等 scroll
      if (next.hasMore) setTimeout(() => fetchCat(catId), 0);
    }).catch(() => {
      catDataRef.current[catId] = { ...(catDataRef.current[catId] ?? d), loading: false };
    }).finally(flush);
  }, [flush]);


  // 載入分類 → 對所有分類併發啟動連鎖分批取資料
  useEffect(() => {
    db.query("product_categories")
      .then(res => {
        const raw = (Array.isArray(res) ? res : []).filter((c: any) => c.active !== false);
        const seen = new Set<string>(); const unique: Category[] = [];
        for (const c of raw) { if (!seen.has(c.name)) { seen.add(c.name); unique.push(c); } }
        catsRef.current = unique;
        setCategories(unique);
        for (const cat of unique) {
          catDataRef.current[cat.id] = { ids: [], offset: 0, hasMore: true, loading: false };
          fetchCat(cat.id);
        }
      })
      .finally(() => setCatLoading(false));
  }, [fetchCat]);

  // 搜尋：debounce 400ms 後打 server-side query（ilike）
  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!val.trim()) { setSearchResults(null); return; }
    searchTimer.current = setTimeout(() => {
      setSearchLoading(true);
      db.query("product_templates", {
        filters: [
          { column: "active", op: "eq", value: true },
          { column: "sale_ok", op: "eq", value: true },
          { column: "name", op: "ilike", value: `%${val.trim()}%` },
        ],
      }).then(res => {
        const results: Product[] = Array.isArray(res) ? res : [];
        for (const p of results) poolRef.current.set(p.id, p);
        setSearchResults(results);
      }).catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
    }, 400);
  }, []);

  // 計算顯示清單
  const catOrder = new Map(catsRef.current.map((c, i) => [c.id, i]));
  let displayed: Product[];
  if (searchResults !== null) {
    displayed = activeCat ? searchResults.filter(p => p.categ_id === activeCat) : searchResults;
  } else if (activeCat === null) {
    displayed = Array.from(poolRef.current.values()).sort((a, b) => {
      const ao = catOrder.get(a.categ_id ?? "") ?? 999;
      const bo = catOrder.get(b.categ_id ?? "") ?? 999;
      if (ao !== bo) return ao - bo;
      return (a.default_code || a.name).localeCompare(b.default_code || b.name);
    });
  } else {
    const d = catDataRef.current[activeCat];
    displayed = (d?.ids ?? []).map(id => poolRef.current.get(id)!).filter(Boolean);
  }

  const activeCatData = activeCat ? catDataRef.current[activeCat] : null;
  const showSkeleton = catLoading ||
    (searchResults === null && (activeCat === null
      ? poolRef.current.size === 0 && Object.values(catDataRef.current).some(d => d.loading)
      : !activeCatData || (activeCatData.ids.length === 0 && activeCatData.loading)));
  const poolLoading = Object.values(catDataRef.current).some(d => d.loading);
  const allDone = !poolLoading && Object.values(catDataRef.current).length > 0 &&
    Object.values(catDataRef.current).every(d => !d.hasMore);

  return (
    <div className="catalog-page">
      <div className="catalog-sticky">
        <input type="text" className="search-bar" placeholder="搜尋商品..."
          value={search} onChange={e => handleSearch(e.target.value)} />

        <div className="date-row">
          <span className="date-label">配送日期</span>
          <div className="date-chips">
            {availableDates.map(d => {
              const dateQty = cart.filter(i => i.deliveryDate === d).reduce((s, i) => s + i.qty, 0);
              return (
                <button key={d} className={`date-chip${deliveryDate === d ? " active" : ""}`}
                  onClick={() => setDeliveryDate(d)}
                  style={{ position: "relative" }}>
                  {fmtDateChip(d)}
                  {dateQty > 0 && (
                    <span className="date-chip-badge">{dateQty % 1 === 0 ? dateQty : dateQty.toFixed(1)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {catLoading ? (
          <div className="cat-tabs">
            <div className="skeleton-line" style={{ width: "200px", height: "32px", borderRadius: "20px" }} />
          </div>
        ) : (
          <div className="cat-tabs">
            <button className={`cat-tab ${activeCat === null ? "active" : ""}`}
              onClick={() => setActiveCat(null)}>全部</button>
            {categories.map(c => (
              <button key={c.id} className={`cat-tab ${activeCat === c.id ? "active" : ""}`}
                onClick={() => setActiveCat(c.id)}>{c.name}</button>
            ))}
          </div>
        )}
      </div>

      <div className="product-grid">
        {(showSkeleton || searchLoading)
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : displayed.length === 0
            ? <p className="empty-msg">{search ? "找不到符合的商品" : "沒有商品"}</p>
            : displayed.map(p => (
                <ProductCard key={p.id} p={p} cart={cart}
                  addToCart={addToCart} setCartExact={setCartExact} uomMap={uomMap} deliveryDate={deliveryDate} tmplToProd={tmplToProd} />
              ))
        }
        {!showSkeleton && !searchLoading && poolLoading && (
          <p className="empty-msg" style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px 0" }}>
            背景載入中… 已取得 {poolRef.current.size} 項
          </p>
        )}
        {!showSkeleton && !searchLoading && allDone && !search && (
          <p className="empty-msg" style={{ fontSize: "12px", padding: "16px 0" }}>
            已載入全部 {poolRef.current.size} 項商品
          </p>
        )}
      </div>
    </div>
  );
}
"""

    # ── src/pages/CartPage.tsx ──（按配送日期分組，每組獨立送出）
    vfs["src/pages/CartPage.tsx"] = r'''import React, { useState, useEffect, useMemo } from "react";
import * as db from "../db";
import { Minus, Plus, Trash2, Send } from "lucide-react";
import PRICE_DATA from "../price_data.json";
import { CartItem, AppUser } from "../App";

const priceMap: Record<string, { price: number; effective_date: string }> = PRICE_DATA as any;
const DAY_NAMES = ["日","一","二","三","四","五","六"];

function fmtDate(ymd: string): string {
  if (!ymd) return "未指定";
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  return `${ymd}（週${DAY_NAMES[dt.getDay()]}）`;
}

interface Props {
  cart: CartItem[];
  addToCart: (id: string, qty: number, deliveryDate: string, meta?: { name?: string; defaultCode?: string; uomId?: string; productProductId?: string }) => void;
  setCartExact: (id: string, qty: number, deliveryDate: string) => void;
  clearCartDate: (date: string) => void;
  onNavigate: (p: string) => void;
  setDeliveryDate: (d: string) => void;
  uomMap: Record<string, string>;
  user: AppUser;
}

function Toast({ msg, isError }: { msg: string; isError?: boolean }) {
  return <div className={`toast-msg${isError ? " error" : ""}`}>{msg}</div>;
}

export default function CartPage({ cart, addToCart, setCartExact, clearCartDate, onNavigate, setDeliveryDate, uomMap, user }: Props) {
  const [groupNotes, setGroupNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  const [prodMap, setProdMap] = useState<Record<string, { name: string; default_code?: string; uom_id?: string }>>({});

  useEffect(() => {
    db.query("product_templates", { filters: [{ column: "active", op: "eq", value: true }] })
      .then(rows => {
        const m: Record<string, { name: string; default_code?: string; uom_id?: string }> = {};
        for (const r of Array.isArray(rows) ? rows : []) m[String(r.id)] = r;
        setProdMap(m);
      }).catch(() => {});
  }, []);

  const showToast = (msg: string, error = false) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3500);
  };

  // 依配送日期分組，升冪排序（最早在上）
  const dateGroups: { date: string; items: CartItem[] }[] = useMemo(() => {
    const groups: Record<string, CartItem[]> = {};
    for (const item of cart) {
      const key = item.deliveryDate || "";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => {
        if (!a) return 1;
        if (!b) return -1;
        return a.localeCompare(b);
      })
      .map(([date, items]) => ({ date, items }));
  }, [cart]);

  const handleSubmit = async (date: string) => {
    const items = cart.filter(i => i.deliveryDate === date);
    if (items.length === 0) return;
    if (!date) { showToast("此組未指定配送日期，請回商品頁重新選擇日期後加入", true); return; }

    setSubmitting(date);
    try {
      const custs = await db.query("customers", {
        filters: [{ column: "email", op: "eq", value: user.email }],
      });
      if (!custs || custs.length === 0) throw new Error("帳號未開通下單權限，請聯絡管理員");
      const customerId = custs[0].id;
      const note = groupNotes[date] || "";

      const order = await db.insert("sale_orders", {
        customer_id: customerId,
        date_order: new Date().toISOString().slice(0, 10),
        note: `配送日期：${date}${note ? `\n${note}` : ""}`,
      });
      const orderId = order?.id;
      if (!orderId) throw new Error("建立訂單失敗");

      const lineResults = await Promise.allSettled(items.map(item =>
        db.insert("sale_order_lines", {
          order_id: orderId,
          product_template_id: item.productId,
          ...(item.productProductId ? { product_id: item.productProductId } : {}),
          name: prodMap[item.productId]?.name || item.productId,
          product_uom_qty: item.qty,
          price_unit: priceMap[item.productProductId ?? item.productId]?.price ?? 0,
          delivery_date: date,
        })
      ));
      const failCount = lineResults.filter(r => r.status === "rejected").length;
      if (failCount > 0) throw new Error(`${failCount} 筆明細建立失敗`);

      // 回寫 amount_total
      const amount_total = items.reduce((sum, item) => {
        const price = priceMap[item.productProductId ?? item.productId]?.price ?? 0;
        return sum + price * item.qty;
      }, 0);
      await db.update("sale_orders", orderId, { amount_total: Math.round(amount_total * 100) / 100 });

      clearCartDate(date);
      showToast(`${fmtDate(date)} 訂單已送出 ✅`);
    } catch (err: any) {
      showToast("下單失敗：" + (err.message || "未知錯誤"), true);
    } finally {
      setSubmitting(null);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="empty-cart">
        <p>🛒 購物車是空的</p>
        <button className="login-btn" onClick={() => onNavigate("/order")}>去點餐</button>
      </div>
    );
  }

  return (
    <div className="cart-page">
      {toast && <Toast msg={toast.msg} isError={toast.error} />}
      {dateGroups.map(({ date, items }) => {
        const isSubmitting = submitting === date;
        const groupTotal = items.reduce((sum, item) => {
          const pi = priceMap[item.productProductId ?? item.productId];
          return pi ? sum + pi.price * item.qty : sum;
        }, 0);
        const hasPrice = items.some(item => !!(priceMap[item.productProductId ?? item.productId]));

        return (
          <div key={date} className="date-group">
            <div className="date-group-header">
              <span>📅 {date ? fmtDate(date) : "⚠️ 未指定配送日期"}</span>
              <span style={{ fontSize: "12px", opacity: 0.7 }}>{items.length} 項</span>
            </div>

            <div className="cart-list" style={{ margin: 0, borderRadius: 0 }}>
              {items.map(item => {
                const p = prodMap[item.productId];
                const pi = priceMap[item.productProductId ?? item.productId];
                const subtotal = pi ? pi.price * item.qty : null;
                return (
                  <div key={item.productId} className="cart-item" style={{ borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}>
                    <div className="cart-item-info">
                      <span className="product-code">{p?.default_code || ""}</span>
                      <span className="product-name">{p?.name || item.productId}</span>
                      {pi && subtotal !== null && (
                        <span className="cart-price-summary">
                          ${pi.price} × {item.qty} = <strong>${Math.round(subtotal * 100) / 100}</strong>
                        </span>
                      )}
                    </div>
                    <div className="qty-control">
                      <button className="qty-btn" onClick={() => addToCart(item.productId, -1, date)}><Minus size={14} /></button>
                      <input type="number" step="0.1" className="qty-input" value={item.qty}
                        onChange={e => setCartExact(item.productId, parseFloat(e.target.value), date)} />
                      <button className="qty-btn add" onClick={() => addToCart(item.productId, 1, date)}><Plus size={14} /></button>
                      <span className="qty-unit">{uomMap[p?.uom_id ?? ""] || "件"}</span>
                      <button className="qty-btn" style={{ border: "1px solid #ef4444", color: "#ef4444" }}
                        onClick={() => setCartExact(item.productId, 0, date)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 繼續選購 — 品項最下、小計上 */}
            <div style={{ padding: "8px 14px", background: "#fff" }}>
              <button
                onClick={() => { setDeliveryDate(date); onNavigate("/order"); }}
                style={{ width: "100%", padding: "8px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "#fff", color: "#6b7280", fontSize: "13px", cursor: "pointer", fontWeight: 500 }}>
                + 繼續選購
              </button>
            </div>

            {hasPrice && (
              <div className="cart-total" style={{ borderRadius: 0, borderLeft: "none", borderRight: "none" }}>
                <span>小計</span>
                <strong>${Math.round(groupTotal * 100) / 100}</strong>
              </div>
            )}

            <div className="cart-note" style={{ borderRadius: 0, borderLeft: "none", borderRight: "none" }}>
              <textarea placeholder="此批備註（選填）"
                value={groupNotes[date] || ""}
                onChange={e => setGroupNotes(prev => ({ ...prev, [date]: e.target.value }))}
                rows={2} />
            </div>

            <div style={{ padding: "0 14px 14px", borderRadius: "0 0 var(--radius) var(--radius)", background: "#fff" }}>
              <button className="submit-btn" style={{ width: "100%", borderRadius: "var(--radius)" }}
                onClick={() => handleSubmit(date)}
                disabled={!date || isSubmitting}>
                <Send size={18} />
                <span>{isSubmitting ? "送出中..." : `確定送出（${items.length} 項）`}</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
'''

    # ── src/pages/OrdersPage.tsx ──（預設按配送日期分組，可切換下單日期）
    vfs["src/pages/OrdersPage.tsx"] = r'''import React, { useState, useEffect, useMemo } from "react";
import * as db from "../db";
import { AppUser } from "../App";
import { RefreshCw } from "lucide-react";

const STATE_LABELS: Record<string, string> = {
  draft: "已送出", sent: "已送出", sale: "已確認", done: "完成", cancel: "已取消",
};
const STATE_COLORS: Record<string, string> = {
  draft: "#3b82f6", sent: "#3b82f6", sale: "#10b981", done: "#6b7280", cancel: "#ef4444",
};

const DAY_NAMES_O = ["日","一","二","三","四","五","六"];
function fmtDateHeader(ymd: string): string {
  if (!ymd || ymd === "未排程") return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  return `${ymd}（週${DAY_NAMES_O[dt.getDay()]}）`;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function parseDeliveryDate(note: string, lines: any[]): string {
  // 優先從 lines 取
  const fromLine = lines.find((l: any) => l.delivery_date)?.delivery_date;
  if (fromLine) return String(fromLine).slice(0, 10);
  // fallback 解析 note
  const m = note?.match(/配送日期：(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}
function parseNote(note: string): string {
  return (note || "").replace(/配送日期：\d{4}-\d{2}-\d{2}\n?/, "").trim();
}
function canEditOrder(order: any, cutoffTime: string, lines: any[]): boolean {
  if (order.state !== "draft") return false;
  const delivery = parseDeliveryDate(order.note || "", lines);
  if (!delivery) return true;
  const now = new Date();
  const todayYMD = toYMD(now);
  if (cutoffTime) {
    const [cutH, cutM] = cutoffTime.split(":").map(Number);
    const isPastCutoff = now.getHours() * 60 + now.getMinutes() >= cutH * 60 + cutM;
    if (isPastCutoff) return delivery > todayYMD;
  }
  return delivery >= todayYMD;
}

interface OrderWithLines { order: any; lines: any[]; }

export default function OrdersPage({ user, cutoffTime }: { user: AppUser; cutoffTime: string }) {
  const [items, setItems] = useState<OrderWithLines[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorInfo, setErrorInfo] = useState("");
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [editQtys, setEditQtys] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [sortBy, setSortBy] = useState<"delivery_date" | "order_date">("delivery_date");

  const load = async () => {
    setLoading(true);
    setErrorInfo("");
    setEditOrderId(null);
    try {
      const custs = await db.query("customers", {
        filters: [{ column: "email", op: "eq", value: user.email }],
      });
      const cust = Array.isArray(custs) ? custs[0] : null;
      if (!cust) { setItems([]); return; }

      const orders = await db.query("sale_orders", {
        filters: [{ column: "customer_id", op: "eq", value: cust.id }],
      });
      const list: any[] = Array.isArray(orders) ? orders : [];
      // 先依下單日期降冪排序（作為次排序依據）
      list.sort((a, b) =>
        new Date(b.date_order || 0).getTime() - new Date(a.date_order || 0).getTime()
      );


      const results = await Promise.all(list.map(async o => {
        const lines = await db.query("sale_order_lines", {
          filters: [{ column: "order_id", op: "eq", value: o.id }],
        });
        return { order: o, lines: Array.isArray(lines) ? lines : [] };
      }));
      setItems(results);
    } catch (err: any) {
      setErrorInfo(err.message || "載入失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (o: any, lines: any[]) => {
    const qtys: Record<string, number> = {};
    for (const l of lines) qtys[l.id] = Number(l.product_uom_qty || 0);
    setEditQtys(qtys);
    setEditOrderId(o.id);
  };

  const saveEdit = async (orderId: string, lines: any[]) => {
    setSaving(true);
    try {
      await db.runAction("update_order_lines", {
        order_id: orderId,
        lines: lines.map(l => ({ id: l.id, qty: editQtys[l.id] ?? Number(l.product_uom_qty || 0) })),
      });
      const [newOrders, newLines] = await Promise.all([
        db.query("sale_orders", { filters: [{ column: "id", op: "eq", value: orderId }] }),
        db.query("sale_order_lines", { filters: [{ column: "order_id", op: "eq", value: orderId }] }),
      ]);
      const newOrder = Array.isArray(newOrders) ? newOrders[0] : null;
      setItems(prev => prev.map(item =>
        item.order.id === orderId
          ? {
              order: newOrder ?? item.order,
              lines: Array.isArray(newLines) ? newLines : item.lines,
            }
          : item
      ));
      setEditOrderId(null);
    } catch (err: any) {
      alert("儲存失敗：" + (err.message || "未知錯誤"));
    } finally {
      setSaving(false);
    }
  };

  const todayYMD = toYMD(new Date());

  // 依所選模式分組；配送日期模式下分為 upcoming / past 兩段
  const { upcoming, past } = useMemo(() => {
    if (sortBy !== "delivery_date") return { upcoming: [] as { date: string; orders: OrderWithLines[] }[], past: [] };

    const groups: Record<string, OrderWithLines[]> = {};
    for (const item of items) {
      const key = parseDeliveryDate(item.order.note || "", item.lines) || "未排程";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    const upcomingKeys: string[] = [];
    const pastKeys: string[] = [];
    for (const k of Object.keys(groups)) {
      if (k === "未排程" || k >= todayYMD) upcomingKeys.push(k);
      else pastKeys.push(k);
    }
    upcomingKeys.sort((a, b) => a === "未排程" ? 1 : b === "未排程" ? -1 : a.localeCompare(b));
    pastKeys.sort((a, b) => b.localeCompare(a)); // 最近的過期在上
    return {
      upcoming: upcomingKeys.map(k => ({ date: k, orders: groups[k] })),
      past: pastKeys.map(k => ({ date: k, orders: groups[k] })),
    };
  }, [items, sortBy, todayYMD]);

  const dateGroups = useMemo(() => {
    if (sortBy === "delivery_date") return [];
    const groups: Record<string, OrderWithLines[]> = {};
    for (const item of items) {
      const key = (item.order.date_order || "").slice(0, 10) || "未知";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.keys(groups)
      .sort((a, b) => a === "未知" ? 1 : b === "未知" ? -1 : b.localeCompare(a))
      .map(k => ({ date: k, orders: groups[k] }));
  }, [items, sortBy]);

  const renderOrderCard = (o: any, lines: any[]) => {
    const s = typeof o.state === "string" ? o.state : "";
    const delivery = parseDeliveryDate(o.note || "", lines);
    const orderDate = (o.date_order || "").slice(0, 10);
    const remark = parseNote(o.note || "");
    const rawTotal = typeof o.amount_total === "number" && o.amount_total > 0
      ? o.amount_total
      : lines.reduce((sum, l) => sum + (Number(l.price_unit) || 0) * (Number(l.product_uom_qty) || 0), 0);
    const total = rawTotal > 0 ? rawTotal.toLocaleString("zh-TW", { minimumFractionDigits: 0 }) : null;
    const isEditing = editOrderId === o.id;
    const editable = canEditOrder(o, cutoffTime, lines);
    return (
      <div key={o.id} className="order-card">
        <div className="order-top">
          <span className="order-name">{String(o.name || `訂單 ${String(o.id).slice(0, 8)}`)}</span>
          <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
            {editable && !isEditing && (
              <button onClick={() => startEdit(o, lines)} title="修改訂單"
                style={{ background:"none", border:"none", padding:"2px", cursor:"pointer", color:"#9ca3af", display:"flex", alignItems:"center" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            )}
            <span className="order-state" style={{ background: STATE_COLORS[s] || "#999" }}>
              {STATE_LABELS[s] || s || "—"}
            </span>
          </div>
        </div>
        <div className="order-meta">
          <span>🗓 下單：{orderDate || "—"}</span>
          <span>📅 配送：{delivery || "未排程"}</span>
          {total && <span>💰 ${total}</span>}
        </div>
        {remark && <div className="order-remark">📝 {remark}</div>}
        {lines.length > 0 && (
          <table className="order-lines">
            <thead>
              <tr><th>品項</th><th>數量</th><th>單價</th></tr>
            </thead>
            <tbody>
              {lines.map((l: any) => (
                <tr key={l.id}>
                  <td>{String(l.name || l.id || "")}</td>
                  <td>
                    {isEditing ? (
                      <input
                        type="text" inputMode="decimal"
                        value={editQtys[l.id] ?? Number(l.product_uom_qty || 0)}
                        onChange={e => {
                          const v = e.target.value;
                          if (/^\d*\.?\d*$/.test(v)) setEditQtys(prev => ({ ...prev, [l.id]: v as any }));
                        }}
                        onBlur={e => setEditQtys(prev => ({ ...prev, [l.id]: parseFloat(e.target.value) || 0 }))}
                        style={{ width: "64px", padding: "2px 6px", border: "1px solid #d1d5db", borderRadius: "4px", fontSize: "14px", textAlign: "right" }}
                      />
                    ) : (l.product_uom_qty ?? "—")}
                  </td>
                  <td>{typeof l.price_unit === "number" ? `$${l.price_unit.toLocaleString()}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isEditing && (
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button onClick={() => saveEdit(o.id, lines)} disabled={saving}
              style={{ flex: 1, padding: "8px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", cursor: "pointer", fontWeight: 600 }}
            >{saving ? "儲存中..." : "儲存"}</button>
            <button onClick={() => setEditOrderId(null)} disabled={saving}
              style={{ flex: 1, padding: "8px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", cursor: "pointer", color: "#374151" }}
            >取消</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="orders-page">
      {/* 懸浮排序按鈕 */}
      <div className="sort-fab">
        <button className={`sort-fab-btn${sortBy === "delivery_date" ? " active" : ""}`}
          onClick={() => setSortBy("delivery_date")}>📅 配送日期</button>
        <button className={`sort-fab-btn${sortBy === "order_date" ? " active" : ""}`}
          onClick={() => setSortBy("order_date")}>🗓 下單日期</button>
      </div>

      <div className="orders-header">
        <h2>訂單紀錄</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}><RefreshCw size={16} /></button>
      </div>
      {errorInfo && <div className="error-box">無法讀取訂單：{errorInfo}</div>}
      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : !errorInfo && items.length === 0 ? (
        <p className="empty-msg">尚無訂單</p>
      ) : (
        <div>
          {sortBy === "delivery_date" ? (
            <>
              {upcoming.map(({ date, orders: groupOrders }) => (
                <div key={date} style={{ marginBottom: "16px" }}>
                  <div className="order-group-header">
                    <span>📅 {fmtDateHeader(date)}</span>
                    <span style={{ fontSize: "12px" }}>{groupOrders.length} 筆</span>
                    <div className="order-group-divider" />
                  </div>
                  <div className="order-list">
                    {groupOrders.map(({ order: o, lines }) => renderOrderCard(o, lines))}
                  </div>
                </div>
              ))}
              {past.length > 0 && (
                <>
                  <div className="past-orders-divider">
                    <div className="past-orders-divider-line" />
                    <span>以上為過去訂單</span>
                    <div className="past-orders-divider-line" />
                  </div>
                  {past.map(({ date, orders: groupOrders }) => (
                    <div key={date} style={{ marginBottom: "16px", opacity: 0.6 }}>
                      <div className="order-group-header">
                        <span>📅 {fmtDateHeader(date)}</span>
                        <span style={{ fontSize: "12px" }}>{groupOrders.length} 筆</span>
                        <div className="order-group-divider" />
                      </div>
                      <div className="order-list">
                        {groupOrders.map(({ order: o, lines }) => renderOrderCard(o, lines))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            dateGroups.map(({ date, orders: groupOrders }) => (
              <div key={date} style={{ marginBottom: "16px" }}>
                <div className="order-group-header">
                  <span>🗓 {fmtDateHeader(date)}</span>
                  <span style={{ fontSize: "12px" }}>{groupOrders.length} 筆</span>
                  <div className="order-group-divider" />
                </div>
                <div className="order-list">
                  {groupOrders.map(({ order: o, lines }) => renderOrderCard(o, lines))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
'''

    # ── src/components/ErrorBoundary.tsx ──
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
              padding: "10px 24px", background: "#16a34a", color: "#fff",
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

    # ── src/components/BottomNav.tsx ──
    vfs["src/components/BottomNav.tsx"] = r'''import React from "react";
import { Package, ShoppingCart, ClipboardList } from "lucide-react";

const tabs = [
  { path: "/order", icon: Package, label: "商品" },
  { path: "/cart", icon: ShoppingCart, label: "購物車" },
  { path: "/orders", icon: ClipboardList, label: "訂單" },
];

interface Props {
  currentPath: string;
  onNavigate: (p: string) => void;
  cartCount: number;
}

export default function BottomNav({ currentPath, onNavigate, cartCount }: Props) {
  return (
    <nav className="bottom-nav">
      {tabs.map(t => (
        <button key={t.path} className={`nav-item ${currentPath === t.path ? "active" : ""}`}
          onClick={() => onNavigate(t.path)}>
          <div className="nav-icon-wrap">
            <t.icon size={22} />
            {t.path === "/cart" && cartCount > 0 && (
              <span className="cart-badge">{cartCount > 9 ? "9+" : cartCount}</span>
            )}
          </div>
          <span className="nav-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
'''

    # ── src/pages/_manifest.json ──
    vfs["src/pages/_manifest.json"] = json.dumps({
        "/": {"title": "商品目錄", "order": 0},
        "/cart": {"title": "購物車", "order": 1},
        "/orders": {"title": "訂單紀錄", "order": 2},
    }, ensure_ascii=False, indent=2)

    vfs["src/data.json"] = "{}"
    vfs["src/db.json"] = "{}"

    # ── actions/manifest.json ──
    vfs["actions/manifest.json"] = json.dumps({
        "ping": {"description": "健康檢查"},
        "place_order": {"description": "客戶下單：建立銷貨單與明細行"},
        "update_order_lines": {"description": "修改訂單明細數量（需 admin 權限）"},
    }, ensure_ascii=False, indent=2)

    # ── actions/place_order.py ──（使用 ctx.db API，不使用 SQLAlchemy）
    vfs["actions/ping.py"] = r'''def execute(ctx):
    ctx.response.json({"pong": True})
'''

    vfs["actions/place_order.py"] = r'''def execute(ctx):
    from datetime import datetime, timezone

    items = ctx.params.get("items", [])
    note = ctx.params.get("note", "")
    delivery_date = ctx.params.get("delivery_date", "")
    user_email = ctx.params.get("user_email", "")

    if not items or not user_email:
        ctx.response.json({"error": "缺少必要參數"})
        return

    today = delivery_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    date_order = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # ctx.db.query 只支援 limit，無 filter，需 Python 側過濾
    customers = ctx.db.query("customers", limit=500)
    customer_id = None
    for c in (customers or []):
        if c.get("email") == user_email:
            customer_id = c.get("id")
            break

    if not customer_id:
        new_cust = ctx.db.insert("customers", {
            "name": user_email.split("@")[0],
            "email": user_email,
            "customer_type": "company",
        })
        customer_id = new_cust.get("id") if new_cust else None

    if not customer_id:
        ctx.response.json({"error": "無法找到或建立客戶記錄"})
        return

    order_note = f"配送日期：{today}"
    if note:
        order_note += f"\n{note}"

    order = ctx.db.insert("sale_orders", {
        "customer_id": customer_id,
        "date_order": date_order,
        "note": order_note,
    })

    order_id = order.get("id") if order else None
    if not order_id:
        ctx.response.json({"error": "建立訂單失敗"})
        return

    for item in items:
        result = ctx.db.insert("sale_order_lines", {
            "order_id": order_id,
            "product_template_id": item.get("product_template_id"),
            "name": item.get("product_name", ""),
            "product_uom_qty": item.get("qty", 1),
            "price_unit": item.get("price_unit", 0),
            "delivery_date": today,
        })
        if not result or not result.get("id"):
            ctx.response.json({"error": f"明細建立失敗：{item.get('product_name')}"})
            return

    ctx.response.json({
        "order_id": order_id,
        "order_name": order.get("name") or f"SO-{str(order_id)[:8]}",
        "delivery_date": today,
        "items_count": len(items),
    })
'''

    vfs["actions/update_order_lines.py"] = r'''def execute(ctx):
    """修改訂單明細數量，並重算 sale_orders.amount_total。
    params: { order_id: str, lines: [{id: str, qty: number}] }
    後端以 admin 身份執行，繞過 ext/proxy 的欄位限制。
    """
    order_id = ctx.params.get("order_id", "")
    lines = ctx.params.get("lines", [])

    if not order_id or not lines:
        ctx.response.json({"error": "缺少必要參數"})
        return

    # 建立 id → qty 對照表
    qty_map = {item["id"]: item["qty"] for item in lines if item.get("id") is not None}

    for line_id, qty in qty_map.items():
        try:
            ctx.db.update("sale_order_lines", line_id, {"product_uom_qty": qty})
        except Exception as e:
            ctx.response.json({"error": f"更新明細 {line_id} 失敗：{str(e)}"})
            return

    # 重取所有明細，重算金額
    def _oid(val):
        if isinstance(val, list): return str(val[0])
        return str(val) if val is not None else ""

    all_lines = ctx.db.query("sale_order_lines", limit=500)
    order_lines = [l for l in (all_lines or []) if _oid(l.get("order_id")) == str(order_id)]
    amount_total = round(sum(
        float(l.get("product_uom_qty") or 0) * float(l.get("price_unit") or 0)
        for l in order_lines
    ), 2)

    # 寫回訂單總金額
    try:
        ctx.db.update("sale_orders", order_id, {"amount_total": amount_total})
    except Exception as e:
        ctx.response.json({"error": f"更新訂單金額失敗：{str(e)}"})
        return

    # 重取該訂單確認寫入結果
    all_orders = ctx.db.query("sale_orders", limit=500)
    order = next((o for o in (all_orders or []) if str(o.get("id")) == str(order_id)), None)
    confirmed_total = float(order.get("amount_total") or 0) if order else amount_total

    ctx.response.json({"updated": len(qty_map), "amount_total": confirmed_total})
'''

    return vfs
