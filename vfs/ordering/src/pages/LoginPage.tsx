import React, { useState, useEffect } from "react";
import { AppUser } from "../App";

const API_BASE = (window as any).__API_BASE__ || "/api/v1";
const APP_SLUG = (window as any).__APP_SLUG__ || "";
const STORAGE_KEY = `custom_app_auth_${APP_SLUG}`;

interface Props { onLogin: (u: AppUser) => void; }

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasLine, setHasLine] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/custom-app-oauth/${APP_SLUG}/auth-providers`)
      .then(r => r.json())
      .then((data: any[]) => setHasLine(data.some(p => p.provider === "line")))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const endpoint = isRegister ? "register" : "login";
    const body: any = { email, password };
    if (isRegister) body.display_name = displayName || email.split("@")[0];
    try {
      const resp = await fetch(`${API_BASE}/custom-app-auth/${APP_SLUG}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || "登入失敗");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      (window as any).__APP_TOKEN__ = data.access_token;
      onLogin(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">🐟</div>
        <h2>雄泉鮮食</h2>
        <p className="login-subtitle">{isRegister ? "建立帳號" : "客戶登入"}</p>
        <form onSubmit={handleSubmit}>
          {isRegister && (
            <input type="text" placeholder="顯示名稱" value={displayName}
              onChange={e => setDisplayName(e.target.value)} className="login-input" />
          )}
          <input type="email" placeholder="Email" value={email} required
            onChange={e => setEmail(e.target.value)} className="login-input" />
          <input type="password" placeholder="密碼" value={password} required minLength={6}
            onChange={e => setPassword(e.target.value)} className="login-input" />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "處理中..." : isRegister ? "註冊" : "登入"}
          </button>
        </form>
        {hasLine && (
          <a href={`${API_BASE}/custom-app-oauth/${APP_SLUG}/line/authorize`} className="login-btn line-btn">
            LINE 登入
          </a>
        )}
        <p className="login-toggle" onClick={() => { setIsRegister(!isRegister); setError(""); }}>
          {isRegister ? "已有帳號？點此登入" : "沒有帳號？點此註冊"}
        </p>
      </div>
    </div>
  );
}
