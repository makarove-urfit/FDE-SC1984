import React from "react";

export default function LiffTestPage() {
  return (
    <div style={{
      padding: 16,
      fontFamily: "system-ui, sans-serif",
      maxWidth: 720,
      margin: "0 auto",
      background: "#f9fafb",
      minHeight: "100vh",
    }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        LIFF 參數測試頁
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        目前是測試模式，正式登入暫時關閉
      </p>
    </div>
  );
}
