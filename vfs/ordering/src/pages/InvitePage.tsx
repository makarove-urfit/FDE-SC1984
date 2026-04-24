import { useState } from "react";
import { AppUser } from "../App";

interface Props {
  token: string;
  defaultEmail: string;
  onLogin: (u: AppUser) => void;
}

const API_BASE = (window as any).__API_BASE__ || "/api/v1";
const APP_SLUG = (window as any).__APP_SLUG__ || "";
const STORAGE_KEY = `custom_app_auth_${APP_SLUG}`;

export default function InvitePage({ token, defaultEmail, onLogin }: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "done">("form");

  const submit = async () => {
    if (!email.trim()) { setError("請輸入 Email"); return; }
    if (password.length < 6) { setError("密碼至少 6 個字元"); return; }
    if (password !== confirm) { setError("兩次密碼不一致"); return; }

    setLoading(true); setError("");
    try {
      // 建立帳號（若已存在則略過 409）
      const regResp = await fetch(`${API_BASE}/custom-app-auth/${APP_SLUG}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, display_name: email.trim() }),
      });
      if (!regResp.ok && regResp.status !== 409) {
        const b = await regResp.json().catch(() => ({}));
        throw new Error(b.detail || "帳號建立失敗");
      }

      // 登入取得 token
      const loginResp = await fetch(`${API_BASE}/custom-app-auth/${APP_SLUG}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!loginResp.ok) {
        const b = await loginResp.json().catch(() => ({}));
        throw new Error(b.detail || "登入失敗，請確認 Email 與密碼");
      }
      const loginData = await loginResp.json();
      const userToken: string = loginData.access_token;
      (window as any).__APP_TOKEN__ = userToken;

      // 兌換邀請 token，綁定分店
      await fetch(`${API_BASE}/ext/actions/run/redeem_invite_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ params: { token } }),
      });

      // 儲存登入狀態
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        access_token: userToken,
        user: loginData.user,
      }));

      // 清除 URL 中的 token
      window.history.replaceState({}, "", window.location.pathname + "#/products");

      onLogin(loginData.user);
    } catch (e: any) {
      setError(e?.message || "發生錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">設定下單密碼</h1>
          <p className="text-sm text-gray-500 mt-1">請設定您的登入密碼以開始使用</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={!!defaultEmail}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="至少 6 個字元"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">確認密碼</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="再輸入一次"
              onKeyDown={e => e.key === "Enter" && submit()}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading}
            className="w-full py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? "設定中..." : "確認並進入"}
          </button>
        </div>
      </div>
    </div>
  );
}
