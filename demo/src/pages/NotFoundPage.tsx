import React from "react";

export default function NotFoundPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", textAlign: "center" }}>
      <p style={{ fontSize: "4rem", margin: "0 0 0.5rem" }}>🔍</p>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 0.5rem" }}>404 — 找不到頁面</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>您要找的頁面不存在或已被移除。</p>
    </div>
  );
}
