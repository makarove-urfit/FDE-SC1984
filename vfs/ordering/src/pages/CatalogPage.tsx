
import React, { useState, useEffect, useRef, useCallback } from "react";
import * as db from "../db";
import { Minus, Plus } from "lucide-react";
import { CartItem } from "../App";

interface Category { id: string; name: string; active: boolean; }
interface Product { id: string; name: string; default_code: string | null; categ_id: string | null; uom_id?: string | null; sale_ok: boolean; active: boolean; list_price?: number; }
interface CatData { ids: string[]; offset: number; hasMore: boolean; loading: boolean; }
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
interface Props {
  cart: CartItem[];
  addToCart: (id: string, qty: number, deliveryDate: string, meta?: { name?: string; defaultCode?: string; uomId?: string; productProductId?: string }) => void;
  setCartExact: (id: string, qty: number, deliveryDate: string) => void;
  uomMap: Record<string, string>;
  deliveryDate: string;
  setDeliveryDate: (d: string) => void;
  holidays: Set<string>;
  tmplToProd: Record<string, string>;
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
  const qty = cart.find(i => i.productId === p.id && i.deliveryDate === deliveryDate)?.qty ?? 0;
  return (
    <div className="product-card">
      <div className="product-info">
        <span className="product-code">{p.default_code || ""}</span>
        <span className="product-name">{p.name}</span>
      </div>
      <div className="product-price-block">
        {p.list_price != null && p.list_price > 0 && (
          <span className="product-price">${p.list_price}</span>
        )}
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

export default function CatalogPage({ cart, addToCart, setCartExact, uomMap, deliveryDate, setDeliveryDate, holidays, tmplToProd }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Product[] | null>(null); // null = 無搜尋
  const [searchLoading, setSearchLoading] = useState(false);
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
