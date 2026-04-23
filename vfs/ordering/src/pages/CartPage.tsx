import React, { useState, useEffect, useMemo } from "react";
import * as db from "../db";
import { Minus, Plus, Trash2, Send } from "lucide-react";
import { CartItem, AppUser } from "../App";

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
  const [priceMap, setPriceMap] = useState<Record<string, { price: number; effective_date: string }>>({});

  useEffect(() => {
    db.query("product_templates", { filters: [{ column: "active", op: "eq", value: true }] })
      .then(rows => {
        const m: Record<string, { name: string; default_code?: string; uom_id?: string }> = {};
        const pm: Record<string, { price: number; effective_date: string }> = {};
        for (const r of Array.isArray(rows) ? rows : []) {
          m[String(r.id)] = r;
          const lp = (r as any).list_price;
          if (lp != null && Number(lp) > 0) pm[String(r.id)] = { price: Number(lp), effective_date: "" };
        }
        setProdMap(m);
        setPriceMap(pm);
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
        state: "draft",
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
          price_unit: priceMap[item.productId]?.price ?? 0,
          delivery_date: date,
        })
      ));
      const failCount = lineResults.filter(r => r.status === "rejected").length;
      if (failCount > 0) throw new Error(`${failCount} 筆明細建立失敗`);

      const amount_total = items.reduce((sum, item) => {
        const price = priceMap[item.productId]?.price ?? 0;
        return sum + price * item.qty;
      }, 0);
      if (amount_total > 0) {
        await db.update("sale_orders", orderId, { amount_total: Math.round(amount_total * 100) / 100 });
      }

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
          const pi = priceMap[item.productId];
          return pi ? sum + pi.price * item.qty : sum;
        }, 0);
        const hasPrice = items.some(item => !!(priceMap[item.productId]));

        return (
          <div key={date} className="date-group">
            <div className="date-group-header">
              <span>📅 {date ? fmtDate(date) : "⚠️ 未指定配送日期"}</span>
              <span style={{ fontSize: "12px", opacity: 0.7 }}>{items.length} 項</span>
            </div>

            <div className="cart-list" style={{ margin: 0, borderRadius: 0 }}>
              {items.map(item => {
                const p = prodMap[item.productId];
                const pi = priceMap[item.productId];
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
