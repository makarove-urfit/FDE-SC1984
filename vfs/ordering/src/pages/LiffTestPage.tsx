import React, { useEffect, useMemo, useState } from "react";

const LIFF_ID = "2009976374-VYUpM905";
const LIFF_SDK_SRC = "https://static.line-scdn.net/liff/edge/2/sdk.js";
const LIFF_LOAD_TIMEOUT_MS = 5000;

interface UrlReport {
  href: string;
  search: string;
  hash: string;
  liffState: string | null;
  liffStateParsed: Record<string, string> | null;
}

interface SdkReport {
  sdkLoad: "loading" | "ok" | "timeout" | string;
  init: "pending" | "ok" | string;
  isInClient: boolean | null;
  isLoggedIn: boolean | null;
  profile: { userId?: string; displayName?: string; pictureUrl?: string; statusMessage?: string } | string | null;
  idTokenPreview: string | null;
  decodedIdToken: any | string | null;
}

const INITIAL_SDK_REPORT: SdkReport = {
  sdkLoad: "loading",
  init: "pending",
  isInClient: null,
  isLoggedIn: null,
  profile: null,
  idTokenPreview: null,
  decodedIdToken: null,
};

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

const TEST_URLS = [
  `https://liff.line.me/${LIFF_ID}`,
  `https://liff.line.me/${LIFF_ID}?cust=ABC123`,
  `https://liff.line.me/${LIFF_ID}?cust=ABC&token=XYZ`,
  `https://liff.line.me/${LIFF_ID}#cust=ABC123`,
  `https://liff.line.me/${LIFF_ID}/some/path?cust=ABC`,
];

export default function LiffTestPage() {
  const urlReport = useMemo(parseUrl, []);
  const renderedAt = useMemo(() => new Date().toISOString(), []);
  const [sdk, setSdk] = useState<SdkReport>(INITIAL_SDK_REPORT);
  const [probeNonce, setProbeNonce] = useState(0);

  const copyAllAsJson = async () => {
    const payload = {
      renderedAt,
      userAgent: navigator.userAgent,
      url: urlReport,
      sdk,
    };
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      alert("已複製到剪貼簿");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); alert("已複製（fallback）"); }
      catch { alert("複製失敗，請手動 select pre 內文"); }
      document.body.removeChild(ta);
    }
  };

  const rerunProbe = () => setProbeNonce(n => n + 1);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    const probe = async () => {
      const liff = (window as any).liff;
      if (!liff) {
        if (!cancelled) setSdk(s => ({ ...s, sdkLoad: "error: window.liff missing" }));
        return;
      }
      try {
        await liff.init({ liffId: LIFF_ID });
      } catch (e: any) {
        if (!cancelled) setSdk(s => ({ ...s, init: "error: " + (e?.message || String(e)) }));
        return;
      }
      if (cancelled) return;

      const next: Partial<SdkReport> = { init: "ok" };
      try { next.isInClient = liff.isInClient(); } catch { next.isInClient = null; }
      try { next.isLoggedIn = liff.isLoggedIn(); } catch { next.isLoggedIn = null; }

      try {
        const p = await liff.getProfile();
        next.profile = p;
      } catch (e: any) {
        next.profile = "error: " + (e?.message || String(e));
      }

      try {
        const tok = liff.getIDToken();
        next.idTokenPreview = tok ? (tok.slice(0, 40) + "...") : null;
      } catch (e: any) {
        next.idTokenPreview = "error: " + (e?.message || String(e));
      }

      try {
        next.decodedIdToken = liff.getDecodedIDToken();
      } catch (e: any) {
        next.decodedIdToken = "error: " + (e?.message || String(e));
      }

      if (!cancelled) setSdk(s => ({ ...s, ...next }));
    };

    timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setSdk(s => s.sdkLoad === "loading" ? { ...s, sdkLoad: "timeout" } : s);
    }, LIFF_LOAD_TIMEOUT_MS);

    const existing = document.querySelector(`script[src="${LIFF_SDK_SRC}"]`) as HTMLScriptElement | null;
    if (existing && (window as any).liff) {
      setSdk(s => ({ ...s, sdkLoad: "ok" }));
      probe();
    } else {
      const script = existing || document.createElement("script");
      script.src = LIFF_SDK_SRC;
      script.async = true;
      script.onload = () => {
        if (cancelled) return;
        setSdk(s => ({ ...s, sdkLoad: "ok" }));
        probe();
      };
      script.onerror = () => {
        if (cancelled) return;
        setSdk(s => ({ ...s, sdkLoad: "error: script load failed" }));
      };
      if (!existing) document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [probeNonce]);

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

      <div style={SECTION_TITLE}>區塊 3：LIFF SDK 探測</div>
      <pre style={PRE_STYLE}>{JSON.stringify(sdk, null, 2)}</pre>

      <div style={SECTION_TITLE}>區塊 4：操作</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          onClick={copyAllAsJson}
          style={{
            padding: "8px 12px",
            fontSize: 13,
            background: "#10b981",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          複製全部結果為 JSON
        </button>
        <button
          onClick={rerunProbe}
          style={{
            padding: "8px 12px",
            fontSize: 13,
            background: "#fff",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          重新跑 SDK 探測
        </button>
      </div>

      <div style={{ ...SECTION_TITLE, fontSize: 12, color: "#6b7280" }}>
        測試 URL 範本（複製貼到 LINE 對話內點擊）
      </div>
      <pre style={PRE_STYLE}>{TEST_URLS.map((u, i) => `${i + 1}. ${u}`).join("\n")}</pre>
    </div>
  );
}
