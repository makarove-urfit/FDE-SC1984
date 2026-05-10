import React, { useMemo } from "react";

interface UrlReport {
  href: string;
  search: string;
  hash: string;
  liffState: string | null;
  liffStateParsed: Record<string, string> | null;
}

function parseUrl(): UrlReport {
  const url = new URL(window.location.href);
  const liffState = url.searchParams.get("liff.state");
  let liffStateParsed: Record<string, string> | null = null;
  if (liffState) {
    try {
      const inner = liffState.startsWith("?") ? liffState.slice(1) : liffState;
      const params = new URLSearchParams(inner);
      liffStateParsed = {};
      params.forEach((v, k) => { liffStateParsed![k] = v; });
    } catch { liffStateParsed = null; }
  }
  return {
    href: url.href,
    search: url.search,
    hash: url.hash,
    liffState,
    liffStateParsed,
  };
}

const PRE_STYLE: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  fontSize: 11,
  fontFamily: "ui-monospace, monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  margin: 0,
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  margin: "16px 0 8px",
  color: "#111827",
};

export default function LiffTestPage() {
  const urlReport = useMemo(parseUrl, []);
  const renderedAt = useMemo(() => new Date().toISOString(), []);

  return (
    <div style={{
      padding: 16,
      fontFamily: "system-ui, sans-serif",
      maxWidth: 720,
      margin: "0 auto",
      background: "#f9fafb",
      minHeight: "100vh",
    }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
        LIFF 參數測試頁
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
        目前是測試模式，正式登入暫時關閉
      </p>
      <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 16 }}>
        渲染時間：{renderedAt}
      </p>

      <div style={SECTION_TITLE}>區塊 2：URL 來源解析</div>
      <pre style={PRE_STYLE}>{JSON.stringify(urlReport, null, 2)}</pre>
    </div>
  );
}
