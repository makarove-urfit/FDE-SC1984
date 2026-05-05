import React from "react";
import { Minus, Plus, Trash2, Send } from "lucide-react";
import { CartItem, PriceEntry } from "../App";
import { Product } from "./CatalogProductCard";
import { BlockedInfo } from "../utils/cutoff";

const DAY_NAMES = ["日","一","二","三","四","五","六"];
function fmtDate(ymd: string): string {
  if (!ymd) return "未指定";
  const [y, m, d] = ymd.split("-").map(Number);
  return `${ymd}（週${DAY_NAMES[new Date(y, m-1, d).getDay()]}）`;
}
function fmtChip(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${m}/${d}（週${DAY_NAMES[new Date(y, m-1, d).getDay()]}）`;
}

interface Props {
  date: string; items: CartItem[];
  priceMap: Record<string, PriceEntry>; uomMap: Record<string, string>;
  tmplMap: Record<string, Product>;
  addToCart: (id: string, qty: number, date: string) => void;
  setCartExact: (id: string, qty: number, date: string) => void;
  note: string; onNoteChange: (n: string) => void;
  isSubmitting: boolean; onSubmit: () => void;
  setDeliveryDate: (d: string) => void; onNavigate: (p: string) => void;
  defaultNoteMap: Record<string, string>;
  setItemNote: (productId: string, deliveryDate: string, note: string) => void;
  setAsDefault: (productId: string, note: string) => void;
  favoritesLoading: boolean;
  blocked: BlockedInfo;
  availableDates: string[];
  onChangeDate: (newDate: string) => void;
}

export default function CartDateGroup({ date, items, priceMap, uomMap, tmplMap, addToCart, setCartExact, note, onNoteChange, isSubmitting, onSubmit, setDeliveryDate, onNavigate, defaultNoteMap, setItemNote, setAsDefault, favoritesLoading, blocked, availableDates, onChangeDate }: Props) {
  const groupTotal = items.reduce((sum, item) => sum + (priceMap[item.productId]?.price ?? 0) * item.qty, 0);
  const hasPrice = items.some(item => !!(priceMap[item.productId]));
  return (
    <div className="date-group">
      <div className="date-group-header">
        <span>📅 {date ? fmtDate(date) : "⚠️ 未指定配送日期"}</span>
        <span style={{ fontSize: "12px", opacity: 0.7 }}>{items.length} 項</span>
      </div>
      <div className="cart-list" style={{ margin: 0, borderRadius: 0 }}>
        {items.map(item => {
          const tmpl = tmplMap[item.productId];
          const pi = priceMap[item.productId];
          const subtotal = pi ? pi.price * item.qty : null;
          const effectiveNote = (item.note ?? defaultNoteMap[item.productId]) ?? "";
          const hasDefault = !!defaultNoteMap[item.productId];
          const matchesDefault = (defaultNoteMap[item.productId] || "") === effectiveNote.trim() && effectiveNote.trim().length > 0;
          return (
            <div key={item.productId} className="cart-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 6, borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                <div className="cart-item-info" style={{ flex: 1, minWidth: 0 }}>
                  <span className="product-code">{tmpl?.default_code || ""}</span>
                  <span className="product-name">{tmpl?.name || item.productId}</span>
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
                  <span className="qty-unit">{uomMap[tmpl?.uom_id ?? ""] || "件"}</span>
                  <button className="qty-btn" style={{ border: "1px solid #ef4444", color: "#ef4444" }}
                    onClick={() => setCartExact(item.productId, 0, date)}><Trash2 size={14} /></button>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 4 }}>
                {favoritesLoading ? (
                  <div style={{ flex: 1, fontSize: 12, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.2s ease-in-out infinite", color: "#9ca3af" }}>
                    載入常用備註中…
                  </div>
                ) : (
                <input type="text" placeholder={hasDefault ? "預設備註：" + defaultNoteMap[item.productId] : "本項備註（選填）"}
                  value={effectiveNote} onChange={e => setItemNote(item.productId, date, e.target.value)}
                  style={{ flex: 1, fontSize: 12, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, color: "#374151" }} />
                )}
                {!favoritesLoading && effectiveNote.trim() && !matchesDefault && (
                  <button type="button"
                    onClick={() => setAsDefault(item.productId, effectiveNote)}
                    title="把目前備註設為此品項的常用"
                    style={{ fontSize: 11, color: "#6b7280", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 6px", cursor: "pointer", whiteSpace: "nowrap" }}>
                    設為常用
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "8px 14px", background: "#fff" }}>
        <button onClick={() => { setDeliveryDate(date); onNavigate("/products"); }}
          style={{ width: "100%", padding: "8px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "#fff", color: "#6b7280", fontSize: "13px", cursor: "pointer", fontWeight: 500 }}>
          + 繼續選購
        </button>
      </div>
      {hasPrice && (
        <div className="cart-total" style={{ borderRadius: 0, borderLeft: "none", borderRight: "none" }}>
          <span>小計</span><strong>${Math.round(groupTotal * 100) / 100}</strong>
        </div>
      )}
      <div className="cart-note" style={{ borderRadius: 0, borderLeft: "none", borderRight: "none" }}>
        <textarea placeholder="此批備註（選填）" value={note} onChange={e => onNoteChange(e.target.value)} rows={2} />
      </div>
      <div style={{ padding: "0 14px 14px", borderRadius: "0 0 var(--radius) var(--radius)", background: "#fff" }}>
        {blocked.blocked && date ? (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "var(--radius)", padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              ⚠️ {blocked.reason}，請改選新的配送日期
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {availableDates.length === 0 && <span style={{ fontSize: 12, color: "#6b7280" }}>暫無可選日期</span>}
              {availableDates.map(d => (
                <button key={d} className="date-chip" onClick={() => onChangeDate(d)}
                  style={{ fontSize: 12 }}>
                  {fmtChip(d)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button className="submit-btn" style={{ width: "100%", borderRadius: "var(--radius)" }}
            onClick={onSubmit} disabled={!date || isSubmitting}>
            <Send size={18} /><span>{isSubmitting ? "送出中..." : `確定送出（${items.length} 項）`}</span>
          </button>
        )}
      </div>
    </div>
  );
}
