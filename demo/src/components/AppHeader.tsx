import React from "react";
import { Menu } from "lucide-react";

interface Props {
  appName: string;
  onToggleSidebar?: () => void;
}

export default function AppHeader({ appName, onToggleSidebar }: Props) {
  return (
    <header className="app-header">
      <div className="header-left">
        {onToggleSidebar && (
          <button className="header-menu-btn" onClick={onToggleSidebar}>
            <Menu size={20} />
          </button>
        )}
        <h1 className="header-title">{appName}</h1>
      </div>
    </header>
  );
}