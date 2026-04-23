import React, { useState, useEffect } from "react";
import AppSidebar from "./AppSidebar";
import AppHeader from "./AppHeader";
import { useLocation } from "react-router-dom";

interface Props {
  children: React.ReactNode;
  appName: string;
}

export default function AppLayout({ children, appName }: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const checkSize = () => {
      if (window.innerWidth < 768) setSidebarCollapsed(true);
    };
    checkSize();
    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
  }, []);

  return (
    <div className="app-layout">
      <AppSidebar collapsed={sidebarCollapsed} appName={appName} />
      <div className="app-main">
        <AppHeader
          appName={appName}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <main className="app-content">
          {children}
        </main>
      </div>
    </div>
  );
}