import React, { useState, useMemo } from "react";
import * as db from "../db";
import { CartItem, AppUser, PriceEntry } from "../App";
import { Product } from "./CatalogProductCard";
import CartDateGroup from "./CartDateGroup";

function Toast({ msg, isError }: { msg: string; isError?: boolean }) {
  return <div className={`toast-msg${isError ? " error" : ""}`}>{msg}</div>;
}

interface Props {
  cart: CartItem[];
  addToCart: (id: string, qty: number, deliveryDate: string) => void;
  setCartExact: (id: string, qty: number, deliveryDate: string) => void;
  clearCartDate: (date: string) => void;
  setCartItemNote: (productId: string, deliveryDate: string, note: string) => void;
  onNavigate: (p: string) => void;
  setDeliveryDate: (d: string) => void;
  uomMap: Record<string, string>;
  user: AppUser;
  priceMap: Record<string, PriceEntry>;
  allTemplates: Product[];
  defaultNoteMap: Record<string, string>;
  setProductDefaultNote: (tmplId: string, note: string) => void;
  favoritesLoading: boolean;
}

export default function CartPage({ cart, addToCart, setCartExact, clearCartDate, setCartItemNote, onNavigate, setDeliveryDate, uomMap, user, priceMap, allTemplates, defaultNoteMap, setProductDefaultNote, favoritesLoading }: Props) {
  const [groupNotes, setGroupNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);

  const setAsDefault = (productId: string, note: string) => {
    const trimmed = (note || "").trim();
    if (!trimmed) return;
    setProductDefaultNote(productId, trimmed);
    showToast("已設為常用備註 ⭐");
  };

  const tmplMap = useMemo(() => {
    const m: Record<string, Product> = {};
    for (const t of allTemplates) m[t.id] = t;
    return m;
  }, [allTemplates]);

  const showToast = (msg: string, error = false) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3500);
  };

  const dateGroups = useMemo(() => {
    const groups: Record<string, CartItem[]> = {};
    for (const item of cart) {
      const key = item.deliveryDate || "";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => { if (!a) return 1; if (!b) return -1; return a.localeCompare(b); })
      .map(([date, items]) => ({ date, items }));
  }, [cart]);

  const handleSubmit = async (date: string) => {
    const items = cart.filter(i => i.deliveryDate === date);
    if (!date) { showToast("此組未指定配送日期，請回商品頁重新選擇日期後加入", true); return; }
    setSubmitting(date);
    try {
      const result = await db.runAction("place_order", {
        user_email: user.email,
        delivery_date: date,
        note: groupNotes[date] || "",
        items: items.map(item => ({
          product_template_id: item.productId,
          product_name: tmplMap[item.productId]?.name ?? "",
          qty: item.qty,
          price_unit: priceMap[item.productId]?.price ?? 0,
          note: ((item.note ?? defaultNoteMap[item.productId]) ?? "").trim(),
        })),
      });
      if (result?.error) throw new Error(result.error);
      clearCartDate(date);
      const [, m, d] = date.split("-").map(Number);
      showToast(`${m}/${d} 訂單已送出 ✅`);
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
        <button className="login-btn" onClick={() => onNavigate("/products")}>去點餐</button>
      </div>
    );
  }

  return (
    <div className="cart-page">
      {toast && <Toast msg={toast.msg} isError={toast.error} />}
      {dateGroups.map(({ date, items }) => (
        <CartDateGroup key={date} date={date} items={items} priceMap={priceMap} uomMap={uomMap} tmplMap={tmplMap}
          addToCart={addToCart} setCartExact={setCartExact}
          note={groupNotes[date] || ""} onNoteChange={n => setGroupNotes(prev => ({ ...prev, [date]: n }))}
          isSubmitting={submitting === date} onSubmit={() => handleSubmit(date)}
          setDeliveryDate={setDeliveryDate} onNavigate={onNavigate}
          defaultNoteMap={defaultNoteMap} setItemNote={setCartItemNote}
          setAsDefault={setAsDefault} favoritesLoading={favoritesLoading} />
      ))}
    </div>
  );
}
