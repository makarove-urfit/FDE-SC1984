import React, { useState, useMemo } from "react";
import * as db from "../db";
import { CartItem, AppUser, PriceEntry } from "../App";
import CartDateGroup from "./CartDateGroup";

function Toast({ msg, isError }: { msg: string; isError?: boolean }) {
  return <div className={`toast-msg${isError ? " error" : ""}`}>{msg}</div>;
}

interface Props {
  cart: CartItem[];
  addToCart: (id: string, qty: number, deliveryDate: string) => void;
  setCartExact: (id: string, qty: number, deliveryDate: string) => void;
  clearCartDate: (date: string) => void;
  onNavigate: (p: string) => void;
  setDeliveryDate: (d: string) => void;
  uomMap: Record<string, string>;
  user: AppUser;
  priceMap: Record<string, PriceEntry>;
}

export default function CartPage({ cart, addToCart, setCartExact, clearCartDate, onNavigate, setDeliveryDate, uomMap, user, priceMap }: Props) {
  const [groupNotes, setGroupNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);

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
          product_name: item.name || item.productId,
          qty: item.qty,
          price_unit: priceMap[item.productId]?.price ?? 0,
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
        <button className="login-btn" onClick={() => onNavigate("/order")}>去點餐</button>
      </div>
    );
  }

  return (
    <div className="cart-page">
      {toast && <Toast msg={toast.msg} isError={toast.error} />}
      {dateGroups.map(({ date, items }) => (
        <CartDateGroup key={date} date={date} items={items} priceMap={priceMap} uomMap={uomMap}
          addToCart={addToCart} setCartExact={setCartExact}
          note={groupNotes[date] || ""} onNoteChange={n => setGroupNotes(prev => ({ ...prev, [date]: n }))}
          isSubmitting={submitting === date} onSubmit={() => handleSubmit(date)}
          setDeliveryDate={setDeliveryDate} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
