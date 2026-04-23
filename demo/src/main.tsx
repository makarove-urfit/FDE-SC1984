import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { getCurrentUser } from "./auth";

// 主題偵測
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");

// 啟動時取得用戶資訊
getCurrentUser().then((user) => {
  (window as any).__CURRENT_USER__ = user;
  const rootEl = (window as any).__CUSTOM_APP_ROOT__ || document.getElementById("root");
  ReactDOM.createRoot(rootEl!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}).catch(() => {
  const rootEl = (window as any).__CUSTOM_APP_ROOT__ || document.getElementById("root");
  ReactDOM.createRoot(rootEl!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
