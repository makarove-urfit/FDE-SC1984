import React from "react";
import { Minus, Plus } from "lucide-react";
import { CartItem, PriceEntry } from "../App";

export interface Product {
  id: string; name: string; default_code: string | null;
  categ_id: string | null; uom_id?: string | null;
  sale_ok: boolean; active: boolean; list_price?: number;
}

export function SkeletonCard() {
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

export function ProductCard({ p, cart, addToCart, setCartExact, uomMap, deliveryDate, tmplToProd, priceMap }: {
  p: Product; cart: CartItem[];
  addToCart: (id: string, qty: number, deliveryDate: string, meta?: { name?: string; defaultCode?: string; uomId?: string; productProductId?: string }) => void;
  setCartExact: (id: string, qty: number, deliveryDate: string) => void;
  uomMap: Record<string, string>; deliveryDate: string;
  tmplToProd: Record<string, string>; priceMap: Record<string, PriceEntry>;
}) {
  const productProductId = tmplToProd[p.id];
  const qty = cart.find(i => i.productId === p.id && i.deliveryDate === deliveryDate)?.qty ?? 0;
  const price = priceMap[p.id]?.price ?? p.list_price ?? 0;
  const meta = { name: p.name, defaultCode: p.default_code ?? undefined, uomId: p.uom_id ?? undefined, productProductId };
  return (
    <div className="product-card">
      <div className="product-info">
        <span className="product-code">{p.default_code || ""}</span>
        <span className="product-name">{p.name}</span>
      </div>
      <div className="product-price-block">
        {price > 0 && <span className="product-price">${price}</span>}
        {priceMap[p.id]?.date && <span className="price-date">參考日期 {priceMap[p.id].date.slice(5).replace("-", "/")}</span>}
      </div>
      <div className="qty-control">
        <button className="qty-btn" disabled={qty === 0}
          onClick={() => { if (qty > 0) addToCart(p.id, -1, deliveryDate, meta); }}
        ><Minus size={14} /></button>
        <input type="number" step="1" min="0" className="qty-input" value={qty}
          onChange={e => setCartExact(p.id, Math.max(0, parseInt(e.target.value, 10) || 0), deliveryDate)} />
        <button className="qty-btn add" onClick={() => addToCart(p.id, 1, deliveryDate, meta)}
        ><Plus size={14} /></button>
        <span className="qty-unit">{uomMap[p.uom_id ?? ""] || "件"}</span>
      </div>
    </div>
  );
}
