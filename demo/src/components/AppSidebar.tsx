import React from "react";
import { routes, RouteItem } from "../routes";
import { ChevronDown } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

interface Props {
  collapsed?: boolean;
  appName: string;
}

function NavItem({ item, depth }: { item: RouteItem; depth: number }) {
  const [open, setOpen] = React.useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const isActive = currentPath === item.path;
  const hasChildren = item.children && item.children.length > 0;
  const Icon = item.icon;

  return (
    <div>
      <button
        onClick={() => hasChildren ? setOpen(!open) : navigate(item.path)}
        className={`sidebar-item ${isActive ? "active" : ""}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {Icon && <Icon size={18} />}
        <span>{item.title}</span>
        {hasChildren && <ChevronDown size={14} className={`sidebar-chevron ${open ? "open" : ""}`} />}
      </button>
      {hasChildren && open && (
        <div>
          {item.children!.map((child, i) => (
            <NavItem key={i} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppSidebar({ collapsed, appName }: Props) {
  return (
    <aside className={`app-sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-brand">
        <span>{appName}</span>
      </div>
      <nav className="sidebar-nav">
        {routes.map((item, i) => (
          <NavItem key={i} item={item} depth={0} />
        ))}
      </nav>
    </aside>
  );
}