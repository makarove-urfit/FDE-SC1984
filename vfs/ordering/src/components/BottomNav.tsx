import React from "react";
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
