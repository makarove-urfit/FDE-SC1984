import React from "react";

interface State { error: Error | null; }

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh", padding: "24px",
          fontFamily: "sans-serif", gap: "12px", textAlign: "center",
        }}>
          <div style={{ fontSize: "40px" }}>⚠️</div>
          <h2 style={{ fontSize: "18px", color: "#111" }}>發生錯誤，請重新整理</h2>
          <p style={{ fontSize: "13px", color: "#6b7280", maxWidth: "320px" }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px", background: "#16a34a", color: "#fff",
              border: "none", borderRadius: "8px", fontSize: "14px",
              fontWeight: 600, cursor: "pointer",
            }}
          >重新整理</button>
        </div>
      );
    }
    return this.props.children;
  }
}
